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
