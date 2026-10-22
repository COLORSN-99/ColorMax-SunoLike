import { test, describe } from "node:test";
import assert from "node:assert";
import { RawLocalStoragePersistence } from "@colormax/schema";

/**
 * localStorage 持久化向后兼容性测试
 * 验证通过 IPersistence 访问的数据与直接 localStorage 写入的数据完全兼容
 */

// 模拟 localStorage
class MockLocalStorage implements Storage {
  private store: Map<string, string> = new Map();
  
  get length(): number {
    return this.store.size;
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

describe("IPersistence 向后兼容性测试", () => {
  test("应该能读取旧格式 cm.sessions 数据", () => {
    const mockStorage = new MockLocalStorage();
    
    // 模拟旧版本直接写入的数据（JSON 字符串）
    const legacyData = JSON.stringify([
      { id: "old1", title: "旧会话", createdAt: 123, updatedAt: 456 }
    ]);
    mockStorage.setItem("cm.sessions", legacyData);
    
    // 使用 RawLocalStoragePersistence 读取（无前缀，无 JSON 编码）
    const persistence = new RawLocalStoragePersistence("", mockStorage);
    const data = persistence.get("cm.sessions");
    
    assert.strictEqual(data, legacyData);
    const parsed = JSON.parse(data!);
    assert.strictEqual(parsed[0].id, "old1");
    assert.strictEqual(parsed[0].title, "旧会话");
  });

  test("应该保持相同的 key 格式写入", () => {
    const mockStorage = new MockLocalStorage();
    const persistence = new RawLocalStoragePersistence("", mockStorage);
    
    const sessionsData = JSON.stringify([{ id: "new1", title: "新会话" }]);
    
    // 通过 persistence 写入
    persistence.set("cm.sessions", sessionsData);
    
    // 直接从 mockStorage 读取，验证格式一致
    const direct = mockStorage.getItem("cm.sessions");
    assert.strictEqual(direct, sessionsData);
    assert.strictEqual(JSON.parse(direct!)[0].id, "new1");
  });

  test("应该能处理 cm.msgs:sessionId 格式", () => {
    const mockStorage = new MockLocalStorage();
    const persistence = new RawLocalStoragePersistence("", mockStorage);
    
    const sessionId = "sess123";
    const msgsKey = `cm.msgs:${sessionId}`;
    const msgsData = JSON.stringify([
      { role: "user", segments: [{ kind: "text", text: "测试消息" }] }
    ]);
    
    // 写入
    persistence.set(msgsKey, msgsData);
    
    // 读取
    const retrieved = persistence.get(msgsKey);
    assert.strictEqual(retrieved, msgsData);
    
    // 验证直接从 storage 也能读到
    assert.strictEqual(mockStorage.getItem(msgsKey), msgsData);
    
    // 验证数据可解析
    const parsed = JSON.parse(retrieved!);
    assert.strictEqual(parsed[0].role, "user");
    assert.strictEqual(parsed[0].segments[0].text, "测试消息");
  });

  test("应该能处理 cm.board.snapshot 和 cm.board.at", () => {
    const mockStorage = new MockLocalStorage();
    const persistence = new RawLocalStoragePersistence("", mockStorage);
    
    const boardData = JSON.stringify([{ id: "song1", title: "测试歌曲" }]);
    const timestamp = String(Date.now());
    
    persistence.set("cm.board.snapshot", boardData);
    persistence.set("cm.board.at", timestamp);
    
    assert.strictEqual(persistence.get("cm.board.snapshot"), boardData);
    assert.strictEqual(persistence.get("cm.board.at"), timestamp);
    
    // 验证可以解析
    const parsed = JSON.parse(persistence.get("cm.board.snapshot")!);
    assert.strictEqual(parsed[0].id, "song1");
  });

  test("应该能处理 cm.resume:jobId 格式", () => {
    const mockStorage = new MockLocalStorage();
    const persistence = new RawLocalStoragePersistence("", mockStorage);
    
    const jobId = "job456";
    const resumeKey = `cm.resume:${jobId}`;
    const resumeData = JSON.stringify({ snap: { state: "test" }, at: Date.now() });
    
    persistence.set(resumeKey, resumeData);
    const retrieved = persistence.get(resumeKey);
    
    assert.strictEqual(retrieved, resumeData);
    
    // 验证可以解析
    const parsed = JSON.parse(retrieved!);
    assert.ok(parsed.snap);
    assert.ok(parsed.at);
  });

  test("不应该进行 JSON 双重编码", () => {
    const mockStorage = new MockLocalStorage();
    const persistence = new RawLocalStoragePersistence("", mockStorage);
    
    const originalData = JSON.stringify({ key: "value" });
    persistence.set("test.key", originalData);
    
    // 直接从 storage 读取，不应有双引号包裹
    const fromStorage = mockStorage.getItem("test.key");
    assert.strictEqual(fromStorage, originalData);
    assert.ok(!fromStorage!.startsWith('"'));
    
    // 通过 persistence 读取也应该得到原始数据
    const fromPersistence = persistence.get("test.key");
    assert.strictEqual(fromPersistence, originalData);
  });
});
