import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ExternalServiceError,
  TimeoutError,
  ConfigurationError,
  createLogger,
} from "../src/index.ts";

// ===== AppError 基类 =====
test("AppError - 基本属性", () => {
  const error = new AppError("Test error", {
    code: "TEST_ERROR",
    context: { key: "value" },
    retryable: true,
    statusCode: 500,
  });

  assert.equal(error.message, "Test error");
  assert.equal(error.code, "TEST_ERROR");
  assert.equal(error.retryable, true);
  assert.equal(error.statusCode, 500);
  assert.deepEqual(error.context, { key: "value" });
  assert.equal(error.name, "AppError");
});

test("AppError - 默认值", () => {
  const error = new AppError("Test");

  assert.equal(error.code, "UNKNOWN_ERROR");
  assert.equal(error.retryable, false);
  assert.equal(error.statusCode, undefined);
  assert.equal(error.context, undefined);
});

test("AppError - toJSON 序列化", () => {
  const error = new AppError("Serialization test", {
    code: "SERIALIZATION_TEST",
    context: { userId: 123 },
    statusCode: 400,
  });

  const json = error.toJSON();

  assert.equal(json.name, "AppError");
  assert.equal(json.code, "SERIALIZATION_TEST");
  assert.equal(json.message, "Serialization test");
  assert.equal(json.statusCode, 400);
  assert.deepEqual(json.context, { userId: 123 });
  assert.ok(json.stack);
});

test("AppError - cause 错误链", () => {
  const cause = new Error("Root cause");
  const error = new AppError("Wrapper error", { cause });

  assert.ok(error.cause);
  assert.equal((error.cause as Error).message, "Root cause");

  const json = error.toJSON();
  assert.ok(json.cause);
  assert.equal((json.cause as { message: string }).message, "Root cause");
});

// ===== ValidationError =====
test("ValidationError - 验证错误", () => {
  const error = new ValidationError("Invalid input", { field: "email" });

  assert.equal(error.message, "Invalid input");
  assert.equal(error.code, "VALIDATION_ERROR");
  assert.equal(error.statusCode, 400);
  assert.equal(error.retryable, false);
  assert.deepEqual(error.context, { field: "email" });
  assert.equal(error.name, "ValidationError");
});

// ===== NotFoundError =====
test("NotFoundError - 资源未找到", () => {
  const error = new NotFoundError("User", "123");

  assert.equal(error.message, "User with id 123 not found");
  assert.equal(error.code, "NOT_FOUND");
  assert.equal(error.statusCode, 404);
  assert.equal(error.retryable, false);
  assert.deepEqual(error.context, { resource: "User", id: "123" });
});

test("NotFoundError - 无 ID", () => {
  const error = new NotFoundError("Settings");

  assert.equal(error.message, "Settings not found");
  assert.deepEqual(error.context, { resource: "Settings", id: undefined });
});

// ===== UnauthorizedError =====
test("UnauthorizedError - 未授权", () => {
  const error = new UnauthorizedError();

  assert.equal(error.message, "Unauthorized");
  assert.equal(error.code, "UNAUTHORIZED");
  assert.equal(error.statusCode, 401);
  assert.equal(error.retryable, false);
});

test("UnauthorizedError - 自定义消息", () => {
  const error = new UnauthorizedError("Invalid token", { token: "***" });

  assert.equal(error.message, "Invalid token");
  assert.deepEqual(error.context, { token: "***" });
});

// ===== ForbiddenError =====
test("ForbiddenError - 权限不足", () => {
  const error = new ForbiddenError("Admin only", { role: "user" });

  assert.equal(error.message, "Admin only");
  assert.equal(error.code, "FORBIDDEN");
  assert.equal(error.statusCode, 403);
  assert.deepEqual(error.context, { role: "user" });
});

// ===== ConflictError =====
test("ConflictError - 冲突错误", () => {
  const error = new ConflictError("Email already exists", { email: "test@example.com" });

  assert.equal(error.message, "Email already exists");
  assert.equal(error.code, "CONFLICT");
  assert.equal(error.statusCode, 409);
  assert.equal(error.retryable, false);
});

// ===== ExternalServiceError =====
test("ExternalServiceError - 外部服务错误", () => {
  const cause = new Error("Connection refused");
  const error = new ExternalServiceError("Suno API", "Connection failed", cause);

  assert.equal(error.message, "External service Suno API error: Connection failed");
  assert.equal(error.code, "EXTERNAL_SERVICE_ERROR");
  assert.equal(error.statusCode, 502);
  assert.equal(error.retryable, true);
  assert.deepEqual(error.context, { service: "Suno API" });
  assert.equal(error.cause, cause);
});

// ===== TimeoutError =====
test("TimeoutError - 超时错误", () => {
  const error = new TimeoutError("LLM request", 30000);

  assert.equal(error.message, "Operation LLM request timed out after 30000ms");
  assert.equal(error.code, "TIMEOUT");
  assert.equal(error.statusCode, 504);
  assert.equal(error.retryable, true);
  assert.deepEqual(error.context, { operation: "LLM request", timeout: 30000 });
});

// ===== ConfigurationError =====
test("ConfigurationError - 配置错误", () => {
  const error = new ConfigurationError("Missing API key", { key: "SUNO_COOKIES" });

  assert.equal(error.message, "Missing API key");
  assert.equal(error.code, "CONFIGURATION_ERROR");
  assert.equal(error.statusCode, 500);
  assert.equal(error.retryable, false);
  assert.deepEqual(error.context, { key: "SUNO_COOKIES" });
});

// ===== Logger 创建 =====
test("createLogger - 创建日志器", () => {
  const logger = createLogger({ name: "test-logger", level: "debug" });

  assert.ok(logger);
  assert.equal(typeof logger.info, "function");
  assert.equal(typeof logger.error, "function");
  assert.equal(typeof logger.warn, "function");
  assert.equal(typeof logger.debug, "function");
});
