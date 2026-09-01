import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import {
  readSettings,
  writeSettings,
  validateSettings,
  chatCompletion,
  extractJson,
  testConnection,
  parseJsonLoose,
  DEFAULT_SETTINGS,
} from "../src/index.ts";

test("S1-T1 配置写入与读取（面板→.env.local→client）", () => {
  const dir = mkdtempSync(join(tmpdir(), "cm-llm-"));
  const envPath = join(dir, ".env.local");
  try {
    writeSettings(
      { baseURL: "http://10.0.0.2:8000/v1", apiKey: "sk-x", model: "m1", temperature: 0.3 },
      envPath,
    );
    const s = readSettings(envPath);
    assert.equal(s.baseURL, "http://10.0.0.2:8000/v1");
    assert.equal(s.apiKey, "sk-x");
    assert.equal(s.model, "m1");
    assert.equal(s.temperature, 0.3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("S1-T1b 缺失时回落默认", () => {
  const s = readSettings("/nonexistent/.env.local");
  assert.equal(s.baseURL, DEFAULT_SETTINGS.baseURL);
  assert.equal(s.model, DEFAULT_SETTINGS.model);
});

test("S1-T1c 校验：非法 url/缺失 model/越界温度", () => {
  assert.ok(validateSettings({ ...DEFAULT_SETTINGS, baseURL: "ftp://x" }));
  assert.ok(validateSettings({ ...DEFAULT_SETTINGS, model: " " }));
  assert.ok(validateSettings({ ...DEFAULT_SETTINGS, temperature: 3 }));
  assert.equal(validateSettings(DEFAULT_SETTINGS), null);
});

test("S1-T2 契约：mock OpenAI 端点返回正常", async () => {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      assert.equal(parsed.model, "mock-model");
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }] }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  try {
    const result = await chatCompletion(
      { ...DEFAULT_SETTINGS, baseURL: `http://127.0.0.1:${port}/v1`, model: "mock-model" },
      [{ role: "user", content: "hi" }],
    );
    assert.equal(result.text, '{"ok":1}');
  } finally {
    server.close();
  }
});

test("S1-T2b 契约：500 重试 2 次后失败", async () => {
  let calls = 0;
  const server = createServer((_req, res) => {
    calls++;
    res.statusCode = 500;
    res.end("boom");
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  try {
    await assert.rejects(
      chatCompletion(
        {
          ...DEFAULT_SETTINGS,
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: "sk-test",
          model: "m",
        },
        [{ role: "user", content: "hi" }],
      ),
      /HTTP 500/,
    );
    assert.equal(calls, 3); // 1 + 2 次重试
  } finally {
    server.close();
  }
});

test("S1-T2c extractJson：围栏与前后噪音", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('前置 {"b":2} 后置'), { b: 2 });
  assert.throws(() => extractJson("无 json"));
});

test("S1-T1d 写入不覆盖其他键（SUNO_COOKIES 保留）", () => {
  const dir = mkdtempSync(join(tmpdir(), "cm-llm2-"));
  const envPath = join(dir, ".env.local");
  try {
    writeFileSync(envPath, "SUNO_COOKIES=cookie-secret-line\nLLM_BASE_URL=old\n", "utf-8");
    writeSettings({ baseURL: "http://x/v1", apiKey: "k", model: "m", temperature: 0.2 }, envPath);
    const s = readFileSync(envPath, "utf-8");
    assert.ok(s.includes("SUNO_COOKIES=cookie-secret-line"), "用户配置保留");
    assert.ok(s.includes("LLM_BASE_URL=http://x/v1"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("S1-T2d Anthropic Message 兼容：/messages + x-api-key + content[].text", async () => {
  let captured: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      captured = { url: req.url ?? "", headers: req.headers as Record<string, string>, body: JSON.parse(body) };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ content: [{ type: "text", text: '{"ok":1}' }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  try {
    const result = await chatCompletion(
      { ...DEFAULT_SETTINGS, baseURL: `http://127.0.0.1:${port}/anthropic`, apiFormat: "anthropic", apiKey: "sk-ant", model: "deepseek-v4-flash", maxTokens: 512 },
      [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
    );
    assert.equal(result.text, '{"ok":1}');
    assert.ok(captured!.url.endsWith("/anthropic/messages"));
    assert.equal(captured!.headers["x-api-key"], "sk-ant");
    assert.ok(captured!.headers["anthropic-version"]);
    assert.equal(captured!.body.model, "deepseek-v4-flash");
    assert.equal(captured!.body.max_tokens, 512);
    assert.equal(captured!.body.system, "sys");
    assert.equal((captured!.body.messages as unknown[]).length, 1);
  } finally {
    server.close();
  }
});

test("S1-T2e 测试连接 ok/失败", async () => {
  const ok = await testConnection({ ...DEFAULT_SETTINGS, baseURL: "http://127.0.0.1:9/v1", apiKey: "" });
  assert.equal(ok.ok, false);
  assert.ok(ok.error);
});

test("S1-T2f 宽松解析：尾逗号/单引号/缺逗号/注释 → 修复成功", () => {
  assert.deepEqual(parseJsonLoose('{"a":1,}'), { a: 1 });
  assert.deepEqual(parseJsonLoose("{'a': 2}"), { a: 2 });
  assert.deepEqual(parseJsonLoose('{"a":1 "b":2}'), { a: 1, b: 2 });
  assert.deepEqual(parseJsonLoose('{"a":1,/*x*/ "b":3}'), { a: 1, b: 3 });
  assert.deepEqual(parseJsonLoose('{"arr":["x" "y"]}'), { arr: ["x", "y"] });
  assert.deepEqual(parseJsonLoose('{ // comment\n "a": 5 }'), { a: 5 });
});

// ===== Stage 6.1 流式（S6-T1/T2/T3 降级）=====
function sseServer(format: "openai" | "anthropic"): { url: string; close: () => void } {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/event-stream");
    const w = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (format === "openai") {
      w({ choices: [{ delta: { reasoning_content: "想" } }] });
      w({ choices: [{ delta: { content: '{"a":' } }] });
      w({ choices: [{ delta: { content: "1}" } }] });
      res.write("data: [DONE]\n\n");
    } else {
      w({ type: "content_block_delta", delta: { type: "thinking_delta", thinking: "思" } });
      w({ type: "content_block_delta", delta: { type: "text_delta", text: '{"b":' } });
      w({ type: "content_block_delta", delta: { type: "text_delta", text: "2}" } });
      w({ type: "message_stop" });
    }
    res.end();
  });
  server.listen(0);
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/v1`, close: () => server.close() };
}

test("S6-T1 OpenAI 兼容流式：content 增量聚合 + reasoning_content 独立回调", async () => {
  const s = sseServer("openai");
  try {
    let reasoning = "";
    const chunks: string[] = [];
    const res = await chatCompletion(
      { ...DEFAULT_SETTINGS, baseURL: s.url },
      [{ role: "user", content: "x" }],
      { stream: true, onChunk: (t) => chunks.push(t), onReasoning: (t) => (reasoning += t) },
    );
    assert.equal(res.text, '{"a":1}');
    assert.deepEqual(chunks, ['{"a":', "1}"]);
    assert.equal(reasoning, "想");
  } finally {
    s.close();
  }
});

test("S6-T2 Anthropic Messages 流式：text_delta/thinking_delta 双通道", async () => {
  const s = sseServer("anthropic");
  try {
    let reasoning = "";
    const chunks: string[] = [];
    const res = await chatCompletion(
      { ...DEFAULT_SETTINGS, baseURL: s.url, apiFormat: "anthropic" },
      [{ role: "user", content: "x" }],
      { stream: true, onChunk: (t) => chunks.push(t), onReasoning: (t) => (reasoning += t) },
    );
    assert.equal(res.text, '{"b":2}');
    assert.deepEqual(chunks, ['{"b":', "2}"]);
    assert.equal(reasoning, "思");
  } finally {
    s.close();
  }
});

test("S6-T3 端点不支持流式（返回 JSON）自动降级：全文单帧回调", async () => {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "plain-text" } }] }));
  });
  server.listen(0);
  const port = (server.address() as { port: number }).port;
  try {
    const chunks: string[] = [];
    const res = await chatCompletion(
      { ...DEFAULT_SETTINGS, baseURL: `http://127.0.0.1:${port}/v1` },
      [{ role: "user", content: "x" }],
      { stream: true, onChunk: (t) => chunks.push(t) },
    );
    assert.equal(res.text, "plain-text");
    assert.deepEqual(chunks, ["plain-text"]);
  } finally {
    server.close();
  }
});

// ===== 多服务商预置目录 =====
import { PROVIDERS, providerBase, chatUrl } from "../src/index.ts";

test("S1-T6 服务商目录：chatUrl 拼接各家版本前缀正确 + 结构完整", () => {
  const map = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));
  // 拼接验算（与后端 chatUrl 一致，面板填的 base 即生效值）
  const urlOf = (id: string, fmt: "openai" | "anthropic") =>
    chatUrl({ ...DEFAULT_SETTINGS, baseURL: providerBase(map[id], fmt), apiFormat: fmt });
  assert.equal(urlOf("deepseek", "openai"), "https://api.deepseek.com/chat/completions");
  assert.equal(urlOf("deepseek", "anthropic"), "https://api.deepseek.com/anthropic/v1/messages");
  assert.equal(urlOf("zhipu", "openai"), "https://open.bigmodel.cn/api/paas/v4/chat/completions"); // 非 /v1
  assert.equal(urlOf("qwen", "openai"), "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  assert.equal(urlOf("kimi", "openai"), "https://api.moonshot.cn/v1/chat/completions");
  assert.equal(urlOf("ollama", "openai"), "http://localhost:11434/v1/chat/completions");
  // 结构约束：国内直连优先；每家 defaultModel ∈ models（custom 除外，自由填）
  const domestic = PROVIDERS.filter((p) => p.access === "domestic");
  assert.ok(domestic.length >= 3, "国内直连家数");
  for (const p of PROVIDERS) {
    if (p.id === "custom") continue;
    assert.ok(p.openaiBase, p.id + " openaiBase");
    assert.ok(!p.openaiBase!.endsWith("/"), p.id + " base 不应以 / 结尾");
    assert.ok(p.defaultModel === "" || p.models.some((m) => m.id === p.defaultModel), p.id + " defaultModel 在 models 内");
    assert.ok(p.consoleUrl && p.docsUrl, p.id + " 有取key/文档链接");
  }
});
