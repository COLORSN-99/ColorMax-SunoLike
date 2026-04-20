# ColorMax 项目约束文档

> AI 提示词中台 — 将多模态输入转换为精准 Prompt，交付给大模型

---

## 产品定位

### 核心定位
**AI 提示词中台（中间件）**

### 核心价值
- 多模态理解：解析不同输入源（文本、音频、图像、文件）
- Prompt 构建：将理解结果转换为精准 Prompt
- AI 智能优化：通过 LLM 优化 Prompt 质量
- 直连生成：对接 AI 平台 API 一键生成
- 跨模态融合：多种输入组合成一个 Prompt

### 交付物形式
- Prompt（精简指令文本）
- MCP（Model Context Protocol JSON）
- Skill（Claude 可执行技能 Markdown）

### 产品分层

| 层级 | 占比 | 说明 |
|------|------|------|
| 创作体验 | 50% | 可视化编辑、参数引导、工作流、风格探索 |
| 多模态 + AI | 30% | 插件系统、AI 优化、直连平台 |
| 平台化 | 20% | 导入导出、分享、模板社区 |

### 产品边界
- **做**中间件，不做平台托管
- **做**纯本地 + 文件导出分享，不做用户账号体系
- **做**多模态输入 → 单一 Prompt 输出
- **做** AI 智能优化 + 直连平台生成
- **不托管** MCP Servers
- **不做**内容审核（本地数据）

---

## 技术栈

| 类别 | 选择 | 版本约束 |
|------|------|---------|
| 框架 | Nuxt 4 | ^4.x |
| 语言 | TypeScript 严格模式 | ^5.7.0 |
| UI 库 | Element Plus | ^2.9.0 |
| CSS | UnoCSS | ^66.x |
| 状态管理 | Pinia 3 | ^3.0 |
| 后端 | Nuxt Server Routes (Nitro) | 随 Nuxt |
| 运行时校验 | Zod | 待安装 |
| 本地存储 | IndexedDB (idb) | 待安装 |

---

## 编码规范

### 组件规范
- 使用 Vue 3 Composition API + `<script setup lang="ts">`
- 组件文件命名：PascalCase（如 `VisualPromptEditor.vue`）
- 组件目录按功能分组：`editor/`、`input/`、`output/`、`workflow/`、`explore/`、`share/`

### 组合式函数规范
- 文件命名：use 前缀（如 `usePlugin.ts`、`useAiService.ts`）
- 统一放在 `app/composables/` 目录

### Store 规范
- 按领域拆分 store（template / workspace / plugin / workflow / explore）
- State 必须有 TypeScript 类型
- Actions 负责业务逻辑，Getters 负责派生计算

### 类型规范
- 公共类型放 `app/types/`
- 按领域拆分文件：`plugin.ts`、`workflow.ts`、`ai.ts`、`share.ts`、`explore.ts`
- 禁止使用 `any`，必须明确类型

### API 规范
- RESTful 风格
- Server Routes 统一放 `server/api/`
- 请求体用 Zod Schema 校验
- 统一错误响应格式：`{ statusCode, message, details? }`

### 样式规范
- 全局 CSS 变量定义在 `app/assets/styles/main.css`
- 组件样式使用 `<style scoped>`
- UnoCSS 工具类优先，复杂样式用 scoped CSS

---

## 项目结构

```
ColorMax-SunoLike/
├── app/
│   ├── app.vue                          # 根组件
│   ├── pages/                           # 页面路由
│   │   ├── index.vue                    # 创作工作台首页
│   │   ├── workspace/[id].vue           # 单个工作区
│   │   ├── explore.vue                  # 风格探索
│   │   ├── plugins.vue                  # 插件管理
│   │   └── share/import.vue             # 导入分享
│   ├── components/                      # 组件（按功能分组）
│   │   ├── editor/                      # 可视化编辑器组件
│   │   ├── input/                       # 多模态输入组件
│   │   ├── output/                      # 输出通道组件
│   │   ├── workflow/                    # 工作流组件
│   │   ├── explore/                     # 风格探索组件
│   │   ├── guidance/                    # 参数引导组件
│   │   └── share/                       # 导入导出组件
│   ├── composables/                     # 组合式函数
│   │   ├── usePlugin.ts
│   │   ├── useAudioInput.ts
│   │   ├── useImageInput.ts
│   │   ├── useAiService.ts
│   │   ├── useWorkflow.ts
│   │   ├── useHistory.ts
│   │   ├── useStyleExplore.ts
│   │   ├── useShare.ts
│   │   └── useIndexedDB.ts
│   ├── stores/                          # Pinia Store
│   │   ├── template.ts
│   │   ├── workspace.ts
│   │   ├── plugin.ts
│   │   ├── workflow.ts
│   │   └── explore.ts
│   ├── types/                           # TypeScript 类型
│   │   ├── index.ts
│   │   ├── plugin.ts
│   │   ├── workflow.ts
│   │   ├── ai.ts
│   │   ├── share.ts
│   │   └── explore.ts
│   ├── plugins/                         # 内置插件实现
│   │   ├── audio-hum/index.ts
│   │   ├── image-style/index.ts
│   │   └── text-refine/index.ts
│   └── assets/styles/main.css
├── server/
│   ├── api/
│   │   ├── ai/
│   │   │   ├── optimize.post.ts         # LLM Prompt 优化
│   │   │   └── generate.post.ts         # 直连 AI 平台生成
│   │   ├── plugins/
│   │   │   ├── parse-audio.post.ts      # 音频解析
│   │   │   └── parse-image.post.ts      # 图片解析
│   │   └── share/
│   │       └── validate.post.ts         # 导入文件校验
│   └── utils/
│       ├── ai-client.ts                 # AI API 客户端
│       └── plugin-runner.ts             # 插件运行时
├── public/
├── nuxt.config.ts
├── package.json
├── tsconfig.json
├── turbo.json
└── AGENTS.md                            # 本文件
```

