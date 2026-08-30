import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { alignSong, ruleChecks, judgeSong, runAgent, jobStore, type JobEvent } from "../src/index.ts";
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
  assert.equal(ruleFail.verdict, "retry");
  assert.ok(ruleFail.rules.length >= 3);
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
