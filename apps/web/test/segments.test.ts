import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEvent, type Segment } from "../lib/segments.ts";
import { parseSseBuffer } from "../lib/sse.ts";

test("S6-T7 reducer：thinking 双通道累积 / terminal 状态机 / suno 进度原位更新", () => {
  let segs: Segment[] = [];
  segs = applyEvent(segs, { type: "llm_thinking", callId: "c1", node: "intent", op: "start" });
  segs = applyEvent(segs, { type: "llm_thinking", callId: "c1", node: "intent", op: "delta", channel: "reasoning", delta: "分析" });
  segs = applyEvent(segs, { type: "llm_thinking", callId: "c1", node: "intent", op: "delta", channel: "content", delta: "{\"theme\"" });
  segs = applyEvent(segs, { type: "llm_thinking", callId: "c1", node: "intent", op: "delta", channel: "content", delta: ":" });
  segs = applyEvent(segs, { type: "llm_thinking", callId: "c1", node: "intent", op: "end", ms: 1234 });
  assert.equal(segs.length, 1);
  const t = segs[0];
  assert.ok(t.kind === "thinking");
  assert.equal(t.reasoning, "分析");
  assert.equal(t.content, '{"theme":');
  assert.equal(t.streaming, false);
  assert.equal(t.ms, 1234);

  // 两个并行 tool 调用不串台
  segs = applyEvent(segs, { type: "tool_call", callId: "s1", node: "suno", tool: "quotaCheck", op: "start", level: "info" });
  segs = applyEvent(segs, { type: "tool_call", callId: "s1", node: "suno", tool: "decrypt", op: "start", level: "info" });
  segs = applyEvent(segs, { type: "tool_call", callId: "s1", node: "suno", tool: "quotaCheck", op: "end", level: "info", ms: 5, message: "剩余 credits：10" });
  const terms = segs.filter((s) => s.kind === "terminal");
  assert.equal(terms.length, 2);
  const q = terms.find((s) => s.kind === "terminal" && s.tool === "quotaCheck");
  assert.ok(q?.kind === "terminal" && q.status === "ok");

  // suno_progress 原位更新（同 callId 单块）
  segs = applyEvent(segs, { type: "suno_progress", callId: "s1", stage: "poll", done: 0, total: 2, status: "streaming", elapsedMs: 5000 });
  segs = applyEvent(segs, { type: "suno_progress", callId: "s1", stage: "poll", done: 1, total: 2, status: "streaming", elapsedMs: 9000 });
  const sunoSegs = segs.filter((s) => s.kind === "suno");
  assert.equal(sunoSegs.length, 1);
  const sp = sunoSegs[0];
  assert.ok(sp?.kind === "suno" && sp.done === 1 && sp.elapsedMs === 9000);
});

test("S6-T7 reducer：failed 清除本轮 workflow 段（thinking/terminal/suno），error 保留 raw 于调试区", () => {
  let segs: Segment[] = [
    { kind: "text", text: "意图分析：x" },
    { kind: "thinking", callId: "c", node: "intent", content: "", reasoning: "r", streaming: false },
    { kind: "terminal", callId: "t", tool: "download", node: "suno", lines: ["a"], status: "running" },
    { kind: "suno", callId: "t", stage: "poll", done: 0, total: 2, status: "streaming", elapsedMs: 1 },
    { kind: "plan", plan: { title: "keep" } },
  ];
  // 真实服务端顺序：state_saved→error_review_delta*→error_review→failed
  segs = applyEvent(segs, { type: "error_review_delta", callId: "e", delta: "评审中…" }); // 无卡即时建卡（流式）
  const created = segs.find((s) => s.kind === "error");
  assert.ok(created?.kind === "error" && created.reviewStreaming === true, "delta 即时建卡为流式");
  segs = applyEvent(segs, { type: "error_review", callId: "e", category: "quota", resolvableByCli: false, headline: "Suno 配额不足", steps: ["等待恢复"] });
  segs = applyEvent(segs, { type: "failed", error: "HTTP 429 too many", roundId: "r1" });
  const kinds = segs.map((s) => s.kind);
  assert.ok(!kinds.includes("thinking") && !kinds.includes("terminal") && !kinds.includes("suno"), "本轮 workflow 节点清除");
  assert.ok(kinds.includes("plan"), "交付类卡片保留");
  const err = segs.find((s) => s.kind === "error");
  assert.ok(err?.kind === "error" && err.raw === "HTTP 429 too many" && err.reviewStreaming === false, "failed 终态收敛入既有卡");
  // 无前置评审帧：failed 独立建卡（降级路径）
  const bare = applyEvent([{ kind: "text", text: "t" }], { type: "failed", error: "boom", roundId: "r2" });
  const errBare = bare.find((s) => s.kind === "error");
  assert.ok(errBare?.kind === "error" && errBare.raw === "boom" && errBare.reviewStreaming === false);
  // 评审终态字段在 failed 收敛后保留
  assert.ok(err?.kind === "error" && err.category === "quota" && err.steps[0] === "等待恢复" && err.reviewText === "评审中…");
});

test("S6-T8 SSE 帧解析：多帧/跨读残帧/id 行/多行 data 合并", () => {
  const raw = 'id: 5\nevent: phase\ndata: {"phase":"suno"}\n\nevent: llm_thinking\ndata: {"delta":"a"}\ndata: {"more\ndata:b}\n\npartial-no-blankline';
  const { frames, rest } = parseSseBuffer(raw);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].id, "5");
  assert.equal(frames[0].event, "phase");
  assert.equal(frames[1].event, "llm_thinking");
  assert.equal(frames[1].data, '{"delta":"a"}\n{"more\nb}');
  assert.equal(rest, "partial-no-blankline");
});
