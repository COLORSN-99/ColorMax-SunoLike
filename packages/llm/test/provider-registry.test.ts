import { test } from "node:test";
import assert from "node:assert/strict";
import { LlmProviderRegistry, llmProviderRegistry, type LlmProvider } from "../src/provider-registry.ts";

// ===== LlmProviderRegistry 基础功能 =====
test("LlmProviderRegistry - 注册和获取提供商", () => {
  const registry = new LlmProviderRegistry();
  const provider: LlmProvider = {
    id: "test",
    name: "Test Provider",
    defaultBaseURL: "https://api.test.com",
    apiFormat: "openai",
    defaultModel: "test-model",
  };

  registry.register(provider);
  const retrieved = registry.get("test");

  assert.ok(retrieved);
  assert.equal(retrieved.id, "test");
  assert.equal(retrieved.name, "Test Provider");
  assert.equal(retrieved.defaultModel, "test-model");
});

test("LlmProviderRegistry - 默认提供商", () => {
  const registry = new LlmProviderRegistry();
  const provider1: LlmProvider = {
    id: "provider1",
    name: "Provider 1",
    defaultBaseURL: "https://api1.com",
    apiFormat: "openai",
    defaultModel: "model1",
  };
  const provider2: LlmProvider = {
    id: "provider2",
    name: "Provider 2",
    defaultBaseURL: "https://api2.com",
    apiFormat: "anthropic",
    defaultModel: "model2",
  };

  registry.register(provider1);
  registry.register(provider2, true); // 设为默认

  const defaultProvider = registry.get();
  assert.ok(defaultProvider);
  assert.equal(defaultProvider.id, "provider2");
  assert.equal(registry.getDefaultId(), "provider2");
});

test("LlmProviderRegistry - 列出所有提供商", () => {
  const registry = new LlmProviderRegistry();
  registry.register({
    id: "p1",
    name: "P1",
    defaultBaseURL: "https://p1.com",
    apiFormat: "openai",
    defaultModel: "m1",
  });
  registry.register({
    id: "p2",
    name: "P2",
    defaultBaseURL: "https://p2.com",
    apiFormat: "anthropic",
    defaultModel: "m2",
  });

  const providers = registry.list();
  assert.equal(providers.length, 2);
  assert.ok(providers.find((p) => p.id === "p1"));
  assert.ok(providers.find((p) => p.id === "p2"));
});

test("LlmProviderRegistry - 检查提供商是否存在", () => {
  const registry = new LlmProviderRegistry();
  registry.register({
    id: "existing",
    name: "Existing",
    defaultBaseURL: "https://api.com",
    apiFormat: "openai",
    defaultModel: "model",
  });

  assert.ok(registry.has("existing"));
  assert.ok(!registry.has("nonexistent"));
});

test("LlmProviderRegistry - 设置默认提供商", () => {
  const registry = new LlmProviderRegistry();
  registry.register({
    id: "p1",
    name: "P1",
    defaultBaseURL: "https://p1.com",
    apiFormat: "openai",
    defaultModel: "m1",
  });
  registry.register({
    id: "p2",
    name: "P2",
    defaultBaseURL: "https://p2.com",
    apiFormat: "openai",
    defaultModel: "m2",
  });

  assert.equal(registry.getDefaultId(), "p1"); // 首个注册的是默认
  registry.setDefault("p2");
  assert.equal(registry.getDefaultId(), "p2");
});

test("LlmProviderRegistry - 设置不存在的默认提供商抛出错误", () => {
  const registry = new LlmProviderRegistry();
  registry.register({
    id: "p1",
    name: "P1",
    defaultBaseURL: "https://p1.com",
    apiFormat: "openai",
    defaultModel: "m1",
  });

  assert.throws(() => {
    registry.setDefault("nonexistent");
  }, /not found/);
});

