/**
 * LLM 提供商预设（从 LlmProviderRegistry 动态生成）
 * 用于向后兼容现有代码
 */
import { llmProviderRegistry } from "./provider-registry.ts";

export interface ProviderModel {
  id: string;
  label: string;
  /** 是否推理模型（可开 thinking 透传 reasoning_content） */
  reasoning?: boolean;
}

export interface ProviderPreset {
  id: string;
  label: string;
  /** 区域/联网提示：domestic=国内直连，proxy=需代理/科学上网，local=本地 */
  access: "domestic" | "proxy" | "local";
  openaiBase?: string;
  anthropicBase?: string;
  defaultFormat: "openai" | "anthropic";
  models: ProviderModel[];
  defaultModel: string;
  defaultMaxTokens: number;
  /** 控制台（建/取 API Key） */
  consoleUrl: string;
  /** 余额 / 充值查看（可选） */
  balanceUrl?: string;
  /** 接入文档 */
  docsUrl: string;
  /** 备注（如区域区分、免费模型） */
  note?: string;
}

/**
 * 从 LlmProviderRegistry 动态生成提供商列表
 */
export function getProviders(): readonly ProviderPreset[] {
  const registryProviders = llmProviderRegistry.list();
  
  // 将 registry 提供商映射为 ProviderPreset 格式
  const dynamicProviders: ProviderPreset[] = registryProviders.map(p => ({
    id: p.id,
    label: p.name,
    access: (p.id === "deepseek" || p.id === "deepseek-reasoning") ? "domestic" : "proxy" as const,
    openaiBase: p.apiFormat === "openai" ? p.defaultBaseURL : undefined,
    anthropicBase: p.apiFormat === "anthropic" ? p.defaultBaseURL : undefined,
    defaultFormat: p.apiFormat,
    models: [{ id: p.defaultModel, label: p.defaultModel }],
    defaultModel: p.defaultModel,
    defaultMaxTokens: 4096,
    consoleUrl: "",
    docsUrl: "",
    note: `从 LlmProviderRegistry 动态加载`,
  }));
  
  // 添加 custom 选项
  dynamicProviders.push({
    id: "custom",
    label: "自定义（OpenAI/Anthropic 兼容）",
    access: "proxy",
    defaultFormat: "openai",
    models: [],
    defaultModel: "",
    defaultMaxTokens: 4096,
    consoleUrl: "",
    docsUrl: "",
    note: "任意 OpenAI 兼容 /v1 或 Anthropic 兼容端点，字段全手动",
  });
  
  return dynamicProviders;
}

/**
 * 向后兼容：PROVIDERS 常量现从 registry 动态生成
 */
export const PROVIDERS: readonly ProviderPreset[] = getProviders();

export const PROVIDER_BY_ID = (id: string): ProviderPreset | undefined =>
  PROVIDERS.find((p) => p.id === id);

/** 选服务商 + API 格式 → 面板应填的 BaseURL */
export const providerBase = (p: ProviderPreset, format: "openai" | "anthropic"): string =>
  format === "anthropic" ? (p.anthropicBase ?? p.openaiBase ?? "") : (p.openaiBase ?? "");
