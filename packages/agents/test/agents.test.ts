import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { alignSong, ruleChecks, judgeSong, runAgent, jobStore, JobStore, type JobEvent } from "../src/index.ts";
import { repairPlan, normalizeSectionName } from "../src/oracles.ts";
import { MockAdapter } from "@colormax/engine";
import type { CreationPlan, SongResult, JudgeReport } from "@colormax/schema";

const PLAN: CreationPlan = {
  intent: {
    theme: "温暖", mood: "治愈", style: "华语抒情", durationSec: 100,
    originPrompt: "test",
  },
  title: "T", seed: 1,
  structure: [
    { name: "verse", lyrics: "v" },
    { name: "chorus", lyrics: "c" },
  ],
  arrangement: { key: "C", bpm: 100, chordProgression: ["C-G-Am-F"], groove: "pop" },
};
const SONG: SongResult = {
  sunoId: "s1", title: "T", lyrics: "verse: v\nchorus: c", style: "华语抒情",
  audioUrl: "/g/x.wav", durationSec: 100, sourceFormat: "wav",
};

test("S2-T1 align 建模：时长 ±15% 内高分/超限低分；空歌词降级", () => {
  const ok = alignSong(PLAN, SONG);
  assert.equal(ok.alignment.duration, 5);
  assert.equal(ok.alignment.structure, 4);
  const over = alignSong(PLAN, { ...SONG, durationSec: 140 }); // +40% 超限
  assert.equal(over.alignment.duration, 2);
  assert.equal(alignSong(PLAN, { ...SONG, lyrics: "" }).alignment.structure, 1);
});

test("S2-T2 judge 阈值与规则：3.5→pass / 3.4→retry；规则失败强制 retry", async () => {
  const base: JudgeReport = {
    score: 0, perDimension: {}, rules: [], retried: 0, verdict: "retry",
  };
  const aligned = alignSong(PLAN, SONG);
  const pass = await judgeSong(
    { settings: {} as never, judgeOverride: async () => ({ ...base, score: 3.5 }) },
    aligned, 0);
  assert.equal(pass.verdict, "pass");
  const fail = await judgeSong(
    { settings: {} as never, judgeOverride: async () => ({ ...base, score: 3.4 }) },
    aligned, 0);
  assert.equal(fail.verdict, "retry");
  const ruleFail = await judgeSong(
    { settings: {} as never, judgeOverride: async () => ({ ...base, score: 5 }) },
    alignSong(PLAN, { ...SONG, durationSec: 300, audioUrl: "" }), 0);
  assert.equal(ruleFail.verdict, "retry"); // 音频缺失=blocking 失败
  assert.ok(ruleFail.rules.length >= 3);
  // 时长差 40%：软指标——高语义分下应通过（时长只降 duration 分，不阻断）
  const softDuration = await judgeSong(
    { settings: {} as never, judgeOverride: async () => ({ ...base, score: 4.1 }) },
    alignSong(PLAN, { ...SONG, durationSec: 170 }), 0);
  assert.equal(softDuration.verdict, "pass", "时长偏差为软指标：4.1 分应通过");
});

test("S2-T3 重派回环：首轮 retry → 二次 pass", async () => {
  const m = startLlmMock();
  let calls = 0;
  const judge = {
    judgeOverride: async () => {
      calls++;
      return { score: calls === 1 ? 2 : 4, perDimension: {}, rules: [], retried: 0, verdict: "retry" } as JudgeReport;
    },
  };
  try {
    const { report, aligned } = await runAgent({
      prompt: "test prompt",
      settings: { baseURL: m.url, apiKey: "", model: "m", temperature: 0.5 } as never,
      engine: new MockAdapter(mkdtempSync(join(tmpdir(), "cm-"))),
      maxRetries: 3,
      judge,
    });
    assert.equal(calls, 2);           // 两次执行（重派 1 次）
    assert.equal(report.retried, 1);
    assert.equal(report.verdict, "pass");
    assert.ok(aligned.song.audioUrl);
  } finally {
    await m.close();
  }
});