test("LlmProviderRegistry - 取消注册提供商", () => {
  const registry = new LlmProviderRegistry();
  registry.register({
    id: "p1",
    name: "P1",
    defaultBaseURL: "https://p1.com",
    apiFormat: "openai",
    defaultModel: "m1",
  });
  registry.register({
    id: "p2",
    name: "P2",
    defaultBaseURL: "https://p2.com",
    apiFormat: "openai",
    defaultModel: "m2",
  });

  assert.ok(registry.has("p1"));
  registry.unregister("p1");
  assert.ok(!registry.has("p1"));
  assert.ok(registry.has("p2"));
});

test("LlmProviderRegistry - 取消注册默认提供商后自动切换", () => {
  const registry = new LlmProviderRegistry();
  registry.register({
    id: "p1",
    name: "P1",
    defaultBaseURL: "https://p1.com",
    apiFormat: "openai",
    defaultModel: "m1",
  });
  registry.register({
    id: "p2",
    name: "P2",
    defaultBaseURL: "https://p2.com",
    apiFormat: "openai",
    defaultModel: "m2",
  });

  assert.equal(registry.getDefaultId(), "p1");
  registry.unregister("p1");
  assert.equal(registry.getDefaultId(), "p2"); // 自动切换到剩余的提供商
});

test("LlmProviderRegistry - 取消注册所有提供商后默认为 null", () => {
  const registry = new LlmProviderRegistry();
  registry.register({
    id: "p1",
    name: "P1",
    defaultBaseURL: "https://p1.com",
    apiFormat: "openai",
    defaultModel: "m1",
  });

  registry.unregister("p1");
  assert.equal(registry.getDefaultId(), null);
  assert.equal(registry.get(), null);
});

// ===== 全局注册表 - 内置提供商 =====
test("llmProviderRegistry - 内置 DeepSeek 提供商", () => {
  const deepseek = llmProviderRegistry.get("deepseek");
  assert.ok(deepseek);
  assert.equal(deepseek.name, "DeepSeek");
  assert.equal(deepseek.defaultBaseURL, "https://api.deepseek.com");
  assert.equal(deepseek.apiFormat, "openai");
  assert.equal(deepseek.defaultModel, "deepseek-v4-flash");
});

test("llmProviderRegistry - 内置 OpenAI 提供商", () => {
  const openai = llmProviderRegistry.get("openai");
  assert.ok(openai);
  assert.equal(openai.name, "OpenAI");
  assert.equal(openai.defaultBaseURL, "https://api.openai.com/v1");
  assert.equal(openai.apiFormat, "openai");
  assert.equal(openai.defaultModel, "gpt-4");
});

test("llmProviderRegistry - 内置 Anthropic 提供商", () => {
  const anthropic = llmProviderRegistry.get("anthropic");
  assert.ok(anthropic);
  assert.equal(anthropic.name, "Anthropic");
  assert.equal(anthropic.defaultBaseURL, "https://api.anthropic.com/v1");
  assert.equal(anthropic.apiFormat, "anthropic");
  assert.equal(anthropic.defaultModel, "claude-3-5-sonnet-20241022");
});

test("llmProviderRegistry - 内置 DeepSeek R1 提供商", () => {
  const r1 = llmProviderRegistry.get("deepseek-reasoning");
  assert.ok(r1);
  assert.equal(r1.name, "DeepSeek R1");
  assert.equal(r1.defaultModel, "deepseek-reasoner");
});

test("llmProviderRegistry - DeepSeek 是默认提供商", () => {
  const defaultProvider = llmProviderRegistry.get();
  assert.ok(defaultProvider);
  assert.equal(defaultProvider.id, "deepseek");
});

test("llmProviderRegistry - 列出所有内置提供商", () => {
  const providers = llmProviderRegistry.list();
  assert.ok(providers.length >= 4); // 至少有 4 个内置提供商
  const ids = providers.map((p) => p.id);
  assert.ok(ids.includes("deepseek"));
  assert.ok(ids.includes("openai"));
  assert.ok(ids.includes("anthropic"));
  assert.ok(ids.includes("deepseek-reasoning"));
});
