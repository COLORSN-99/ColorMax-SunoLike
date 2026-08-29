import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIntent, parseCreationPlan, IntentSchema } from "../src/index.ts";

test("S1-T3a 合法 Intent 通过", () => {
  const intent = parseIntent({
    theme: "写给妈妈的温暖抒情歌",
    mood: "温暖",
    style: "华语抒情",
    durationSec: 180,
    originPrompt: "给妈妈写一首温暖的中文抒情歌",
  });
  assert.equal(intent.theme, "写给妈妈的温暖抒情歌");
  assert.equal(intent.durationSec, 180);
});

test("S1-T3b 缺字段被拒", () => {
  assert.throws(() =>
    parseIntent({ mood: "温暖", style: "华语抒情", originPrompt: "x" }),
  );
});

test("S1-T3c 越界值被拒（时长非正/超上限）", () => {
  assert.throws(() =>
    IntentSchema.parse({ theme: "a", mood: "b", style: "c", durationSec: 10, originPrompt: "p" }),
  );
  assert.throws(() =>
    IntentSchema.parse({ theme: "a", mood: "b", style: "c", durationSec: 9999, originPrompt: "p" }),
  );
});

test("S1-T3d 合法创作计划通过；结构不足被拒", () => {
  const plan = parseCreationPlan({
    intent: { theme: "a", mood: "b", style: "c", durationSec: 120, originPrompt: "p" },
    title: "T",
    structure: [
      { name: "verse", lyrics: "v1" },
      { name: "chorus", lyrics: "c1" },
    ],
    arrangement: { key: "C", bpm: 80, chordProgression: ["C-G-Am-F"], groove: "4/4 pop" },
    seed: 42,
  });
  assert.equal(plan.seed, 42);
  assert.throws(() =>
    parseCreationPlan({
      intent: { theme: "a", mood: "b", style: "c", durationSec: 120, originPrompt: "p" },
      title: "T",
      structure: [{ name: "verse", lyrics: "v1" }],
      arrangement: { key: "C", bpm: 500, chordProgression: [], groove: "x" },
      seed: 42,
    }),
  );
});
