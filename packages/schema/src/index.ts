import { z } from "zod";

/** 意图分析输出（Stage 1） */
export const IntentSchema = z.object({
  theme: z.string().min(1).describe("主题：一句概括"),
  mood: z.string().min(1).describe("情绪"),
  style: z.string().min(1).describe("风格（如华语抒情/英伦摇滚）"),
  durationSec: z.number().int().min(30).max(600).describe("目标时长（秒）"),
  extra: z.array(z.string()).optional().describe("额外约束（语言/器乐配置等）"),
  originPrompt: z.string().min(1),
});
export type Intent = z.infer<typeof IntentSchema>;

/** 歌词结构段落 */
export const SongSectionSchema = z.object({
  name: z.enum(["intro", "verse", "preChorus", "chorus", "bridge", "outro"]),
  lyrics: z.string().min(1),
});
export type SongSection = z.infer<typeof SongSectionSchema>;

/** 创作规划输出（Stage 1） */
export const CreationPlanSchema = z.object({
  intent: IntentSchema,
  title: z.string().min(1),
  structure: z.array(SongSectionSchema).min(2).max(8),
  arrangement: z.object({
    key: z.string().min(1).describe("调性"),
    bpm: z.number().int().min(40).max(240).describe("速度"),
    chordProgression: z.array(z.string()).min(1).describe("和弦走向"),
    groove: z.string().min(1).describe("节奏型"),
  }),
  seed: z.number().int().describe("固定种子：同输入+种子可复现"),
});
export type CreationPlan = z.infer<typeof CreationPlanSchema>;

export const parseIntent = (raw: unknown): Intent => IntentSchema.parse(raw);
export const parseCreationPlan = (raw: unknown): CreationPlan => CreationPlanSchema.parse(raw);
