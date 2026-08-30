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
  const intentRaw = repairPlan({ ...raw, durationSec: Number(raw.durationSec ?? 180) });
  return IntentSchema.parse({ ...intentRaw, originPrompt: prompt });
}

/** 输出契约兜底：越界 clamp / 超限截断 / 缺失默认（真实 LLM 常给超界值——mock 测不出） */
export function repairPlan(raw: Record<string, unknown>): Record<string, unknown> {
  const intent = (raw.intent ?? {}) as Record<string, unknown>;
  if (typeof intent.durationSec === "number") intent.durationSec = clamp(intent.durationSec, 30, 600);
  if (typeof intent.durationSec === "string") intent.durationSec = clamp(Number(intent.durationSec) || 180, 30, 600);
  const arr = raw.arrangement ?? {};
  const arrangement = { ...(arr as Record<string, unknown>) };
  if (typeof arrangement.bpm === "number") arrangement.bpm = Math.round(clamp(arrangement.bpm, 40, 240));
  if (typeof arrangement.bpm === "string") arrangement.bpm = Math.round(clamp(Number(arrangement.bpm) || 100, 40, 240));
  if (!Array.isArray(arrangement.chordProgression) || arrangement.chordProgression.length === 0)
    arrangement.chordProgression = ["C", "G", "Am", "F"];
  const structure = Array.isArray(raw.structure)
    ? (raw.structure as unknown[]).slice(0, 12).filter((x) => x && typeof x === "object")
    : [];
  const title = String(raw.title ?? "").trim();
  return { ...raw, intent, arrangement, structure, title: title || "未命名" };
  return clone;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function planParse(raw: unknown) {
  return CreationPlanSchema.parse(repairPlan(raw as Record<string, unknown>));
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
            '{"title":string,"structure":[{"name":"intro|verse|preChorus|chorus|bridge|outro","lyrics":string}]' +
            '（structure 数组 2 到 12 段）,"arrangement":{"key":string,"bpm":number(40-240),"chordProgression":string[](非空),' +
            '"groove":string}}。**严格遵守边界**：structure 不超过 12 段、bpm 40-240、chordProgression 至少一个和弦。' +
            `意图：${JSON.stringify(intent)}。仅输出 JSON。`,
        },
        { role: "user", content: prompt },
      ])
    ).text,
  );
  try {
    return planParse({ ...raw, intent, seed });
  } catch (firstErr) {
    // 兜底①：契约修复（clamp/截断/默认）后重试解析
    try {
      return planParse({ ...raw, intent, seed });
    } catch {
      // 兜底②：将解析错误摘要回喂模型，修正一次
      const retryRaw = await extractJson<Record<string, unknown>>(
        (
          await chatCompletion(settings, [
            {
              role: "system",
              content:
                "你是音乐创作编导。上一次输出不符合契约（" +
                (firstErr instanceof Error ? firstErr.message.slice(0, 200) : "格式错误") +
                '）。请严格按契约重新输出 JSON：' +
                '{"title":string,"structure":[{"name":"verse|preChorus|chorus|bridge|outro","lyrics":string}]（2-12 段）,' +
                '"arrangement":{"key":string,"bpm":number(40-240),"chordProgression":string[]非空,"groove":string}}。仅输出 JSON。',
            },
            { role: "user", content: prompt },
          ])
        ).text,
      );
      return planParse({ ...retryRaw, intent, seed });
    }
  }
}
