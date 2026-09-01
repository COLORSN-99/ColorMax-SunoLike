/**
 * LLM 服务商预置目录（单一事实源：packages/llm，供 /api/settings 与设置页共享）。
 * 每家 base 已按 chatUrl 拼接规则验算：
 *   chatUrl = strip 尾斜杠(base) + ("/messages" | "/chat/completions")
 * 因此各家版本前缀差异（智谱 /api/paas/v4、阿里 /compatible-mode/v1、DeepSeek Anthropic /anthropic/v1）
 * 全部内联进 openaiBase/anthropicBase，面板选中即填对，不再要求用户懂各家的 path 差异。
 */
export interface ProviderModel {
  id: string;
  label: string;
  /** 是否推理模型（可开 thinking 透传 reasoning_content） */
  reasoning?: boolean;
}

export interface ProviderPreset {
  id: string;
  label: string; // 下拉展示名
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

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    access: "domestic",
    openaiBase: "https://api.deepseek.com",
    anthropicBase: "https://api.deepseek.com/anthropic/v1",
    defaultFormat: "openai",
    models: [
      { id: "deepseek-v4-flash", label: "V4 Flash（快/省）" },
      { id: "deepseek-v4-pro", label: "V4 Pro（强推理）", reasoning: true },
      { id: "deepseek-chat", label: "chat（通用）" },
      { id: "deepseek-reasoner", label: "reasoner（推理链）", reasoning: true },
    ],
    defaultModel: "deepseek-v4-flash",
    defaultMaxTokens: 4096,
    consoleUrl: "https://platform.deepseek.com/api_keys",
    balanceUrl: "https://platform.deepseek.com/usage",
    docsUrl: "https://api-docs.deepseek.com/zh-cn/",
    note: "OpenAI + Anthropic 双兼容；余额不足返回 HTTP 402",
  },
  {
    id: "qwen",
    label: "阿里云百炼 · 通义千问",
    access: "domestic",
    openaiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultFormat: "openai",
    models: [
      { id: "qwen-plus", label: "qwen-plus（均衡）" },
      { id: "qwen-turbo", label: "qwen-turbo（极省）" },
      { id: "qwen-max", label: "qwen-max（强）", reasoning: true },
    ],
    defaultModel: "qwen-plus",
    defaultMaxTokens: 4096,
    consoleUrl: "https://bailian.console.aliyun.com/?tab=model#/api-key",
    balanceUrl: "https://bailian.console.aliyun.com/?tab=costing#/cost-detail",
    docsUrl: "https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope",
    note: "OpenAI 兼容模式；国际站改用 https://dashscope-intl.aliyuncs.com/compatible-mode/v1（需国际站 Key）",
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    access: "domestic",
    openaiBase: "https://open.bigmodel.cn/api/paas/v4",
    defaultFormat: "openai",
    models: [
      { id: "glm-4-flash", label: "GLM-4-Flash（免费）" },
      { id: "glm-4-plus", label: "GLM-4-Plus" },
      { id: "glm-z1-air", label: "GLM-Z1（推理）", reasoning: true },
    ],
    defaultModel: "glm-4-flash",
    defaultMaxTokens: 4096,
    consoleUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    balanceUrl: "https://open.bigmodel.cn/usercenter/proj-mgmt/resource/limits",
    docsUrl: "https://docs.bigmodel.cn/cn/guide/develop/openai",
    note: "OpenAI 兼容端点在 /api/paas/v4（非 /v1），已内联；GLM-4-Flash 免费",
  },
  {
    id: "kimi",
    label: "月之暗面 · Kimi",
    access: "domestic",
    openaiBase: "https://api.moonshot.cn/v1",
    anthropicBase: "https://api.moonshot.cn/anthropic",
    defaultFormat: "openai",
    models: [
      { id: "kimi-k2-turbo-preview", label: "K2 Turbo" },
      { id: "moonshot-v1-8k", label: "v1-8K（短）" },
      { id: "moonshot-v1-128k", label: "v1-128K（长上下文）" },
    ],
    defaultModel: "kimi-k2-turbo-preview",
    defaultMaxTokens: 4096,
    consoleUrl: "https://platform.moonshot.cn/console/api-keys",
    balanceUrl: "https://platform.moonshot.cn/console/account",
    docsUrl: "https://platform.moonshot.cn/docs/api/chat",
    note: "OpenAI 兼容为主，亦支持 Anthropic Messages；国际站 api.moonshot.ai",
  },
  {
    id: "siliconflow",
    label: "硅基流动 SiliconFlow",
    access: "domestic",
    openaiBase: "https://api.siliconflow.cn/v1",
    defaultFormat: "openai",
    models: [
      { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek-V3（聚合）" },
      { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen2.5-72B" },
      { id: "THUDM/glm-4-9b-chat", label: "GLM-4-9B" },
    ],
    defaultModel: "deepseek-ai/DeepSeek-V3",
    defaultMaxTokens: 4096,
    consoleUrl: "https://cloud.siliconflow.cn/account/ak",
    balanceUrl: "https://cloud.siliconflow.cn/account/charge",
    docsUrl: "https://docs.siliconflow.cn/cn/api/openai/chat-completions",
    note: "开源模型聚合，一个 Key 跑 Qwen/GLM/DeepSeek 等；多数模型有免费额度",
  },
  {
    id: "openai",
    label: "OpenAI 官方",
    access: "proxy",
    openaiBase: "https://api.openai.com/v1",
    defaultFormat: "openai",
    models: [
      { id: "gpt-4o-mini", label: "gpt-4o-mini（便宜）" },
      { id: "gpt-4.1", label: "gpt-4.1" },
      { id: "o3-mini", label: "o3-mini（推理）", reasoning: true },
    ],
    defaultModel: "gpt-4o-mini",
    defaultMaxTokens: 4096,
    consoleUrl: "https://platform.openai.com/api-keys",
    balanceUrl: "https://platform.openai.com/usage",
    docsUrl: "https://platform.openai.com/docs/api-reference/chat",
    note: "需代理/科学上网；国内 IP 直连会被拒",
  },
  {
    id: "xai",
    label: "xAI · Grok",
    access: "proxy",
    openaiBase: "https://api.x.ai/v1",
    defaultFormat: "openai",
    models: [
      { id: "grok-3-mini", label: "grok-3-mini" },
      { id: "grok-3", label: "grok-3" },
      { id: "grok-3-mini-reasoning", label: "grok-3-mini 推理", reasoning: true },
    ],
    defaultModel: "grok-3-mini",
    defaultMaxTokens: 4096,
    consoleUrl: "https://console.x.ai",
    balanceUrl: "https://console.x.ai",
    docsUrl: "https://docs.x.ai/docs/api-reference",
    note: "需代理/科学上网",
  },
  {
    id: "ollama",
    label: "Ollama（本地）",
    access: "local",
    openaiBase: "http://localhost:11434/v1",
    defaultFormat: "openai",
    models: [{ id: "qwen2.5", label: "qwen2.5（示例，随本地 pull）" }],
    defaultModel: "qwen2.5",
    defaultMaxTokens: 2048,
    consoleUrl: "https://ollama.com/library",
    docsUrl: "https://github.com/ollama/ollama/blob/main/docs/openai.md",
    note: "本地零成本、离线可用；模型名 = 你 ollama pull 的名字，可手动改",
  },
  {
    id: "custom",
    label: "自定义（OpenAI/Anthropic 兼容）",
    access: "domestic",
    defaultFormat: "openai",
    models: [],
    defaultModel: "",
    defaultMaxTokens: 4096,
    consoleUrl: "",
    docsUrl: "",
    note: "任意 OpenAI 兼容 /v1 或 Anthropic 兼容端点，字段全手动",
  },
];

export const PROVIDER_BY_ID = (id: string): ProviderPreset | undefined =>
  PROVIDERS.find((p) => p.id === id);

/** 选服务商 + API 格式 → 面板应填的 BaseURL（各家版本前缀已内联） */
export const providerBase = (p: ProviderPreset, format: "openai" | "anthropic"): string =>
  format === "anthropic" ? (p.anthropicBase ?? p.openaiBase ?? "") : (p.openaiBase ?? "");
