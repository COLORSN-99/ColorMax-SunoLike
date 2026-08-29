import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import {
  readSettings,
  writeSettings,
  validateSettings,
  chatCompletion,
  extractJson,
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