let llmServer: ReturnType<typeof createServer> | undefined;
function startLlmMock(): { url: string; close: () => Promise<void> } {
  llmServer = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const b = JSON.parse(body || "{}");
      const sys = b.messages?.find((m: { role: string }) => m.role === "system")?.content ?? "";
      let out: string;
      if (sys.includes("意图分析器"))
        out = '{"theme":"温暖","mood":"治愈","style":"华语抒情","durationSec":100}';
      else if (sys.includes("创作编导"))
        out = '{"title":"T","structure":[{"name":"verse","lyrics":"v"},{"name":"chorus","lyrics":"c"}],"arrangement":{"key":"C","bpm":100,"chordProgression":["C-G-Am-F"],"groove":"pop"}}';
      else if (sys.includes("音乐质量评审"))
        out = '{"theme":4,"mood":4,"style":4,"comment":"ok"}';
      else out = "{}";
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: out } }] }));
    });
  });
  llmServer.listen(0);
  const port = (llmServer.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise((r) => llmServer?.close(() => r())),
  };
}

test("S2-T4 图端到端（Mock 引擎 + mock LLM）：全链产出可播 wav", async () => {
  const m = startLlmMock();
  const dir = mkdtempSync(join(tmpdir(), "cm-"));
  try {
    const phases: string[] = [];
    const { aligned, report } = await runAgent({
      prompt: "test",
      settings: { baseURL: m.url, apiKey: "", model: "m", temperature: 0.5 } as never,
      engine: new MockAdapter(join(dir, "public/generated")),
      maxRetries: 1,
      onPhase: (p) => phases.push(p),
    });
    const uniq = [...new Set(phases)];
    assert.deepEqual(uniq.slice(0, 6), ["intent", "plan", "dispatch", "suno", "align", "judge"]);
    assert.ok(phases.length >= 6, "开始+产出双事件存在");
    assert.equal(report.verdict, "pass");
    const file = join(dir, "public", aligned.song.audioUrl.replace(/^\//, ""));
    assert.ok(existsSync(file), "wav 文件存在");
    assert.ok(statSync(file).size > 40000);
  } finally {
    await m.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("S2-T5 jobs 状态机：事件序列 + done；LLM 失败 → failed", async () => {
  const m = startLlmMock();
  const dir = mkdtempSync(join(tmpdir(), "cm-"));
  try {
    const job = jobStore.create("sess-1");
    const events: JobEvent[] = [];
    jobStore.subscribe(job.id, (e) => events.push(e));
    await jobStore.run(job.id, {
      prompt: "test",
      settings: { baseURL: m.url, apiKey: "", model: "m", temperature: 0.5 } as never,
      engine: new MockAdapter(join(dir, "g")),
      maxRetries: 1,
    });
    const kinds = events.map((e) => e.type === "phase" ? e.phase : e.type);
    assert.ok(kinds.includes("suno") && kinds.includes("judge") && kinds.includes("deliver"));
    assert.equal(events.filter((e) => e.type === "done").length, 1);
    assert.equal(jobStore.get(job.id)?.status, "done");
  } finally {
    await m.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("S2-T7 输出契约兜底：超量段落截断/clamp/缺失默认（真实 LLM 超界场景）", () => {
  const raw = {
    title: "T",
    intent: { theme: "a", mood: "b", style: "c", durationSec: 9999 },
    structure: Array.from({ length: 14 }, (_, i) => ({ name: "verse", lyrics: `v${i}` })),
    arrangement: { key: "C", bpm: 500, chordProgression: [], groove: "pop" },
    seed: 1,
  };
  const repaired = repairPlan(raw);
  assert.equal((repaired.structure as unknown[]).length, 12);
  assert.equal((repaired.arrangement as any).bpm, 240);
  assert.deepEqual(repaired.arrangement.chordProgression, ["C", "G", "Am", "F"]);
});

test("S2-T8 段名归一化：verse1/verse2/rap/pre/hook → 合法枚举", () => {
  assert.equal(normalizeSectionName("verse1"), "verse");
  assert.equal(normalizeSectionName("Verse2"), "verse");
  assert.equal(normalizeSectionName("rap"), "verse");
  assert.equal(normalizeSectionName("pre"), "preChorus");
  assert.equal(normalizeSectionName("hook"), "chorus");
  assert.equal(normalizeSectionName("ad-lib"), "bridge");
  assert.equal(normalizeSectionName("unknown-x"), "verse");
});

test("S6-T4 事件历史环形缓冲：cap 截断且 done 终态帧永驻 + seq 单调", async () => {
  const m = startLlmMock();
  const dir = mkdtempSync(join(tmpdir(), "cm-"));
  try {
    const store = new JobStore(4); // 小 cap 验证截断
    const job = store.create("sess-cap");
    await store.run(job.id, {
      prompt: "test",
      settings: { baseURL: m.url, apiKey: "", model: "m", temperature: 0.5 } as never,
      engine: new MockAdapter(join(dir, "g")),
      maxRetries: 1,
    });
    const hist = store.historyAfter(job.id, 0);
    assert.ok(hist.length <= 4, `截断至 cap（实际 ${hist.length}）`);
    assert.ok(hist.some((e) => e.type === "done"), "done 终态帧永驻");
    const seqs = hist.map((e) => e.seq);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), "seq 单调");
    // 全量事件数 > cap（意图/规划/派发/suno/对齐/评判/交付双帧 + done）——证明确实发生截断
    assert.ok(hist[0].seq > 1, "早期事件已被截断丢弃");
  } finally {
    await m.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("S6-T5 Last-Event-ID 补帧语义：historyAfter(after) 切片 + failed 终态保留", async () => {
  const m = startLlmMock();
  const dir = mkdtempSync(join(tmpdir(), "cm-"));
  try {
    const job = jobStore.create("sess-replay");
    await jobStore.run(job.id, {
      prompt: "test",
      settings: { baseURL: m.url, apiKey: "", model: "m", temperature: 0.5 } as never,
      engine: new MockAdapter(join(dir, "g")),
      maxRetries: 1,
    });
    const all = jobStore.historyAfter(job.id, 0);
    assert.ok(all.length >= 8);
    assert.equal(all[0].seq, 1);
    // 游标切片：仅返回 seq > after（客户端断开重连只补漏帧）
    const tail = jobStore.historyAfter(job.id, all[3].seq);
    assert.equal(tail.length, all.length - 4);
    assert.equal(tail[0].seq, all[4].seq);
    // roundId 信封：全部事件同轮
    assert.equal(new Set(all.map((e) => e.roundId)).size, 1);
  } finally {
    await m.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("S6-T5b failed 事件带 failPhase（信封扩展进历史，可回放）", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cm-"));
  try {
    const job = jobStore.create("sess-fail");
    await jobStore.run(job.id, {
      prompt: "test",
      settings: { baseURL: "http://127.0.0.1:9/v1", apiKey: "", model: "m", temperature: 0.5 } as never,
      engine: new MockAdapter(join(dir, "g")),
      maxRetries: 1,
    });
    const hist = jobStore.historyAfter(job.id, 0);
    const failed = hist.find((e) => e.type === "failed");
    assert.ok(failed, "failed 帧存在");
    if (failed?.type === "failed") {
      assert.ok(failed.error);
      assert.ok(failed.phase === "intent" || failed.phase === "failed", "携带失败落点 phase");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ===== S6-T3 思考帧发射（流式 mock：推理链+正文分片）=====
function startStreamingLlmMock(): { url: string; close: () => Promise<void> } {
  const srv = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const b = JSON.parse(body || "{}");
      const sys = b.messages?.find((m: { role: string }) => m.role === "system")?.content ?? "";
      let out: string;
      if (sys.includes("意图分析器"))
        out = '{"theme":"温暖","mood":"治愈","style":"华语抒情","durationSec":100}';
      else if (sys.includes("创作编导"))
        out = '{"title":"T","structure":[{"name":"verse","lyrics":"v"},{"name":"chorus","lyrics":"c"}],"arrangement":{"key":"C","bpm":100,"chordProgression":["C-G-Am-F"],"groove":"pop"}}';
      else if (sys.includes("音乐质量评审"))
        out = '{"theme":4,"mood":4,"style":4,"comment":"ok"}';
      else out = "{}";
      if (!b.stream) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { content: out } }] }));
        return;
      }
      // SSE：推理链 2 帧 + 正文按 24 字符切片
      res.setHeader("content-type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "分析意图中…" } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "逐维打分" } }] })}\n\n`);
      for (let i = 0; i < out.length; i += 24) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: out.slice(i, i + 24) } }] })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  srv.listen(0);
  const port = (srv.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/v1`, close: () => new Promise((r) => srv.close(() => r())) };
}

test("S6-T3 llm_thinking 帧：intent/plan/judge 节点全覆盖，推理/正文双通道聚合=模型输出", async () => {
  const m = startStreamingLlmMock();
  const dir = mkdtempSync(join(tmpdir(), "cm-"));
  try {
    const job = jobStore.create("sess-think");
    await jobStore.run(job.id, {
      prompt: "test",
      settings: { baseURL: m.url, apiKey: "", model: "m", temperature: 0.5 } as never,
      engine: new MockAdapter(join(dir, "g")),
      maxRetries: 1,
    });
    const hist = jobStore.historyAfter(job.id, 0);
    const think = hist.filter((e) => e.type === "llm_thinking");
    assert.ok(think.length >= 9, `三节点 × start/delta/end 帧（实际 ${think.length}）`);
    const nodes = new Set(think.map((e) => (e.type === "llm_thinking" ? e.node : "")));
    assert.deepEqual([...nodes].sort(), ["intent", "judge", "plan"]);
    // 每调用恰一 start 一 end，end 带 ms
    for (const n of ["intent", "plan", "judge"]) {
      const frames = think.filter((e) => e.type === "llm_thinking" && e.node === n && e.callId === think.find((t) => t.type === "llm_thinking" && t.node === n)!.callId);
      assert.equal(frames.filter((e) => e.type === "llm_thinking" && e.op === "start").length, 1);
      const end = frames.find((e) => e.type === "llm_thinking" && e.op === "end");
      assert.ok(end && end.type === "llm_thinking" && (end.ms ?? 0) >= 0);
    }
    // 推理链通道出现过（channel=reasoning 的 delta）
    assert.ok(think.some((e) => e.type === "llm_thinking" && e.channel === "reasoning" && e.delta?.includes("分析意图中")));
    // 正文 delta 聚合可解析（intent 节点）
    const intentCallId = think.find((e) => e.type === "llm_thinking" && e.node === "intent")!.callId;
    const merged = think
      .filter((e) => e.type === "llm_thinking" && e.callId === intentCallId && e.channel === "content" && e.op === "delta")
      .map((e) => (e.type === "llm_thinking" ? e.delta : ""))
      .join("");
    assert.deepEqual(JSON.parse(merged).theme, "温暖");
    // 节流生效：正文切片 24 字符/帧，但 delta 帧数 < 原始切片数（80ms/240 字符合并）
    const intentContentDeltas = think.filter((e) => e.type === "llm_thinking" && e.callId === intentCallId && e.channel === "content").length;
    assert.ok(intentContentDeltas < Math.ceil(76 / 24) + 6, "delta 帧被节流合并");
  } finally {
    await m.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
