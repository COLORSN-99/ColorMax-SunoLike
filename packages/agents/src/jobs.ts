import { randomUUID } from "node:crypto";
import type { LlmSettings } from "@colormax/llm";
import type { EngineAdapter } from "@colormax/engine";
import type {
  Job,
  JobPhase,
  JudgeReport,
  AlignedSong,
  AgentStreamEvent,
} from "@colormax/schema";
import { runAgent } from "./graph.ts";
import { reviewFailure } from "./review.ts";
import type { AgentState } from "./graph.ts";

/** 信封：seq（任务内单调）+ roundId（轮次——失败清除/接续的分组键） */
export type JobEventEnvelope = {
  id: string;
  jobId: string;
  t: number;
  seq: number;
  roundId: string;
};

export type JobEventBody =
  | { type: "phase"; phase: JobPhase; payload?: unknown }
  | { type: "done"; result: AlignedSong; report: JudgeReport }
  | { type: "failed"; error: string; phase: JobPhase; causeKind?: string }
  | AgentStreamEvent;

export type JobEvent = JobEventEnvelope & JobEventBody;

type Listener = (e: JobEvent) => void;

const HISTORY_CAP = 2000;

interface JobRuntime {
  history: JobEvent[];
  seq: number;
  listeners: Set<Listener>;
  dropped: number; // 环形截断丢弃计数（可观测）
}

/** 失败快照（同进程内存接续——用户拍板，不写 DB/文件） */
export interface FailureSnapshot {
  prompt: string;
  settings: LlmSettings;
  engine: EngineAdapter;
  maxRetries?: number;
  seed: Partial<AgentState>;
  failPhase: JobPhase;
  error: string;
  causeKind?: string;
}

export class JobStore {
  private jobs = new Map<string, Job>();
  private rt = new Map<string, JobRuntime>();
  private cap: number;
  private resumeCache = new Map<string, FailureSnapshot>();

  constructor(cap = HISTORY_CAP) {
    this.cap = cap;
  }

