import { z } from "zod";

/**
 * API 请求/响应 Zod Schema
 * 集中管理所有 API 路由的数据验证，确保类型安全
 */

// ===== POST /api/jobs =====
export const CreateJobRequestSchema = z.object({
  prompt: z.string().min(1, "prompt 不能为空").max(2000, "prompt 不能超过 2000 字符"),
  sessionId: z.string().optional(),
});

export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

export const CreateJobResponseSchema = z.object({
  id: z.string(),
  engineMode: z.enum(["mock", "suno"]),
  engineModeDoc: z.string(),
});

export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>;

// ===== GET /api/jobs/:id =====
export const GetJobResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "running", "pending", "done", "failed"]),
  createdAt: z.number(),
});

export type GetJobResponse = z.infer<typeof GetJobResponseSchema>;

// ===== POST /api/jobs/:id/intent =====
export const ClassifyIntentRequestSchema = z.object({
  message: z.string().min(1),
});

export type ClassifyIntentRequest = z.infer<typeof ClassifyIntentRequestSchema>;

export const ClassifyIntentResponseSchema = z.object({
  action: z.enum(["resume", "restart", "new"]),
});

export type ClassifyIntentResponse = z.infer<typeof ClassifyIntentResponseSchema>;

// ===== POST /api/jobs/:id/resume =====
export const ResumeJobResponseSchema = z.object({
  ok: z.boolean(),
  fromPhase: z.string().optional(),
});

export type ResumeJobResponse = z.infer<typeof ResumeJobResponseSchema>;

// ===== POST /api/settings =====
export const UpdateSettingsRequestSchema = z.object({
  profileId: z.string().optional(),
  providerId: z.string().optional(),
  provider: z.string().optional(),
  baseURL: z.string().url().optional(),
  apiKey: z.string().optional(),
  clearApiKey: z.boolean().optional(),
  model: z.string().optional(),
  apiFormat: z.enum(["openai", "anthropic"]).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32768).optional(),
  thinking: z.boolean().optional(),
});

export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;

export const UpdateSettingsResponseSchema = z.object({
  ok: z.boolean(),
});

export type UpdateSettingsResponse = z.infer<typeof UpdateSettingsResponseSchema>;

// ===== POST /api/settings/test =====
export const TestSettingsRequestSchema = z.object({
  provider: z.string().optional(),
  baseURL: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string(),
  apiFormat: z.enum(["openai", "anthropic"]),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32768).optional(),
});

export type TestSettingsRequest = z.infer<typeof TestSettingsRequestSchema>;

export const TestSettingsResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  responsePreview: z.string().optional(),
});

export type TestSettingsResponse = z.infer<typeof TestSettingsResponseSchema>;

// ===== POST /api/chat =====
export const ChatRequestSchema = z.object({
  message: z.string().min(1),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ===== GET /api/songs =====
export const GetSongsResponseSchema = z.object({
  songs: z.array(z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    durationSec: z.union([z.number(), z.string()]),
    audioUrl: z.string(),
    imageUrl: z.string(),
    createdAt: z.string(),
    model: z.string(),
  })),
  note: z.string().optional(),
  error: z.string().optional(),
});

export type GetSongsResponse = z.infer<typeof GetSongsResponseSchema>;

// ===== 错误响应 =====
export const ErrorResponseSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Zod 验证辅助函数
 * @param schema - Zod schema
 * @param data - 待验证数据
 * @returns 验证结果 {success, data, error}
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
  return { success: false, error: errors };
}
