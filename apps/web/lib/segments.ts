/**
 * 对话流 segment 模型与事件 reducer（Stage 6.1，纯函数——node:test 可测，无 DOM 依赖）
 * assistant 消息 = segments 序列：thinking（LLM 流式思考）/ terminal（工具执行）/
 * suno（生成进度）/ plan·judge·result（卡片）/ error（结构化失败，raw 只入调试区）
 */

export type Segment =
  | { kind: "text"; text: string }
  | {
      kind: "thinking";
      callId: string;
      node: string;
      content: string;
      reasoning: string;
      ms?: number;
      streaming: boolean;
    }
  | {
      kind: "terminal";
      callId: string;
      tool: string;
      node: string;
      lines: string[];
      status: "running" | "ok" | "error";
      ms?: number;
    }
  | {
      kind: "suno";
      callId: string;
      stage: string;
      done: number;
      total: number;
      status: string;
      elapsedMs: number;
      note?: string;
    }
  | { kind: "plan"; plan: Record<string, unknown> }
  | { kind: "judge"; report: unknown }
  | { kind: "result"; song: { title: string; audioUrl: string; durationSec: number; sourceFormat: string }; jobId?: string }
  | {
      kind: "error";
      roundId: string;
      headline: string;
      category: string;
      steps: string[];
      resolvableByCli: boolean;
      cliSuggestion?: string;
      raw: string;
      reviewStreaming: boolean;
      reviewText: string;
    };

/** 对话消息（R2 持久化单元）：assistant 消息携带 jobId/lastSeq 支持刷新续播与补帧 */
export interface Msg {
  id: string;
  role: "user" | "assistant";
  jobId?: string;
  roundId?: string;
  lastSeq?: number;
  segments: Segment[];
}

/** SSE 事件（后端 JobEvent 信封去壳后的帧体）——宽松结构，reducer 只取所需字段 */export interface Evt {
  type: string;
  phase?: string;
  payload?: unknown;
  callId?: string;
  node?: string;
  op?: string;
  channel?: string;
  delta?: string;
  ms?: number;
  tool?: string;
  level?: string;
  message?: string;
  stage?: string;
  done?: number;
  total?: number;
  status?: string;
  elapsedMs?: number;
  note?: string;
  result?: { song?: Record<string, unknown> } & Record<string, unknown>;
  report?: unknown;
  error?: string;
  roundId?: string;
  jobId?: string;
  // error_review（Step 6）
  category?: string;
  resolvableByCli?: boolean;
  cliSuggestion?: string;
  headline?: string;
  steps?: string[];
}

const findIdx = (segs: Segment[], pred: (s: Segment) => boolean) => {
  for (let i = segs.length - 1; i >= 0; i--) if (pred(segs[i])) return i;
  return -1;
};

const PHASE_LABEL: Record<string, string> = {
  intent: "意图分析", plan: "创作规划", dispatch: "派发 Sub-Agent", suno: "Suno 出歌",
  align: "对齐建模", judge: "效果评判", deliver: "交付",
};
export { PHASE_LABEL };

/**
 * 应用一帧事件 → 新 segments（不可变）。
 * failed：本轮 workflow 节点（thinking/terminal/suno）清除（用户拍板：raw 错误不进对话流，
 * error 卡只留调试折叠区）；error_review/error_review_delta 在 Step 6 接线。
 */
