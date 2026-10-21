/**
 * 持久化接口：支持多种存储后端（localStorage、IndexedDB、Redis、etc）
 * 当前实现：localStorage（浏览器端），未来可扩展服务端存储
 */

export interface IPersistence<T = unknown> {
  /**
   * 获取数据
   * @param key - 存储键
   * @returns 数据或 null（不存在时）
   */
  get(key: string): T | null;

  /**
   * 设置数据
   * @param key - 存储键
   * @param value - 数据值
   */
  set(key: string, value: T): void;

  /**
   * 删除数据
   * @param key - 存储键
   */
  remove(key: string): void;

  /**
   * 清空所有数据
   */
  clear(): void;

  /**
   * 列出所有键
   * @returns 键数组
   */
  keys(): string[];

  /**
   * 检查键是否存在
   * @param key - 存储键
   * @returns 是否存在
   */
  has(key: string): boolean;
}

/**
 * LocalStorage 持久化适配器
 * 用于浏览器端数据持久化（会话列表、消息历史、用户设置）
 */
export class LocalStoragePersistence<T = unknown> implements IPersistence<T> {
  private prefix: string;

  /**
   * @param prefix - 键前缀，用于命名空间隔离（例如 "colormax:"）
   */
  constructor(prefix = "") {
    this.prefix = prefix;
  }

  private getFullKey(key: string): string {
    return this.prefix + key;
  }

  get(key: string): T | null {
    if (typeof window === "undefined") return null; // SSR 兼容
    try {
      const raw = window.localStorage.getItem(this.getFullKey(key));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  set(key: string, value: T): void {
    if (typeof window === "undefined") return; // SSR 兼容
    try {
      window.localStorage.setItem(this.getFullKey(key), JSON.stringify(value));
    } catch (e) {
      console.error(`[LocalStoragePersistence] Failed to set ${key}:`, e);
    }
  }

  remove(key: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(this.getFullKey(key));
  }

  clear(): void {
    if (typeof window === "undefined") return;
    const keysToRemove = this.keys();
    for (const key of keysToRemove) {
      window.localStorage.removeItem(this.getFullKey(key));
    }
  }

  keys(): string[] {
    if (typeof window === "undefined") return [];
    const result: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        result.push(key.slice(this.prefix.length));
      }
    }
    return result;
  }

  has(key: string): boolean {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(this.getFullKey(key)) !== null;
  }
}

/**
 * 内存持久化适配器（用于测试、SSR、临时数据）
 * 数据仅在进程内存中，进程重启后丢失
 */
export class MemoryPersistence<T = unknown> implements IPersistence<T> {
  private store = new Map<string, T>();

  get(key: string): T | null {
    return this.store.get(key) ?? null;
  }

  set(key: string, value: T): void {
    this.store.set(key, value);
  }

  remove(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}