---

## 核心类型定义

### 插件系统

```typescript
interface Plugin {
  id: string
  name: string
  version: string
  description: string
  author?: string
  icon?: string
  inputType: 'audio' | 'image' | 'text' | 'file' | 'ai-output'
  outputType: 'prompt-fragment' | 'variable-suggestion'
  config?: PluginConfig
  parse(input: PluginInput): Promise<PluginResult>
}

interface PluginInput {
  data: Blob | string | File
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
}

interface PluginResult {
  fragments: PromptFragment[]
  suggestions?: VariableSuggestion[]
  metadata?: Record<string, unknown>
}

interface PromptFragment {
  field: string
  value: string
  confidence: number
  source: string
}

interface VariableSuggestion {
  variableKey: string
  suggestedValues: string[]
  reason: string
}

interface PluginConfig {
  enabled: boolean
  settings: Record<string, unknown>
}
```

### 模板系统

```typescript
interface TemplateVariable {
  key: string
  label: string
  description?: string
  defaultValue?: string
  type: 'string' | 'number' | 'select' | 'textarea'
  options?: string[]
  required: boolean
}

interface PromptTemplate {
  id: string
  name: string
  description: string
  content: string
  variables: TemplateVariable[]
  category: 'music' | 'image' | 'text' | 'video' | 'custom'
  platform: string[]
  tags?: string[]
  createdAt: string
  updatedAt: string
}
```

### 工作流

```typescript
interface Workflow {
  id: string
  name: string
  templateId: string
  versions: WorkflowVersion[]
  createdAt: string
  updatedAt: string
}

interface WorkflowVersion {
  id: string
  snapshot: WorkflowSnapshot
  label?: string
  createdAt: string
}

interface WorkflowSnapshot {
  templateId: string
  variableValues: Record<string, string>
  outputFormat: OutputFormat
  pluginResults?: Record<string, PluginResult>
}
```

### AI 服务

```typescript
interface OptimizeRequest {
  prompt: string
  targetPlatform?: 'suno' | 'udio' | 'elevenlabs' | 'openai' | 'claude' | 'generic'
  optimizationGoals: ('clarity' | 'creativity' | 'specificity' | 'style')[]
  language?: string
}

interface OptimizeResponse {
  optimizedPrompt: string
  originalPrompt: string
  changes: PromptChange[]
  qualityScore: number
}

interface GenerateRequest {
  prompt: string
  platform: 'suno' | 'udio' | 'elevenlabs'
  platformConfig: Record<string, unknown>
}

interface GenerateResponse {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  resultUrl?: string
  result?: unknown
}

interface PromptChange {
  section: string
  original: string
  optimized: string
  reason: string
}
```

### 分享系统

```typescript
interface SharePackage {
  version: string
  exportedAt: string
  templates: PromptTemplate[]
  plugins?: PluginShareInfo[]
  workflows?: Workflow[]
  metadata: {
    source: 'colormax'
    version: string
  }
}

interface PluginShareInfo {
  id: string
  name: string
  config: PluginConfig
}
```

---

## Zod Schema 约束

```typescript
import { z } from 'zod'

const TemplateVariableSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  defaultValue: z.string().optional(),
  type: z.enum(['string', 'number', 'select', 'textarea']),
  options: z.array(z.string()).optional(),
  required: z.boolean().default(false),
})

const PromptTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  content: z.string().min(1),
  variables: z.array(TemplateVariableSchema),
  category: z.enum(['music', 'image', 'text', 'video', 'custom']),
  platform: z.array(z.string()),
  tags: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const SharePackageSchema = z.object({
  version: z.string(),
  exportedAt: z.string(),
  templates: z.array(PromptTemplateSchema),
  plugins: z.array(z.object({
    id: z.string(),
    name: z.string(),
    config: z.record(z.unknown()),
  })).optional(),
  workflows: z.array(z.any()).optional(),
  metadata: z.object({
    source: z.literal('colormax'),
    version: z.string(),
  }),
})

const OptimizeRequestSchema = z.object({
  prompt: z.string().min(1),
  targetPlatform: z.enum([
    'suno', 'udio', 'elevenlabs', 'openai', 'claude', 'generic',
  ]).optional(),
  optimizationGoals: z.array(
    z.enum(['clarity', 'creativity', 'specificity', 'style']),
  ).min(1),
  language: z.string().optional(),
})
```

