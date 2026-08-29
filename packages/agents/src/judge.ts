import { chatCompletion, extractJson, type LlmSettings } from "@colormax/llm";
import { JudgeReportSchema, type AlignedSong, type JudgeReport } from "@colormax/schema";
import { ruleChecks } from "./align.ts";

export const PASS_THRESHOLD = 3.5;

export interface JudgeDeps {
  settings: LlmSettings;
  /** 测试注入：固定 LLM 评分响应 */
  judgeOverride?: (aligned: AlignedSong) => Promise<JudgeReport>;
  maxRetries?: number;
}

/** 效果评判：LLM 多维 rubric 评分（主题/情绪/风格/时长/结构）+ 规则检测 → JudgeReport */
export async function judgeSong(
  deps: JudgeDeps,
  aligned: AlignedSong,
  retried: number,
): Promise<JudgeReport> {
  const rules = ruleChecks(aligned.plan, aligned.song);
  if (deps.judgeOverride) {
    const rep = await deps.judgeOverride(aligned);
    return {
      ...rep,
      rules,
      retried,
      verdict: rep.score >= PASS_THRESHOLD && rules.every((r) => r.passed) ? "pass" : "retry",
    };
  }

  const dims = await evaluateSemanticDims(deps.settings, aligned);
  const { comment, ...dimVals } = dims;
  const perDimension: Record<string, number> = {
    ...dimVals,
    duration: aligned.alignment.duration,
    structure: aligned.alignment.structure,
  };
  const weighted = {
    theme: 0.25, mood: 0.2, style: 0.2, duration: 0.2, structure: 0.15,
  } as const;
  const score = round1(
    (perDimension.theme * weighted.theme + perDimension.mood * weighted.mood + perDimension.style * weighted.style + perDimension.duration * weighted.duration + perDimension.structure * weighted.structure),
  );
  const passedRules = rules.every((r) => r.passed);
  return {
    score,
    perDimension,
    comment: dims.comment,
    rules,
    retried,
    verdict: score >= PASS_THRESHOLD && passedRules ? "pass" : "retry",
  };
}

interface SemanticDims {
  theme: number;
  mood: number;
  style: number;
  comment: string;
}

async function evaluateSemanticDims(
  settings: LlmSettings,
  aligned: AlignedSong,
): Promise<SemanticDims> {
  const plan = aligned.plan;
  const song = aligned.song;
  let processed = JSON.stringify({
    intent: plan.intent,
    song: {
      title: song.title,
      style: song.style,
      tags: song.tags,
      durationSec: song.durationSec,
      lyrics: song.lyrics.slice(0, 400),
    },
  }).slice(0, 3000);
  const raw = await extractJson<Record<string, unknown>>(
    (
      await chatCompletion(settings, [
        {
          role: "system",
          content:
            "你是音乐质量评审。对创作结果与原始意图做对齐打分（0-5 分），输出 JSON：" +
            '{"theme":number,"mood":number,"style":number,"comment":string}。仅输出 JSON。',
        },
        {
          role: "user",
          content: `原始意图/计划与交付歌曲：\n${processed}`,
        },
      ])
    ).text,
  );
  const num = (v: unknown) => Math.max(0, Math.min(5, Number(v) || 0));
  return {
    theme: num(raw.theme),
    mood: num(raw.mood),
    style: num(raw.style),
    comment: String(raw.comment ?? ""),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
