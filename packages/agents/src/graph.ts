import { StateGraph, START, END } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import type { LlmSettings } from "@colormax/llm";
import {
  AlignedSongSchema,
  JudgeReportSchema,
  type AlignedSong,
  type CreationPlan,
  type Intent,
  type JobPhase,
  type JudgeReport,
  type SongResult,
  type AgentStreamEvent,
} from "@colormax/schema";
import type { EngineAdapter } from "@colormax/engine";
import { createIntent, createPlan } from "./oracles.ts";
import { alignSong } from "./align.ts";
import { judgeSong, PASS_THRESHOLD, type JudgeDeps } from "./judge.ts";

export interface AgentState {
  prompt: string;
  intent?: Intent;
  plan?: CreationPlan;
  song?: SongResult;
  aligned?: AlignedSong;
  report?: JudgeReport;
  retries: number;
  maxRetries: number;
}

export interface AgentRunContext {
  settings: LlmSettings;
  engine: EngineAdapter;
  onPhase?: (phase: JobPhase, payload?: unknown) => void;
  onEvent?: (evt: AgentStreamEvent) => void; // Stage 6.1：流式细粒度帧透传（不传静默）
  roundId?: string; // 轮次分组键（失败清除/接续）
  judge?: JudgeDeps; // 测试注入
}

export function buildAgentGraph(ctx: AgentRunContext) {
  const graph = new StateGraph<AgentState>({
    channels: {
      prompt: { reducer: (_a: string, b: string) => b },
      intent: { reducer: (_a: Intent | undefined, b: Intent | undefined) => b },
      plan: { reducer: (_a: CreationPlan | undefined, b: CreationPlan | undefined) => b },
      song: { reducer: (_a: SongResult | undefined, b: SongResult | undefined) => b },
      aligned: { reducer: (_a: AlignedSong | undefined, b: AlignedSong | undefined) => b },
      report: { reducer: (_a: JudgeReport | undefined, b: JudgeReport | undefined) => b },
      retries: { reducer: (_a: number | undefined, b: number) => b },
      maxRetries: { reducer: (_a: number | undefined, b: number) => b },
    },
  })
    .addNode("intentNode", async (s: AgentState) => {
      ctx.onPhase?.("intent");
      const intent = await createIntent(ctx.settings, s.prompt, ctx.onEvent);
      ctx.onPhase?.("intent", intent);
      return { intent };
    })
    .addNode("planNode", async (s: AgentState) => {
      ctx.onPhase?.("plan");
      const plan = await createPlan(ctx.settings, s.prompt, s.intent!, ctx.onEvent);
      ctx.onPhase?.("plan", plan);
      return { plan };
    })
    .addNode("dispatchNode", async (s: AgentState) => {
      ctx.onPhase?.("dispatch");
      const t0 = Date.now();
      ctx.onEvent?.({ type: "tool_call", callId: "dispatch", node: "dispatch", tool: "subagentDispatch", op: "start", level: "info" });
      await new Promise((r) => setTimeout(r, 120)); // subagent 派发节拍（可观测）
      ctx.onEvent?.({
        type: "tool_call", callId: "dispatch", node: "dispatch", tool: "subagentDispatch", op: "end", level: "info",
        ms: Date.now() - t0, message: `派发 suno-subagent：《${s.plan?.title ?? ""}》seed=${s.plan?.seed ?? "-"} · 重派第 ${s.retries} 轮`,
      });
      return {};
    })
    .addNode("sunoNode", async (s: AgentState) => {
      ctx.onPhase?.("suno");
      const plan = s.plan!;
      const song = await ctx.engine.render(
        {
          title: plan.title,
          lyrics: plan.structure.map((x) => x.lyrics),
          arrangement: plan.arrangement,
          seed: plan.seed,
          durationSec: plan.intent.durationSec,
        },
        { emit: ctx.onEvent, callId: randomUUID() },
      );
      ctx.onPhase?.("suno", { audioUrl: song.audioUrl, durationSec: song.durationSec });
      return {
        song: {
          sunoId: `s_${plan.seed}_${Date.now()}`,
          title: plan.title,
          lyrics: plan.structure.map((x) => `${x.name}: ${x.lyrics}`).join("\n"),
          style: plan.intent.style,
          audioUrl: song.audioUrl,
          durationSec: song.durationSec,
          sourceFormat: song.sourceFormat,
        } satisfies SongResult,
      };
    })
    .addNode("alignNode", async (s: AgentState) => {
      ctx.onPhase?.("align");
      const aligned = alignSong(s.plan!, s.song!);
      ctx.onPhase?.("align", aligned);
      return { aligned };
    })
    .addNode(
      "judgeNode",
      async (s: AgentState) => {
        ctx.onPhase?.("judge");
        const deps: JudgeDeps = ctx.judge
          ? { ...ctx.judge, onEvent: ctx.onEvent }
          : { settings: ctx.settings, onEvent: ctx.onEvent };
        const report = await judgeSong(deps, s.aligned!, s.retries);
        const nextRetries = report.verdict === "retry" ? s.retries + 1 : s.retries;
        ctx.onEvent?.({
          type: "tool_call", callId: "ruleChecks", node: "judge", tool: "ruleChecks", op: "end",
          level: report.rules.every((r) => !r.blocking || r.passed) ? "info" : "warn",
          message: report.rules.map((r) => `${r.passed ? "✓" : "✗"} ${r.name}${r.blocking ? "" : "（软）"}${r.note ? " " + r.note : ""}`).join("\n"),
        });
        ctx.onPhase?.("judge", report);
        return { report, retries: nextRetries };
      },
      { ends: ["deliverNode", "dispatchNode"] },
    )
    .addNode("deliverNode", async () => {
      ctx.onPhase?.("deliver");
      return {};
    })
    .addEdge(START, "intentNode")
    .addEdge("intentNode", "planNode")
    .addEdge("planNode", "dispatchNode")
    .addEdge("dispatchNode", "sunoNode")
    .addEdge("sunoNode", "alignNode")
    .addEdge("alignNode", "judgeNode")
    .addConditionalEdges("judgeNode", (s: AgentState) => {
      if (s.report?.verdict === "pass") return "deliverNode";
      if (s.retries < s.maxRetries) return "dispatchNode"; // 重派（新 seed 变体由引擎注入）
      return "deliverNode";
    })
    .addEdge("deliverNode", END);

  return graph.compile();
}

/** 运行一次创作任务；phase 事件经 onPhase 回调流出（供 jobs 层转 SSE） */
export async function runAgent(
  args: {
    prompt: string;
    settings: LlmSettings;
    engine: EngineAdapter;
    onPhase?: (phase: JobPhase, payload?: unknown) => void;
    onEvent?: (evt: AgentStreamEvent) => void;
    roundId?: string;
    judge?: JudgeDeps;
    maxRetries?: number;
  },
): Promise<{ aligned: AlignedSong; report: JudgeReport }> {
  const app = buildAgentGraph(args);
  const state = await app.invoke({
    prompt: args.prompt,
    retries: 0,
    maxRetries: args.maxRetries ?? 3,
  });
  const aligned = AlignedSongSchema.parse(state.aligned);
  const report = JudgeReportSchema.parse(state.report);
  return { aligned, report };
}

export { PASS_THRESHOLD };