---

## Server Routes 规范

### 文件命名
- 路径：`server/api/{domain}/{action}.{method}.ts`
- 方法后缀：`.get.ts`、`.post.ts`、`.put.ts`、`.delete.ts`

### 统一错误响应

```typescript
{
  statusCode: number
  message: string
  details?: unknown
}
```

### API 路由表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/optimize` | LLM Prompt 智能优化 |
| POST | `/api/ai/generate` | 直连 AI 平台生成内容 |
| POST | `/api/plugins/parse-audio` | 音频解析（服务端处理） |
| POST | `/api/plugins/parse-image` | 图片解析（服务端处理） |
| POST | `/api/share/validate` | 导入文件校验 |

---

## 环境变量

```bash
# .env（不入库）
NUXT_AI_API_KEY=           # OpenAI/Claude API Key
NUXT_SUNO_API_KEY=         # Suno API Key
NUXT_UDIO_API_KEY=         # Udio API Key
NUXT_AI_BASE_URL=          # AI API 代理地址（可选）
```

在 `nuxt.config.ts` 中通过 `runtimeConfig` 暴露：

```typescript
runtimeConfig: {
  aiApiKey: process.env.NUXT_AI_API_KEY,
  sunoApiKey: process.env.NUXT_SUNO_API_KEY,
  udioApiKey: process.env.NUXT_UDIO_API_KEY,
  aiBaseUrl: process.env.NUXT_AI_BASE_URL,
}
```

---

## 分期路线图

### Phase 1 — 创作体验 + 多模态（当前阶段）
- [ ] 1.1 可视化 Prompt 编辑器（块级编辑 + 拖拽）
- [ ] 1.2 参数引导系统（智能建议 + 校验）
- [ ] 1.3 工作流历史（版本管理 + 快照 + 对比）
- [ ] 1.4 插件系统框架（注册 / 加载 / 配置）
- [ ] 1.5 音频输入插件（哼唱 → 参数建议）
- [ ] 1.6 图像输入插件（图片 → 风格标签）
- [ ] 1.7 跨模态融合面板（多输入源合并）

### Phase 2 — AI 能力集成
- [ ] 2.1 Server Routes 基础搭建
- [ ] 2.2 LLM Prompt 智能优化
- [ ] 2.3 Prompt 质量评分
- [ ] 2.4 直连 Suno API 生成
- [ ] 2.5 直连 Udio API 生成
- [ ] 2.6 生成结果回显 + 播放

### Phase 3 — 平台化 + 生态
- [ ] 3.1 JSON 导出 / 导入系统
- [ ] 3.2 插件包分享格式（.cmp）
- [ ] 3.3 风格探索（标签 + 预设库）
- [ ] 3.4 社区模板浏览（纯文件分享模式）
- [ ] 3.5 批量输出 + 格式化
- [ ] 3.6 插件管理界面

---

## 约束检查清单

每次提交代码前自查：

- [ ] 组件命名符合 PascalCase 规范
- [ ] 组合式函数使用 use 前缀
- [ ] API 调用通过 composables 或 server routes
- [ ] TypeScript 类型定义完整，无 `any`
- [ ] Server Route 请求体有 Zod Schema 校验
- [ ] 分包结构清晰（按功能分组）
- [ ] 不提交 API Key 等敏感信息
- [ ] scoped 样式不泄漏

---

## 决策日志

| 日期 | 决策 | 依据 |
|------|------|------|
| 2026-04-17 | 从 AI 音乐产品转为 AI 提示词中台 | 需求调整 |
| 2026-04-17 | 插件式架构 | 扩展性需求 |
| 2026-04-17 | 本地优先，70/30 功能分层 | 用户体验优先 |
| 2026-04-20 | 全面拓展产品边界 | 产品成长 |
| 2026-04-20 | 纯本地 + 文件导出分享（不做登录） | 保持轻量，降低使用门槛 |
| 2026-04-20 | Nuxt Server Routes 全栈 | 前后端一体，API 代理保护密钥 |
| 2026-04-20 | LLM 智能优化 + 直连平台 API 都做 | 完整链路价值 |
| 2026-04-20 | 分期推进：体验/多模态 → AI 集成 → 平台化 | 渐进式交付 |
