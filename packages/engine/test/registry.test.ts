import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineRegistry, MockAdapter } from "../src/index.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("EngineRegistry - 注册和获取引擎", () => {
  const registry = new EngineRegistry();
  const mockEngine = new MockAdapter(mkdtempSync(join(tmpdir(), "engine-")));

  registry.register("mock", mockEngine);
  
  assert.ok(registry.has("mock"));
  assert.equal(registry.get("mock"), mockEngine);
  assert.deepEqual(registry.list(), ["mock"]);
});

test("EngineRegistry - 默认引擎", () => {
  const registry = new EngineRegistry();
  const dir1 = mkdtempSync(join(tmpdir(), "engine-"));
  const dir2 = mkdtempSync(join(tmpdir(), "engine-"));
  
  const engine1 = new MockAdapter(dir1);
  const engine2 = new MockAdapter(dir2);

  registry.register("engine1", engine1, true);
  registry.register("engine2", engine2);

  assert.equal(registry.getDefaultId(), "engine1");
  assert.equal(registry.get(), engine1);

  registry.setDefault("engine2");
  assert.equal(registry.getDefaultId(), "engine2");
  assert.equal(registry.get(), engine2);

  rmSync(dir1, { recursive: true, force: true });
  rmSync(dir2, { recursive: true, force: true });
});

test("EngineRegistry - 注销引擎", () => {
  const registry = new EngineRegistry();
  const mockEngine = new MockAdapter(mkdtempSync(join(tmpdir(), "engine-")));

  registry.register("mock", mockEngine);
  assert.ok(registry.has("mock"));

  registry.unregister("mock");
  assert.ok(!registry.has("mock"));
  assert.equal(registry.get("mock"), null);
});

test("EngineRegistry - 注销默认引擎自动切换", () => {
  const registry = new EngineRegistry();
  const dir1 = mkdtempSync(join(tmpdir(), "engine-"));
  const dir2 = mkdtempSync(join(tmpdir(), "engine-"));
  
  const engine1 = new MockAdapter(dir1);
  const engine2 = new MockAdapter(dir2);

  registry.register("engine1", engine1, true);
  registry.register("engine2", engine2);

  assert.equal(registry.getDefaultId(), "engine1");

  registry.unregister("engine1");
  assert.equal(registry.getDefaultId(), "engine2");

  rmSync(dir1, { recursive: true, force: true });
  rmSync(dir2, { recursive: true, force: true });
});

test("EngineRegistry - 设置不存在的默认引擎抛错", () => {
  const registry = new EngineRegistry();

  assert.throws(() => {
    registry.setDefault("nonexistent");
  }, /not registered/);
});
