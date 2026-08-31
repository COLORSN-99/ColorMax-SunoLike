import { randomUUID } from "node:crypto";
import { chatCompletion, type ChatMessage, type ChatResult, type LlmSettings } from "@colormax/llm";
import type { AgentStreamEvent, LlmThinkingEvent } from "@colormax/schema";

export type StreamEmitter = (evt: AgentStreamEvent) => void;

type FrameOpts = {
  onEvent?: StreamEmitter;
  node: LlmThinkingEvent["node"];
  /** 同一逻辑步骤多次调用（如 plan 自修复重试）共享 callId 续帧：传入既有 callId */
  callId?: string;
};

/**
 * 带思考帧的 LLM 调用（Stage 6.1【1】）：
 * 请求流式；正文/推理链增量按 80ms/240 字符节流为 llm_thinking delta 帧；
 * start/delta/end 帧 seq 单调；end 携带耗时。不传 onEvent → 纯调用零开销。
 */
export async function llmThinkingCall(
  settings: LlmSettings,
  messages: ChatMessage[],
  opts: FrameOpts & { temperature?: number; model?: string; maxTokens?: number; thinking?: boolean },
): Promise<ChatResult> {
  const emit = opts.onEvent;
  if (!emit) return chatCompletion(settings, messages, opts);
  const callId = opts.callId ?? randomUUID();
  const t0 = Date.now();
  const frame = (op: LlmThinkingEvent["op"], patch: { delta?: string; channel?: "reasoning" | "content"; ms?: number } = {}) =>
    emit({ type: "llm_thinking", callId, node: opts.node, op, ...patch });
  frame("start");
  let buf = "";
  let bReason = "";
  let last = 0;
  const flush = () => {
    if (!buf && !bReason) return;
    if (buf) {
      frame("delta", { delta: buf, channel: "content" });
      buf = "";
    }
    if (bReason) {
      frame("delta", { delta: bReason, channel: "reasoning" });
      bReason = "";
    }
    last = Date.now();
  };
  const collect = (channel: "content" | "reasoning", t: string) => {
    if (channel === "content") buf += t;
    else bReason += t;
    if (Date.now() - last >= 80 || buf.length + bReason.length >= 240) flush();
  };
  try {
    const res = await chatCompletion(settings, messages, {
      temperature: opts.temperature,
      model: opts.model,
      maxTokens: opts.maxTokens,
      thinking: opts.thinking,
      stream: true,
      onChunk: (t) => collect("content", t),
      onReasoning: (t) => collect("reasoning", t),
    });
    flush();
    frame("end", { ms: Date.now() - t0 });
    return res;
  } catch (e) {
    flush();
    frame("end", { ms: Date.now() - t0 });
    throw e;
  }
}
