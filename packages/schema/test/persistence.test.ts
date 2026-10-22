import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryPersistence, type IPersistence } from "../src/persistence.ts";

// ===== IPersistence 接口测试（使用 MemoryPersistence 实现） =====
test("Persistence - get/set 基本功能", () => {
  const storage: IPersistence<{ value: string }> = new MemoryPersistence();
  
  storage.set("key1", { value: "test" });
  const retrieved = storage.get("key1");

  assert.ok(retrieved);
  assert.equal(retrieved.value, "test");
});

test("Persistence - get 不存在的键返回 null", () => {
  const storage: IPersistence<string> = new MemoryPersistence();
  
  const result = storage.get("nonexistent");
  assert.equal(result, null);
});

test("Persistence - set 覆盖已存在的键", () => {
  const storage: IPersistence<number> = new MemoryPersistence();
  
  storage.set("counter", 1);
  storage.set("counter", 2);
  const result = storage.get("counter");

  assert.equal(result, 2);
});

test("Persistence - remove 删除键", () => {
  const storage: IPersistence<string> = new MemoryPersistence();
  
  storage.set("key", "value");
  assert.ok(storage.has("key"));
  
  storage.remove("key");
  assert.ok(!storage.has("key"));
  assert.equal(storage.get("key"), null);
});

test("Persistence - clear 清空所有数据", () => {
  const storage: IPersistence<string> = new MemoryPersistence();
  
  storage.set("key1", "value1");
  storage.set("key2", "value2");
  storage.set("key3", "value3");
  
  assert.equal(storage.keys().length, 3);
  
  storage.clear();
  
  assert.equal(storage.keys().length, 0);
  assert.ok(!storage.has("key1"));
  assert.ok(!storage.has("key2"));
  assert.ok(!storage.has("key3"));
});

test("Persistence - keys 列出所有键", () => {
  const storage: IPersistence<number> = new MemoryPersistence();
  
  storage.set("a", 1);
  storage.set("b", 2);
  storage.set("c", 3);
  
  const keys = storage.keys();
  assert.equal(keys.length, 3);
  assert.ok(keys.includes("a"));
  assert.ok(keys.includes("b"));
  assert.ok(keys.includes("c"));
});

test("Persistence - has 检查键是否存在", () => {
  const storage: IPersistence<boolean> = new MemoryPersistence();
  
  assert.ok(!storage.has("flag"));
  
  storage.set("flag", true);
  assert.ok(storage.has("flag"));
  
  storage.remove("flag");
  assert.ok(!storage.has("flag"));
});

test("Persistence - 支持复杂数据类型", () => {
  interface User {
    id: number;
    name: string;
    tags: string[];
  }
  
  const storage: IPersistence<User> = new MemoryPersistence();
  const user: User = {
    id: 1,
    name: "Alice",
    tags: ["admin", "developer"],
  };
  
  storage.set("user:1", user);
  const retrieved = storage.get("user:1");
  
  assert.ok(retrieved);
  assert.equal(retrieved.id, 1);
  assert.equal(retrieved.name, "Alice");
  assert.equal(retrieved.tags.length, 2);
  assert.ok(retrieved.tags.includes("admin"));
});

test("Persistence - 多个实例互不干扰", () => {
  const storage1: IPersistence<string> = new MemoryPersistence();
  const storage2: IPersistence<string> = new MemoryPersistence();
  
  storage1.set("shared", "from storage1");
  storage2.set("shared", "from storage2");
  
  assert.equal(storage1.get("shared"), "from storage1");
  assert.equal(storage2.get("shared"), "from storage2");
});

test("Persistence - 空字符串键", () => {
  const storage: IPersistence<string> = new MemoryPersistence();
  
  storage.set("", "empty key");
  assert.ok(storage.has(""));
  assert.equal(storage.get(""), "empty key");
});