export function applyEvent(segs: Segment[], e: Evt): Segment[] {
  switch (e.type) {
    case "llm_thinking": {
      const callId = e.callId ?? "x";
      const i = segs.findIndex((s) => s.kind === "thinking" && s.callId === callId);
      const base: Segment = { kind: "thinking", callId, node: e.node ?? "", content: "", reasoning: "", streaming: true };
      const cur = i >= 0 ? segs[i] : base;
      if (cur.kind !== "thinking") return segs;
      let { content, reasoning, ms, streaming } = cur;
      if (e.op === "delta" && e.delta) {
        if (e.channel === "reasoning") reasoning += e.delta;
        else content += e.delta;
      }
      if (e.op === "end") {
        streaming = false;
        ms = e.ms;
      }
      const next: Segment = { ...cur, content, reasoning, ms, streaming };
      return i >= 0 ? segs.map((s, j) => (j === i ? next : s)) : [...segs, next];
    }
    case "tool_call": {
      const callId = e.callId ?? "x";
      const i = segs.findIndex((s) => s.kind === "terminal" && s.callId === callId && s.tool === e.tool);
      const cur: Segment =
        i >= 0
          ? segs[i]
          : { kind: "terminal", callId, tool: e.tool ?? "tool", node: e.node ?? "", lines: [], status: "running" };
      if (cur.kind !== "terminal") return segs;
      const lines = [...cur.lines];
      if (e.op === "start") lines.push(`$ ${e.tool} (${e.node})`);
      else if (e.op === "log" && e.message) lines.push(`… ${e.message}`);
      else if (e.op === "end") {
        if (e.message) for (const l of String(e.message).split("\n")) lines.push(e.level === "error" ? `! ${l}` : `· ${l}`);
        if (e.ms !== undefined) lines.push(`✓ ${e.tool} 完成（${e.ms}ms）`);
      }
      const status: "running" | "ok" | "error" =
        e.op === "end" ? (e.level === "error" ? "error" : "ok") : cur.status;
      const next: Segment = { ...cur, lines, status, ms: e.ms ?? cur.ms };
      return i >= 0 ? segs.map((s, j) => (j === i ? next : s)) : [...segs, next];
    }
    case "suno_progress": {
      const callId = e.callId ?? "x";
      const i = segs.findIndex((s) => s.kind === "suno" && s.callId === callId);
      const next: Segment = {
        kind: "suno", callId, stage: e.stage ?? "poll", done: e.done ?? 0, total: e.total ?? 0,
        status: e.status ?? "streaming", elapsedMs: e.elapsedMs ?? 0, note: e.note,
      };
      return i >= 0 ? segs.map((s, j) => (j === i ? next : s)) : [...segs, next];
    }
    case "phase": {
      const out = [...segs];
      const ph = e.phase ?? "";
      const p = e.payload as Record<string, unknown> | undefined;
      if (p && typeof p === "object") {
        if (ph === "intent" && p.theme)
          out.push({ kind: "text", text: `意图分析：${p.theme} · ${p.mood} · ${p.style} · ${p.durationSec}s` });
        if (ph === "plan" && p.title) {
          const arr = p.arrangement as Record<string, unknown> | undefined;
          const st = p.structure as unknown[] | undefined;
          out.push({
            kind: "text",
            text: `创作规划：《${p.title}》${arr?.key ?? "-"} 调·${arr?.bpm ?? "-"}bpm·${st?.length ?? "-"} 段·seed=${p.seed ?? "-"}`,
          });
          out.push({ kind: "plan", plan: p });
        }
        if (ph === "suno" && p.audioUrl)
          out.push({ kind: "text", text: `出歌完成：${p.durationSec}s` });
        if (ph === "judge" && (p as { score?: number }).score !== undefined)
          out.push({ kind: "judge", report: p });
        if (ph === "align" && p.alignment) {
          const al = p.alignment as Record<string, number>;
          out.push({ kind: "text", text: `对齐建模：主题${al.theme} 情绪${al.mood} 风格${al.style} 时长${al.duration} 结构${al.structure}` });
        }
      }
      return out;
    }
    case "done": {
      const song = (e.result as { song?: Record<string, unknown> } | undefined)?.song;
      const out = [...segs];
      if (song)
        out.push({
          kind: "result",
          jobId: e.jobId,
          song: {
            title: String(song.title ?? ""),
            audioUrl: String(song.audioUrl ?? ""),
            durationSec: Number(song.durationSec ?? 0),
            sourceFormat: String(song.sourceFormat ?? ""),
          },
        });
      out.push({ kind: "text", text: "✓ 交付完成" });
      return out;
    }
    case "failed": {
      const roundId = e.roundId ?? "x";
      const cleared = segs.filter((s) => s.kind !== "thinking" && s.kind !== "terminal" && s.kind !== "suno");
      cleared.push({
        kind: "error",
        roundId,
        headline: "任务执行失败",
        category: "unknown",
        steps: ["正在评审错误…"],
        resolvableByCli: false,
        raw: e.error ?? "",
        reviewStreaming: true,
        reviewText: "",
      });
      return cleared;
    }
    case "error_review_delta": {
      const i = findIdx(segs, (s) => s.kind === "error");
      if (i < 0) return segs;
      const cur = segs[i];
      if (cur.kind !== "error") return segs;
      return segs.map((s, j) => (j === i ? { ...cur, reviewText: cur.reviewText + (e.delta ?? "") } : s));
    }
    case "error_review": {
      const i = findIdx(segs, (s) => s.kind === "error");
      if (i < 0) return segs;
      const cur = segs[i];
      if (cur.kind !== "error") return segs;
      return segs.map((s, j) =>
        j === i
          ? {
              ...cur,
              headline: e.headline || cur.headline,
              category: e.category ?? cur.category,
              steps: e.steps?.length ? e.steps : cur.steps,
              resolvableByCli: Boolean(e.resolvableByCli),
              cliSuggestion: e.cliSuggestion,
              reviewStreaming: false,
            }
          : s,
      );
    }
    case "state_saved":
    case "resume_applied":
    case "status":
      return segs;
    default:
      return segs; // 未知事件向前兼容：忽略
  }
}
