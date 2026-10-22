import type { EngineAdapter } from "./index.ts";

/**
 * 音乐引擎注册表
 * 支持动态注册多个引擎实现，实现插件化架构
 */
export class EngineRegistry {
  private engines = new Map<string, EngineAdapter>();
  private defaultEngineId: string | null = null;

  /**
   * 注册引擎
   * @param id - 引擎唯一标识符
   * @param engine - 引擎适配器实例
   * @param isDefault - 是否设为默认引擎
   */
  register(id: string, engine: EngineAdapter, isDefault = false): void {
    this.engines.set(id, engine);
    if (isDefault || this.defaultEngineId === null) {
      this.defaultEngineId = id;
    }
  }

  /**
   * 获取引擎
   * @param id - 引擎标识符（可选，默认返回默认引擎）
   * @returns 引擎适配器实例
   */
  get(id?: string): EngineAdapter | null {
    if (id) {
      return this.engines.get(id) ?? null;
    }
    if (this.defaultEngineId) {
      return this.engines.get(this.defaultEngineId) ?? null;
    }
    return null;
  }

  /**
   * 列出所有已注册引擎
   * @returns 引擎ID列表
   */
  list(): string[] {
    return Array.from(this.engines.keys());
  }

  /**
   * 检查引擎是否已注册
   * @param id - 引擎标识符
   * @returns 是否已注册
   */
  has(id: string): boolean {
    return this.engines.has(id);
  }

  /**
   * 注销引擎
   * @param id - 引擎标识符
   */
  unregister(id: string): void {
    this.engines.delete(id);
    if (this.defaultEngineId === id) {
      const remaining = Array.from(this.engines.keys());
      this.defaultEngineId = remaining[0] ?? null;
    }
  }

  /**
   * 获取默认引擎ID
   * @returns 默认引擎标识符
   */
  getDefaultId(): string | null {
    return this.defaultEngineId;
  }

  /**
   * 设置默认引擎
   * @param id - 引擎标识符
   */
  setDefault(id: string): void {
    if (this.engines.has(id)) {
      this.defaultEngineId = id;
    } else {
      throw new Error(`Engine "${id}" not registered`);
    }
  }
}

/**
 * 全局引擎注册表实例
 * 应用启动时注册所有可用引擎
 */
export const engineRegistry = new EngineRegistry();
