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

/** 歌曲交付（来自引擎，源格式不转码） */
export const SongResultSchema = z.object({
  sunoId: z.string(),
  title: z.string().min(1),
  lyrics: z.string(),
  style: z.string(),
  tags: z.array(z.string()).optional(),
  audioUrl: z.string(),
  coverUrl: z.string().optional(),
  durationSec: z.number(),
  sourceFormat: z.enum(["mp3", "wav", "flac", "m4a"]),
});
export type SongResult = z.infer<typeof SongResultSchema>;

/** Leader 统一建模对齐：原语义 ↔ 交付结果 */
export const AlignedSongSchema = z.object({
  plan: CreationPlanSchema,
  song: SongResultSchema,
  alignment: z.object({
    theme: z.number().min(0).max(5),
    mood: z.number().min(0).max(5),
    style: z.number().min(0).max(5),
    duration: z.number().min(0).max(5),
    structure: z.number().min(0).max(5),
  }),
});
export type AlignedSong = z.infer<typeof AlignedSongSchema>;

/** 效果评判报告（LLM rubric + 规则检测） */
export const JudgeReportSchema = z.object({
  score: z.number().min(0).max(5),
  perDimension: z.record(z.number().min(0).max(5)),
  comment: z.string().optional(),
  rules: z.array(z.object({ name: z.string(), passed: z.boolean(), note: z.string().optional() })),
  retried: z.number().int(),
  verdict: z.enum(["pass", "retry", "give-up"]),
});
export type JudgeReport = z.infer<typeof JudgeReportSchema>;

export const JOB_PHASES = [
  "intent",
  "plan",
  "dispatch",
  "suno",
  "align",
  "judge",
  "deliver",
  "failed",
] as const;
export type JobPhase = (typeof JOB_PHASES)[number];

/** 任务对象 */
export const JobSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  phase: z.enum(JOB_PHASES),
  status: z.enum(["queued", "running", "done", "failed"]),
  payload: z.unknown().optional(),
  report: JudgeReportSchema.nullable().optional(),
  result: AlignedSongSchema.nullable().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof JobSchema>;
