import { randomUUID } from "node:crypto";
import type { LlmSettings } from "@colormax/llm";
import type { EngineAdapter } from "@colormax/engine";
import type { Job, JobPhase, JudgeReport, AlignedSong } from "@colormax/schema";
import { runAgent } from "./graph.ts";

export type JobEvent = { id: string; jobId: string; t: number } & (
  | { type: "phase"; phase: JobPhase; payload?: unknown }
  | { type: "done"; result: AlignedSong; report: JudgeReport }
  | { type: "failed"; error: string }
);

type Listener = (e: JobEvent) => void;

export class JobStore {
  private jobs = new Map<string, Job>();
  private listeners = new Map<string, Set<Listener>>();

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
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  private emit(e: JobEvent) {
    for (const cb of this.listeners.get(e.jobId) ?? []) cb(e);
  }

  subscribe(jobId: string, cb: Listener): () => void {
    const set = this.listeners.get(jobId) ?? new Set();
    set.add(cb);
    this.listeners.set(jobId, set);
    return () => {
      set.delete(cb);
    };
  }

  /** 启动任务执行：运行 Agent 图，阶段/完成/失败事件同步 emit */
  async run(jobId: string, args: {
    prompt: string;
    settings: LlmSettings;
    engine: EngineAdapter;
    maxRetries?: number;
    judge?: Parameters<typeof runAgent>[0]["judge"];
  }): Promise<void> {
    const patch = (p: Partial<Job>) => {
      const cur = this.jobs.get(jobId);
      if (!cur) return;
      const next = { ...cur, ...p, updatedAt: new Date().toISOString() } as Job;
      this.jobs.set(jobId, next);
    };
    patch({ status: "running" });
    const emitPhase = (phase: JobPhase, payload?: unknown) => {
      patch({ phase, payload });
      this.emit({ id: randomUUID(), jobId, t: Date.now(), type: "phase", phase, payload });
    };
    try {
      const { aligned, report } = await runAgent({
        prompt: args.prompt,
        settings: args.settings,
        engine: args.engine,
        maxRetries: args.maxRetries,
        judge: args.judge,
        onPhase: emitPhase,
      });
      patch({ phase: "deliver", status: "done", result: aligned, report });
      this.emit({ id: randomUUID(), jobId, t: Date.now(), type: "done", result: aligned, report });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      patch({ phase: "failed", status: "failed", error: err });
      this.emit({ id: randomUUID(), jobId, t: Date.now(), type: "failed", error: err });
    }
  }
}

export const jobStore = new JobStore();
