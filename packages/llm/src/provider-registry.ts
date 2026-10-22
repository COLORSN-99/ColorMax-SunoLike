import type { LlmSettings } from "./index.ts";

/**
 * LLM 提供商插件接口
 * 支持动态注册多个 LLM 提供商 (DeepSeek, OpenAI, Anthropic, 等)
 */
export interface LlmProvider {
  /** 提供商唯一标识 */
  id: string;
  /** 提供商显示名称 */
  name: string;
  /** 默认 API 端点 */
  defaultBaseURL: string;
  /** 支持的 API 格式 */
  apiFormat: "openai" | "anthropic";
  /** 默认模型 */
  defaultModel: string;
  /** 验证设置是否有效 */
  validate?: (settings: Partial<LlmSettings>) => string | null;
}

/**
 * LLM 提供商注册表
 * 支持插件化架构，方便扩展新的 LLM 提供商
 */
export class LlmProviderRegistry {
  private providers = new Map<string, LlmProvider>();
  private defaultProviderId: string | null = null;

  /**
   * 注册提供商
   * @param provider - 提供商配置
   * @param isDefault - 是否设为默认提供商
   */
  register(provider: LlmProvider, isDefault = false): void {
    this.providers.set(provider.id, provider);
    if (isDefault || this.defaultProviderId === null) {
      this.defaultProviderId = provider.id;
    }
  }

  /**
   * 获取提供商
   * @param id - 提供商标识符（可选，默认返回默认提供商）
   * @returns 提供商配置
   */
  get(id?: string): LlmProvider | null {
    if (id) {
      return this.providers.get(id) ?? null;
    }
    if (this.defaultProviderId) {
      return this.providers.get(this.defaultProviderId) ?? null;
    }
    return null;
  }

  /**
   * 列出所有已注册的提供商
   * @returns 提供商配置数组
   */
  list(): LlmProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 检查提供商是否已注册
   * @param id - 提供商标识符
   * @returns 是否已注册
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * 获取默认提供商 ID
   */
  getDefaultId(): string | null {
    return this.defaultProviderId;
  }

  /**
   * 设置默认提供商
   * @param id - 提供商标识符
   */
  setDefault(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`Provider ${id} not found`);
    }
    this.defaultProviderId = id;
  }

  /**
   * 取消注册提供商
   * @param id - 提供商标识符
   */
  unregister(id: string): void {
    this.providers.delete(id);
    if (this.defaultProviderId === id) {
      const firstProvider = this.providers.keys().next();
      this.defaultProviderId = firstProvider.done ? null : firstProvider.value;
    }
  }
}

/**
 * 全局 LLM 提供商注册表实例
 */
export const llmProviderRegistry = new LlmProviderRegistry();

// 注册内置提供商
llmProviderRegistry.register(
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultBaseURL: "https://api.deepseek.com",
    apiFormat: "openai",
    defaultModel: "deepseek-v4-flash",
  },
  true, // 设为默认
);

llmProviderRegistry.register({
  id: "openai",
  name: "OpenAI",
  defaultBaseURL: "https://api.openai.com/v1",
  apiFormat: "openai",
  defaultModel: "gpt-4",
});

llmProviderRegistry.register({
  id: "anthropic",
  name: "Anthropic",
  defaultBaseURL: "https://api.anthropic.com/v1",
  apiFormat: "anthropic",
  defaultModel: "claude-3-5-sonnet-20241022",
});

llmProviderRegistry.register({
  id: "deepseek-reasoning",
  name: "DeepSeek R1",
  defaultBaseURL: "https://api.deepseek.com",
  apiFormat: "openai",
  defaultModel: "deepseek-reasoner",
});
