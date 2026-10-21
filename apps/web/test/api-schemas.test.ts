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
  TestSettingsRequestSchema,
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
