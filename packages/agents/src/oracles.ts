import {
  chatCompletion,
  extractJson,
  stableInt,
  type LlmSettings,
} from "@colormax/llm";
import {
  CreationPlanSchema,
  IntentSchema,
  type CreationPlan,
  type Intent,
} from "@colormax/schema";

/** 意图分析（LLM 真实调用） */
export async function createIntent(settings: LlmSettings, prompt: string): Promise<Intent> {
  const raw = await extractJson<Record<string, unknown>>(
    (
      await chatCompletion(settings, [
        {
          role: "system",
          content:
            "你是音乐创作意图分析器。根据用户输入输出 JSON：" +
            '{"theme":string,"mood":string,"style":string,"durationSec":number(30-600),' +
            '"extra":string[]}。仅输出 JSON。',
        },
        { role: "user", content: prompt },
      ])
    ).text,
  );
  return IntentSchema.parse({
    ...raw,
    originPrompt: prompt,
    durationSec: Number(raw.durationSec ?? 180),
  });
}

/** 创作规划（LLM 真实调用：歌词结构 + 编曲参数 + 固定种子） */
export async function createPlan(
  settings: LlmSettings,
  prompt: string,
  intent: Intent,
): Promise<CreationPlan> {
  const seed = stableInt(prompt, 1_000_000);
  const raw = await extractJson<Record<string, unknown>>(
    (
      await chatCompletion(settings, [
        {
          role: "system",
          content:
            "你是音乐创作编导。基于意图输出创作计划 JSON：" +
            '{"title":string,"structure":[{"name":"verse|preChorus|chorus|bridge|outro","lyrics":string}]' +
            ',"arrangement":{"key":string,"bpm":number(40-240),"chordProgression":string[],"groove":string}}。' +
            `意图：${JSON.stringify(intent)}。仅输出 JSON。`,
        },
        { role: "user", content: prompt },
      ])
    ).text,
  );
  return CreationPlanSchema.parse({ ...raw, intent, seed });
}
