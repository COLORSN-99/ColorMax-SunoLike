import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateRequest,
  CreateJobRequestSchema,
  CreateJobResponseSchema,
  GetJobResponseSchema,
  ClassifyIntentRequestSchema,
  ClassifyIntentResponseSchema,
  UpdateSettingsRequestSchema,
  UpdateSettingsResponseSchema,
  TestSettingsRequestSchema,
  TestSettingsResponseSchema,
  ChatRequestSchema,
  GetSongsResponseSchema,
  ResumeJobResponseSchema,
  ErrorResponseSchema,
} from "../lib/api-schemas.ts";

// ===== CreateJobRequest =====
test("CreateJobRequestSchema - 有效请求", () => {
  const result = validateRequest(CreateJobRequestSchema, {
    prompt: "测试prompt",
    sessionId: "test-session",
  });

  assert.ok(result.success);
  if (result.success) {
    assert.equal(result.data.prompt, "测试prompt");
    assert.equal(result.data.sessionId, "test-session");
  }
});

test("CreateJobRequestSchema - prompt 为空", () => {
  const result = validateRequest(CreateJobRequestSchema, {
    prompt: "",
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.includes("prompt"));
  }
});

test("CreateJobRequestSchema - prompt 超长", () => {
  const result = validateRequest(CreateJobRequestSchema, {
    prompt: "a".repeat(2001),
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.includes("2000"));
  }
});

test("CreateJobRequestSchema - sessionId 可选", () => {
  const result = validateRequest(CreateJobRequestSchema, {
    prompt: "测试",
  });

  assert.ok(result.success);
});

// ===== CreateJobResponse =====
test("CreateJobResponseSchema - 有效响应", () => {
  const result = validateRequest(CreateJobResponseSchema, {
    id: "job-123",
    engineMode: "mock",
    engineModeDoc: "Mock engine",
  });

  assert.ok(result.success);
});

test("CreateJobResponseSchema - engineMode 枚举验证", () => {
  const result = validateRequest(CreateJobResponseSchema, {
    id: "job-123",
    engineMode: "invalid",
    engineModeDoc: "test",
  });

  assert.equal(result.success, false);
});

// ===== GetJobResponse =====
test("GetJobResponseSchema - 有效响应", () => {
  const result = validateRequest(GetJobResponseSchema, {
    id: "job-123",
    status: "running",
    createdAt: Date.now(),
  });

  assert.ok(result.success);
});

test("GetJobResponseSchema - status 枚举验证", () => {
  const result = validateRequest(GetJobResponseSchema, {
    id: "job-123",
    status: "invalid-status",
    createdAt: Date.now(),
  });

  assert.equal(result.success, false);
});

// ===== ClassifyIntentRequest =====
test("ClassifyIntentRequestSchema - 有效请求", () => {
  const result = validateRequest(ClassifyIntentRequestSchema, {
    message: "继续",
  });

  assert.ok(result.success);
});

test("ClassifyIntentRequestSchema - message 为空", () => {
  const result = validateRequest(ClassifyIntentRequestSchema, {
    message: "",
  });

  assert.equal(result.success, false);
});

// ===== ClassifyIntentResponse =====
test("ClassifyIntentResponseSchema - 有效响应", () => {
  const actions = ["resume", "restart", "new"];
  for (const action of actions) {
    const result = validateRequest(ClassifyIntentResponseSchema, { action });
    assert.ok(result.success, `action=${action} should be valid`);
  }
});

// ===== UpdateSettingsRequest =====
test("UpdateSettingsRequestSchema - 有效请求", () => {
  const result = validateRequest(UpdateSettingsRequestSchema, {
    provider: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    apiKey: "sk-test",
    model: "deepseek-v4-flash",
    apiFormat: "openai",
    temperature: 0.8,
    maxTokens: 4096,
    thinking: false,
  });

  assert.ok(result.success);
});

test("UpdateSettingsRequestSchema - temperature 范围验证", () => {
  const tooLow = validateRequest(UpdateSettingsRequestSchema, { temperature: -0.1 });
  const tooHigh = validateRequest(UpdateSettingsRequestSchema, { temperature: 2.1 });
  const valid = validateRequest(UpdateSettingsRequestSchema, { temperature: 1.0 });

  assert.equal(tooLow.success, false);
  assert.equal(tooHigh.success, false);
  assert.ok(valid.success);
});

test("UpdateSettingsRequestSchema - maxTokens 范围验证", () => {
  const tooLow = validateRequest(UpdateSettingsRequestSchema, { maxTokens: 0 });
  const tooHigh = validateRequest(UpdateSettingsRequestSchema, { maxTokens: 32769 });
  const valid = validateRequest(UpdateSettingsRequestSchema, { maxTokens: 4096 });

  assert.equal(tooLow.success, false);
  assert.equal(tooHigh.success, false);
  assert.ok(valid.success);
});

