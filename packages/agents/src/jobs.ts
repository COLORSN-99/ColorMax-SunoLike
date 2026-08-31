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

export class JobStore {
  private jobs = new Map<string, Job>();
  private rt = new Map<string, JobRuntime>();
  private cap: number;

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
      const cut = r.history.findIndex((e) => e.type !== "done" && e.type !== "failed");
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
   * 启动任务执行：运行 Agent 图，事件（phase/流式帧/done/failed）同步入历史+emit。
   * onEvent：graph/adapter 细粒度流式事件（llm_thinking/tool_call/suno_progress）透传口。
   */
  async run(jobId: string, args: {
    prompt: string;
    settings: LlmSettings;
    engine: EngineAdapter;
    maxRetries?: number;
    judge?: Parameters<typeof runAgent>[0]["judge"];
    roundId?: string;
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
    try {
      const { aligned, report } = await runAgent({
        prompt: args.prompt,
        settings: args.settings,
        engine: args.engine,
        maxRetries: args.maxRetries,
        judge: args.judge,
        onPhase: emitPhase,
        onEvent,
        roundId,
      });
      patch({ phase: "deliver", status: "done", result: aligned, report });
      this.emit(jobId, roundId, { type: "done", result: aligned, report });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      const failPhase = this.jobs.get(jobId)?.phase ?? "failed";
      patch({ phase: "failed", status: "failed", error: err });
      this.emit(jobId, roundId, { type: "failed", error: err, phase: failPhase });
    }
  }
}

export const jobStore = new JobStore();