  create(sessionId: string): Job {
    const now = new Date().toISOString();
    const job: Job = {
      id: randomUUID(),
      sessionId,
      phase: "intent",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    this.rt.set(job.id, { history: [], seq: 0, listeners: new Set(), dropped: 0 });
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /** 事件历史（seq > after 的补帧切片）——刷新续播/断线重连底座 */
  historyAfter(jobId: string, after = 0): JobEvent[] {
    const r = this.rt.get(jobId);
    if (!r) return [];
    return r.history.filter((e) => e.seq > after);
  }

  subscribe(jobId: string, cb: Listener): () => void {
    const r = this.rt.get(jobId);
    if (!r) return () => undefined;
    r.listeners.add(cb);
    return () => {
      r.listeners.delete(cb);
    };
  }

  /** 统一发射点：封 seq/roundId → 入历史环 → 推 live 订阅者 */
  private emit(jobId: string, roundId: string, evt: JobEventBody): JobEvent | undefined {
    const r = this.rt.get(jobId);
    if (!r) return undefined;
    const full = {
      id: randomUUID(),
      jobId,
      t: Date.now(),
      seq: ++r.seq,
      roundId,
      ...evt,
    } as JobEvent;
    r.history.push(full);
    if (r.history.length > this.cap) {
      // 环形截断：丢最旧，但 done/failed/state_saved 终态帧永驻
      const cut = r.history.findIndex((e) => e.type !== "done" && e.type !== "failed" && e.type !== "state_saved");
      if (cut >= 0) {
        r.history.splice(cut, 1);
        r.dropped++;
      } else {
        r.history.shift();
        r.dropped++;
      }
    }
    for (const cb of r.listeners) cb(full);
    return full;
  }

  /**
   * 启动任务执行（或接续）：运行 Agent 图，事件（phase/流式帧/done/failed）同步入历史+emit。
   * 失败编排（Stage 6.2【4】）：捕获快照 → state_saved → LLM 评审（error_review_delta/*）→ failed(causeKind)。
   * raw error 不进事件用户面（error 字段保留兼容，前端藏调试区）。
   */
  async run(jobId: string, args: {
    prompt: string;
    settings: LlmSettings;
    engine: EngineAdapter;
    maxRetries?: number;
    judge?: Parameters<typeof runAgent>[0]["judge"];
    roundId?: string;
    resumeFrom?: JobPhase; // 接续落点
    seed?: Partial<AgentState>; // 接续种子
  }): Promise<void> {
    const r = this.rt.get(jobId);
    if (!r) return;
    const roundId = args.roundId ?? randomUUID();
    const patch = (p: Partial<Job>) => {
      const cur = this.jobs.get(jobId);
      if (!cur) return;
      const next = { ...cur, ...p, updatedAt: new Date().toISOString() } as Job;
      this.jobs.set(jobId, next);
    };
    patch({ status: "running" });
    const emitPhase = (phase: JobPhase, payload?: unknown) => {
      patch({ phase, payload });
      this.emit(jobId, roundId, { type: "phase", phase, payload });
    };
    const onEvent = (evt: AgentStreamEvent) => {
      this.emit(jobId, roundId, evt);
    };
    // 快照累积：每节点产出后更新（供失败接续）
    let snapshot: Partial<AgentState> = { ...args.seed };
    const onSnapshot = (s: AgentState) => {
      snapshot = {
        prompt: s.prompt, intent: s.intent, plan: s.plan, song: s.song,
        aligned: s.aligned, report: s.report, retries: s.retries, maxRetries: s.maxRetries,
      };
    };
    // 接续首帧
    if (args.resumeFrom) this.emit(jobId, roundId, { type: "resume_applied", fromPhase: args.resumeFrom });
    // 失败前序工具上下文（供评审）
    const recentTools = r.history.filter((e) => e.type === "tool_call").slice(-6).map((e) => (e as { tool?: string; message?: string }).tool ?? "");
    try {
      const { aligned, report } = await runAgent({
        prompt: args.prompt,
        settings: args.settings,
        engine: args.engine,
        maxRetries: args.maxRetries,
        judge: args.judge,
        onPhase: emitPhase,
        onEvent,
        onSnapshot,
        roundId,
        resumeAfter: args.resumeFrom,
        seed: args.seed,
      });
      this.resumeCache.delete(jobId); // 成功清快照
      patch({ phase: "deliver", status: "done", result: aligned, report });
      this.emit(jobId, roundId, { type: "done", result: aligned, report });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      const failPhase = (this.jobs.get(jobId)?.phase as JobPhase) ?? "failed";
      // ① 快照就绪（前端据此显示「可接续」；同进程内存——不跨重启）
      this.resumeCache.set(jobId, {
        prompt: args.prompt, settings: args.settings, engine: args.engine, maxRetries: args.maxRetries,
        seed: snapshot, failPhase, error: err,
      });
      this.emit(jobId, roundId, { type: "state_saved", phase: failPhase });
      // ② LLM 评审（raw 不直达；流式 delta + 终态 error_review）
      const review = await reviewFailure(args.settings, { phase: failPhase, error: err, recentTools }, onEvent);
      this.emit(jobId, roundId, review);
      patch({ phase: "failed", status: "failed", error: err });
      this.emit(jobId, roundId, { type: "failed", error: err, phase: failPhase, causeKind: review.category });
    }
  }

  /** 是否可接续（同进程内存有失败快照） */
  canResume(jobId: string): boolean {
    return this.resumeCache.has(jobId);
  }

  /** 失败快照摘要（供 intent 路由与前端展示） */
  resumeInfo(jobId: string): { failPhase: JobPhase; error: string; prompt: string } | null {
    const s = this.resumeCache.get(jobId);
    return s ? { failPhase: s.failPhase, error: s.error, prompt: s.prompt } : null;
  }

  /** 接续失败任务：从快照落点重跑（跳过已完成节点）；engine/settings 可用当下配置覆盖（cookie 已轮换/换端点场景） */
  async resume(jobId: string, override?: { engine?: EngineAdapter; settings?: LlmSettings }): Promise<void> {
    const snap = this.resumeCache.get(jobId);
    if (!snap) return;
    await this.run(jobId, {
      prompt: snap.prompt,
      settings: override?.settings ?? snap.settings,
      engine: override?.engine ?? snap.engine,
      maxRetries: snap.maxRetries,
      resumeFrom: snap.failPhase,
      seed: snap.seed,
    });
  }

  /** 放弃接续（switch/cancel：清除快照） */
  dropResume(jobId: string): void {
    this.resumeCache.delete(jobId);
  }
}

export const jobStore = new JobStore();