test("UpdateSettingsRequestSchema - baseURL 格式验证", () => {
  const invalid = validateRequest(UpdateSettingsRequestSchema, { baseURL: "not-a-url" });
  const valid = validateRequest(UpdateSettingsRequestSchema, { baseURL: "https://api.example.com" });

  assert.equal(invalid.success, false);
  assert.ok(valid.success);
});

// ===== TestSettingsRequest =====
test("TestSettingsRequestSchema - 有效请求", () => {
  const result = validateRequest(TestSettingsRequestSchema, {
    baseURL: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    apiFormat: "openai",
  });

  assert.ok(result.success);
});

test("TestSettingsRequestSchema - 必填字段验证", () => {
  const missingBaseURL = validateRequest(TestSettingsRequestSchema, {
    model: "test",
    apiFormat: "openai",
  });

  assert.equal(missingBaseURL.success, false);
});

// ===== ErrorResponse =====
test("ErrorResponseSchema - 有效错误响应", () => {
  const simple = validateRequest(ErrorResponseSchema, {
    error: "测试错误",
  });

  const withDetails = validateRequest(ErrorResponseSchema, {
    error: "测试错误",
    details: { code: 500, stack: "..." },
  });

  assert.ok(simple.success);
  assert.ok(withDetails.success);
});

// ===== ResumeJobResponse =====
test("ResumeJobResponseSchema - 有效响应", () => {
  const result = validateRequest(ResumeJobResponseSchema, {
    ok: true,
    fromPhase: "resume",
  });

  assert.ok(result.success);
});

test("ResumeJobResponseSchema - fromPhase 可选", () => {
  const result = validateRequest(ResumeJobResponseSchema, {
    ok: true,
  });

  assert.ok(result.success);
});

// ===== UpdateSettingsResponse =====
test("UpdateSettingsResponseSchema - 有效响应", () => {
  const result = validateRequest(UpdateSettingsResponseSchema, {
    ok: true,
  });

  assert.ok(result.success);
});

// ===== TestSettingsResponse =====
test("TestSettingsResponseSchema - 成功响应", () => {
  const result = validateRequest(TestSettingsResponseSchema, {
    ok: true,
    responsePreview: "Hello from API",
  });

  assert.ok(result.success);
});

test("TestSettingsResponseSchema - 失败响应", () => {
  const result = validateRequest(TestSettingsResponseSchema, {
    ok: false,
    error: "Connection timeout",
  });

  assert.ok(result.success);
});

// ===== ChatRequest =====
test("ChatRequestSchema - 简单消息", () => {
  const result = validateRequest(ChatRequestSchema, {
    message: "创作一首歌",
  });

  assert.ok(result.success);
});

test("ChatRequestSchema - 带历史记录", () => {
  const result = validateRequest(ChatRequestSchema, {
    message: "继续",
    history: [
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好！有什么可以帮助你的吗？" },
    ],
  });

  assert.ok(result.success);
});

test("ChatRequestSchema - 拒绝空消息", () => {
  const result = validateRequest(ChatRequestSchema, {
    message: "",
  });

  assert.equal(result.success, false);
});

test("ChatRequestSchema - 拒绝无效 role", () => {
  const result = validateRequest(ChatRequestSchema, {
    message: "test",
    history: [{ role: "system", content: "Invalid" }],
  });

  assert.equal(result.success, false);
});

// ===== GetSongsResponse =====
test("GetSongsResponseSchema - 成功响应", () => {
  const result = validateRequest(GetSongsResponseSchema, {
    songs: [
      {
        id: "song-123",
        title: "Test Song",
        status: "complete",
        durationSec: 180,
        audioUrl: "https://cdn.example.com/song.mp3",
        imageUrl: "https://cdn.example.com/cover.jpg",
        createdAt: "2024-01-01T00:00:00Z",
        model: "chirp-v3",
      },
    ],
  });

  assert.ok(result.success);
});

test("GetSongsResponseSchema - 空列表", () => {
  const result = validateRequest(GetSongsResponseSchema, {
    songs: [],
    note: "未配置 SUNO_COOKIES",
  });

  assert.ok(result.success);
});

test("GetSongsResponseSchema - 错误响应", () => {
  const result = validateRequest(GetSongsResponseSchema, {
    songs: [],
    error: "Network error",
  });

  assert.ok(result.success);
});

test("GetSongsResponseSchema - durationSec 可以是字符串", () => {
  const result = validateRequest(GetSongsResponseSchema, {
    songs: [
      {
        id: "song-123",
        title: "Test",
        status: "complete",
        durationSec: "?",
        audioUrl: "https://example.com/song.mp3",
        imageUrl: "https://example.com/cover.jpg",
        createdAt: "2024-01-01",
        model: "chirp",
      },
    ],
  });

  assert.ok(result.success);
});
