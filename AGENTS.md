# ColorMax 项目约束文档

> AI 音乐创作全链路平台 — 让每个人都能用自然语言创作专业级音乐

---

## 产品定位

### 核心定位
**AI 音乐创作全链路平台**

从"AI 提示词中台"全面升级为"创作全链路平台"：
- 不再只输出 Prompt，而是直接交付可使用的音乐作品
- 不再只做中间件，而是覆盖创作→生成→管理→发布的完整链路
- 双模式架构：ToCreator（创作者模式）+ ToDevelop（开发者模式）

### 核心价值

**ToCreator — 降低门槛，激发创作**
- 🎯 自然语言创作：像聊天一样描述想法，Agent 自动完成音乐创作
- 🎧 即时试听反馈：生成即播放，多版本对比选择
- 🚀 一键发布：直连 Suno/Udio/网易云/YouTube 等平台
- 🔌 开箱即用：预置插件、模板、风格预设，无需配置

**ToDevelop — 深度控制，专业增强**
- 🧩 工作流编排：可视化节点编辑器，自定义创作流水线
- 📝 Skill 开发：简易脚本语言，定义 Agent 行为逻辑
- 🎵 智能分析：导入音频，AI 自动分析并生成优化方案
- 🔧 参数级调优：精细控制每一个生成参数

### 交付物形态

| 形态 | 说明 | 适用场景 |
|------|------|----------|
| 音频文件 | MP3/WAV/FLAC 直接下载 | 最终交付 |
| 发布链接 | 一键推送到各音乐平台 | 分享传播 |
| 工程文件 | MIDI、分轨 Stems、DAW 工程 | 二次创作 |
| Prompt + 链路 | 可编辑的 Prompt + 参数 + 工作流 | 迭代优化 |
| 交互式作品 | 可调参数的音乐片段 | 探索体验 |
| 智能体配置 | Agent / Skill / MCP 包 | 复用分享 |

### 双模式架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ColorMax 双模式                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐ │
│  │      🤖 ToCreator 模式        │  │      🔧 ToDevelop 模式        │ │
│  │                              │  │                              │ │
│  │  面向：普通创作者、音乐爱好者   │  │  面向：开发者、Prompt 工程师   │ │
│  │                              │  │  音乐人、AI 研究者            │ │
│  │  界面：Agent 对话 + 结果面板   │  │  界面：工作流画布 + 代码编辑   │ │
│  │                              │  │                              │ │
│  │  核心交互：                   │  │  核心交互：                   │ │
│  │  "我想创作一首..."            │  │  拖拽节点、编写 Skill、        │ │
│  │  ↓                           │  │  导入音频分析、参数调优        │ │
│  │  Agent 自动拆解 → 生成        │  │                              │ │
│  │  ↓                           │  │                              │ │
│  │  试听 → 选择 → 发布           │  │                              │ │
│  │                              │  │                              │ │
│  │  插件市场：浏览安装（需登录）   │  │  MCP 管理：自定义服务接入      │ │
│  │  本地创作：无需登录，完整可用   │  │  Skill 开发：自定义 Agent 行为 │ │
│  └──────────────────────────────┘  └──────────────────────────────┘ │
│                              │                                      │
│  ┌───────────────────────────┴──────────────────────────────────┐   │
│  │                   共享基础设施层（Shared）                      │   │
│  │  · 插件系统  · 多模态输入  · AI Agent 引擎  · 生成引擎         │   │
│  │  · 模板系统  · 版本管理    · 跨模态融合    · 分析引擎         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 产品分层

| 层级 | 占比 | 说明 |
|------|------|------|
| 创作体验 | 40% | Agent 对话、多版本试听、一键发布 |
| 多模态 + AI | 30% | 插件系统、AI Agent、工作流引擎 |
| 平台化 | 20% | 插件市场、模板社区、云端同步（可选） |
| 开发者工具 | 10% | 工作流编排、Skill 开发、MCP 管理 |

### 产品边界

**做**：
- ✅ AI 音乐创作的全链路覆盖（输入→创作→生成→管理→发布）
- ✅ 双模式切换（Creator / Developer）
- ✅ 纯本地 + 可选云端同步（不强制账号）
- ✅ 多平台直连生成（Suno/Udio/本地合成）
- ✅ 插件市场浏览（登录后）
- ✅ 开源插件生态

**不做**：
- ❌ 平台托管（音乐文件存储在用户本地或用户自己的云）
- ❌ 强制账号体系（核心功能完全可用，云端功能可选登录）
- ❌ 内容审核（本地数据，用户自负）
- ❌ 音乐版权交易（不是平台，是工具）

---

## 技术栈

| 类别 | 选择 | 版本约束 | 说明 |
|------|------|---------|------|
| 框架 | Nuxt 4 | ^4.x | 全栈框架，SSR/SSG 支持 |
| 语言 | TypeScript 严格模式 | ^5.7.0 | 类型安全 |
| UI 库 | Element Plus | ^2.9.0 | 组件丰富 |
| CSS | UnoCSS | ^66.x | 原子化 CSS |
| 状态管理 | Pinia 3 | ^3.0 | 按领域拆分 Store |
| 后端 | Nuxt Server Routes (Nitro) | 随 Nuxt | API 代理、任务队列 |
| 桌面端 | Electron | ^30.x | 打包桌面应用 |
| 移动端 | Capacitor | ^6.x | 打包移动端应用 |
| 运行时校验 | Zod | ^3.x | Schema 校验 |
| 本地存储 | IndexedDB (idb) | ^8.x | 项目数据、历史记录 |
| 音频处理 | Web Audio API + ffmpeg.wasm | - | 音频分析、转码 |
| 工作流引擎 | @vue-flow/core | ^1.x | 可视化节点编排 |
| 代码编辑 | Monaco Editor | - | Skill 脚本编辑 |

---

## 编码规范

### 组件规范
- 使用 Vue 3 Composition API + `<script setup lang="ts">`
- 组件文件命名：PascalCase（如 `AgentChatPanel.vue`）
- 组件目录按功能分组：
  - `creator/` — ToCreator 模式组件
  - `developer/` — ToDevelop 模式组件
  - `shared/` — 共享组件（多模态输入、播放器、版本对比）
  - `editor/` — 编辑器组件（Prompt 编辑、Skill 编辑）
  - `workflow/` — 工作流组件（节点、连线、画布）
  - `input/` — 多模态输入组件
  - `output/` — 输出通道组件（试听、下载、发布）
  - `explore/` — 风格探索组件

### 组合式函数规范
- 文件命名：use 前缀（如 `useAgent.ts`、`useWorkflow.ts`）
- 统一放在 `app/composables/` 目录
- 按模式分组：
  - `useCreator/` — 创作者模式相关
  - `useDeveloper/` — 开发者模式相关
  - `useShared/` — 共享功能

### Store 规范
- 按领域拆分 store：
  - `agent.ts` — AI Agent 状态
  - `creator.ts` — 创作者模式状态
  - `developer.ts` — 开发者模式状态
  - `workspace.ts` — 工作区/项目管理
  - `plugin.ts` — 插件系统
  - `workflow.ts` — 工作流
  - `explore.ts` — 风格探索
- State 必须有 TypeScript 类型
- Actions 负责业务逻辑，Getters 负责派生计算

### 类型规范
- 公共类型放 `app/types/`
- 按领域拆分文件：
  - `agent.ts` — Agent 相关类型
  - `plugin.ts` — 插件系统
  - `workflow.ts` — 工作流
  - `ai.ts` — AI 服务
  - `share.ts` — 分享系统
  - `explore.ts` — 风格探索
  - `creator.ts` — 创作者模式
  - `developer.ts` — 开发者模式
- 禁止使用 `any`，必须明确类型

### API 规范
- RESTful 风格
- Server Routes 统一放 `server/api/`
- 请求体用 Zod Schema 校验
- 统一错误响应格式：`{ statusCode, message, details? }`
- 文件命名：`{domain}/{action}.{method}.ts`

### 样式规范
- 全局 CSS 变量定义在 `app/assets/styles/main.css`
- 组件样式使用 `<style scoped>`
- UnoCSS 工具类优先，复杂样式用 scoped CSS
- 支持深色/浅色模式切换

---

## 项目结构

```
ColorMax-SunoLike/
├── app/                                 # Nuxt 应用
│   ├── app.vue                          # 根组件（模式切换入口）
│   ├── pages/                           # 页面路由
│   │   ├── index.vue                    # 首页（模式选择/工作台）
│   │   ├── creator/                     # ToCreator 模式页面
│   │   │   ├── index.vue                # 创作者工作台
│   │   │   ├── chat.vue                 # Agent 对话页
│   │   │   ├── history.vue              # 创作历史
│   │   │   └── results.vue              # 结果管理（试听/下载/发布）
│   │   ├── developer/                   # ToDevelop 模式页面
│   │   │   ├── index.vue                # 开发者工作台
│   │   │   ├── workflow.vue             # 工作流编排
│   │   │   ├── skill.vue                # Skill 编辑器
│   │   │   └── mcp.vue                  # MCP 管理
│   │   ├── workspace/[id].vue           # 单个工作区
│   │   ├── explore.vue                  # 风格探索
│   │   ├── plugins.vue                  # 插件管理
│   │   └── share/import.vue             # 导入分享
│   ├── components/                      # 组件（按功能分组）
│   │   ├── creator/                     # ToCreator 组件
│   │   │   ├── AgentChatPanel.vue       # Agent 对话面板
│   │   │   ├── AgentMessage.vue         # 消息气泡
│   │   │   ├── ResultPlayer.vue         # 结果播放器
│   │   │   ├── ResultCompare.vue        # 版本对比
│   │   │   ├── PublishButton.vue        # 一键发布
│   │   │   └── QuickInputBar.vue        # 快捷输入栏
│   │   ├── developer/                   # ToDevelop 组件
│   │   │   ├── WorkflowCanvas.vue       # 工作流画布
│   │   │   ├── WorkflowNode.vue         # 工作流节点
│   │   │   ├── SkillEditor.vue          # Skill 代码编辑器
│   │   │   ├── McpConfigPanel.vue       # MCP 配置面板
│   │   │   └── AudioAnalyzer.vue        # 音频分析面板
│   │   ├── shared/                      # 共享组件
│   │   │   ├── ModeSwitcher.vue         # 模式切换器
│   │   │   ├── MultimodalInput.vue      # 多模态输入面板
│   │   │   ├── AudioWaveform.vue        # 音频波形显示
│   │   │   ├── VersionTimeline.vue      # 版本时间线
│   │   │   ├── PluginCard.vue           # 插件卡片
│   │   │   └── TemplateSelector.vue     # 模板选择器
│   │   ├── editor/                      # 编辑器组件
│   │   │   ├── PromptBlockEditor.vue    # Prompt 块编辑器
│   │   │   ├── VariableInput.vue        # 变量输入
│   │   │   └── OutputFormatter.vue      # 输出格式化
│   │   ├── workflow/                    # 工作流组件
│   │   │   ├── NodePalette.vue          # 节点面板
│   │   │   ├── ConnectionLine.vue       # 连接线
│   │   │   └── PropertyPanel.vue        # 属性面板
│   │   ├── input/                       # 多模态输入组件
│   │   │   ├── AudioRecorder.vue        # 录音输入
│   │   │   ├── AudioUploader.vue        # 音频上传
│   │   │   ├── ImageUploader.vue        # 图片上传
│   │   │   └── TextInput.vue            # 文本输入
│   │   ├── output/                      # 输出通道组件
│   │   │   ├── AudioPlayer.vue          # 音频播放器
│   │   │   ├── DownloadButton.vue       # 下载按钮
│   │   │   ├── PublishModal.vue         # 发布弹窗
│   │   │   └── ExportOptions.vue        # 导出选项
│   │   ├── explore/                     # 风格探索组件
│   │   └── share/                       # 导入导出组件
│   ├── composables/                     # 组合式函数
│   │   ├── useCreator/                  # 创作者模式
│   │   │   ├── useAgent.ts              # AI Agent 交互
│   │   │   ├── useChat.ts               # 聊天会话
│   │   │   ├── useGeneration.ts         # 生成管理
│   │   │   └── usePublish.ts            # 发布管理
│   │   ├── useDeveloper/                # 开发者模式
│   │   │   ├── useWorkflow.ts           # 工作流编排
│   │   │   ├── useSkill.ts              # Skill 开发
│   │   │   ├── useMcp.ts                # MCP 管理
│   │   │   └── useAudioAnalysis.ts      # 音频分析
│   │   ├── useShared/                   # 共享功能
│   │   │   ├── usePlugin.ts             # 插件系统
│   │   │   ├── useMultimodalInput.ts    # 多模态输入
│   │   │   ├── useAiService.ts          # AI 服务
│   │   │   ├── useHistory.ts            # 历史管理
│   │   │   ├── useIndexedDB.ts          # 本地存储
│   │   │   ├── useAudioProcessor.ts     # 音频处理
│   │   │   └── useShare.ts              # 分享导入
│   ├── stores/                          # Pinia Store
│   │   ├── agent.ts                     # AI Agent 状态
│   │   ├── creator.ts                   # 创作者模式
│   │   ├── developer.ts                 # 开发者模式
│   │   ├── workspace.ts                 # 工作区
│   │   ├── plugin.ts                    # 插件系统
│   │   ├── workflow.ts                  # 工作流
│   │   └── explore.ts                   # 风格探索
│   ├── types/                           # TypeScript 类型
│   │   ├── index.ts                     # 公共导出
│   │   ├── agent.ts                     # Agent 相关
│   │   ├── creator.ts                   # 创作者模式
│   │   ├── developer.ts                 # 开发者模式
│   │   ├── plugin.ts                    # 插件系统
│   │   ├── workflow.ts                  # 工作流
│   │   ├── ai.ts                        # AI 服务
│   │   ├── share.ts                     # 分享系统
│   │   └── explore.ts                   # 风格探索
│   ├── plugins/                         # 内置插件实现
│   │   ├── audio-hum/index.ts           # 哼唱解析
│   │   ├── image-style/index.ts         # 图像风格分析
│   │   ├── text-refine/index.ts         # 文本优化
│   │   └── audio-analyze/index.ts       # 音频分析（新）
│   └── assets/styles/main.css           # 全局样式
├── desktop/                             # Electron 桌面端
│   ├── main.ts                          # 主进程入口
│   ├── preload.ts                       # 预加载脚本
│   └── electron-builder.json            # 打包配置
├── mobile/                              # Capacitor 移动端
│   └── capacitor.config.ts              # 配置
├── server/                              # Nuxt Server
│   ├── api/                             # API 路由
│   │   ├── ai/
│   │   │   ├── chat.post.ts             # Agent 对话
│   │   │   ├── optimize.post.ts         # Prompt 优化
│   │   │   └── analyze.post.ts          # 音频/内容分析
│   │   ├── generate/
│   │   │   ├── suno.post.ts             # Suno 生成代理
│   │   │   ├── udio.post.ts             # Udio 生成代理
│   │   │   └── status/[jobId].get.ts    # 生成状态查询
│   │   ├── plugins/
│   │   │   ├── parse-audio.post.ts      # 音频解析
│   │   │   └── parse-image.post.ts      # 图片解析
│   │   ├── workflow/
│   │   │   └── execute.post.ts          # 工作流执行
│   │   └── share/
│   │       └── validate.post.ts         # 导入文件校验
│   └── utils/
│       ├── ai-client.ts                 # AI API 客户端
│       ├── plugin-runner.ts             # 插件运行时
│       ├── suno-client.ts               # Suno API 代理
│       ├── udio-client.ts               # Udio API 代理
│       └── task-queue.ts                # 任务队列
├── public/
├── nuxt.config.ts
├── package.json
├── tsconfig.json
├── turbo.json
└── AGENTS.md                            # 本文件
```

---

## 核心类型定义

### AI Agent 系统

```typescript
interface AgentSession {
  id: string
  mode: 'creator' | 'developer'
  messages: AgentMessage[]
  context: AgentContext
  createdAt: string
  updatedAt: string
}

interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  type: 'text' | 'audio' | 'image' | 'action'
  actions?: AgentAction[]
  metadata?: Record<string, unknown>
  createdAt: string
}

interface AgentAction {
  id: string
  type: 'generate' | 'play' | 'publish' | 'edit' | 'export'
  label: string
  payload: Record<string, unknown>
  status: 'pending' | 'completed' | 'failed'
}

interface AgentContext {
  intent?: string
  extractedParams?: Record<string, unknown>
  currentProject?: string
  history?: AgentMessage[]
}
```

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
  outputType: 'prompt-fragment' | 'variable-suggestion' | 'audio-analysis'
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
  analysis?: AudioAnalysis
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

### 音频分析

```typescript
interface AudioAnalysis {
  bpm: number
  key: string
  genre: string[]
  mood: string[]
  instrumentation: string[]
  energy: number
  spectralFeatures: SpectralFeatures
  segments: AudioSegment[]
}

interface SpectralFeatures {
  centroid: number
  rolloff: number
  flux: number
  zeroCrossingRate: number
}

interface AudioSegment {
  start: number
  end: number
  label: string
  confidence: number
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
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface WorkflowNode {
  id: string
  type: 'input' | 'process' | 'ai' | 'output' | 'condition'
  label: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  inputs: NodePort[]
  outputs: NodePort[]
}

interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourcePort: string
  targetPort: string
}

interface NodePort {
  id: string
  label: string
  type: 'string' | 'number' | 'audio' | 'image' | 'boolean'
}
```

### 生成服务

```typescript
interface GenerateRequest {
  prompt: string
  platform: 'suno' | 'udio' | 'local'
  platformConfig: Record<string, unknown>
  options?: {
    versions?: number
    style?: string
    instrumental?: boolean
    lyrics?: string
  }
}

interface GenerateResponse {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  results?: GenerationResult[]
  progress?: number
  error?: string
}

interface GenerationResult {
  id: string
  audioUrl?: string
  videoUrl?: string
  lyric?: string
  title?: string
  metadata?: Record<string, unknown>
}

interface PublishRequest {
  resultId: string
  platforms: ('suno' | 'udio' | 'netease' | 'youtube' | 'spotify')[]
  metadata?: {
    title?: string
    description?: string
    tags?: string[]
  }
}
```

### 分享系统

```typescript
interface SharePackage {
  version: string
  exportedAt: string
  mode: 'creator' | 'developer'
  templates?: PromptTemplate[]
  workflows?: Workflow[]
  skills?: SkillDefinition[]
  plugins?: PluginShareInfo[]
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

interface SkillDefinition {
  id: string
  name: string
  description: string
  code: string
  version: string
  author?: string
}
```

---

## Zod Schema 约束

```typescript
import { z } from 'zod'

const AgentMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  type: z.enum(['text', 'audio', 'image', 'action']).default('text'),
  actions: z.array(z.object({
    id: z.string(),
    type: z.enum(['generate', 'play', 'publish', 'edit', 'export']),
    label: z.string(),
    payload: z.record(z.unknown()),
    status: z.enum(['pending', 'completed', 'failed']).default('pending'),
  })).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
})

const GenerateRequestSchema = z.object({
  prompt: z.string().min(1),
  platform: z.enum(['suno', 'udio', 'local']),
  platformConfig: z.record(z.unknown()),
  options: z.object({
    versions: z.number().min(1).max(10).optional(),
    style: z.string().optional(),
    instrumental: z.boolean().optional(),
    lyrics: z.string().optional(),
  }).optional(),
})

const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['input', 'process', 'ai', 'output', 'condition']),
  label: z.string().min(1),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  config: z.record(z.unknown()),
  inputs: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['string', 'number', 'audio', 'image', 'boolean']),
  })),
  outputs: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['string', 'number', 'audio', 'image', 'boolean']),
  })),
})

const SharePackageSchema = z.object({
  version: z.string(),
  exportedAt: z.string(),
  mode: z.enum(['creator', 'developer']),
  templates: z.array(z.any()).optional(),
  workflows: z.array(z.any()).optional(),
  skills: z.array(z.any()).optional(),
  plugins: z.array(z.object({
    id: z.string(),
    name: z.string(),
    config: z.record(z.unknown()),
  })).optional(),
  metadata: z.object({
    source: z.literal('colormax'),
    version: z.string(),
  }),
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
| POST | `/api/ai/chat` | Agent 对话（流式响应） |
| POST | `/api/ai/optimize` | Prompt 智能优化 |
| POST | `/api/ai/analyze` | 音频/内容分析 |
| POST | `/api/generate/suno` | Suno 代理生成 |
| POST | `/api/generate/udio` | Udio 代理生成 |
| GET | `/api/generate/status/:jobId` | 查询生成状态 |
| POST | `/api/plugins/parse-audio` | 音频解析 |
| POST | `/api/plugins/parse-image` | 图片解析 |
| POST | `/api/workflow/execute` | 执行工作流 |
| POST | `/api/share/validate` | 导入文件校验 |
| POST | `/api/publish` | 发布到第三方平台 |

---

## 环境变量

```bash
# .env（不入库）
NUXT_AI_API_KEY=           # OpenAI/Claude API Key
NUXT_AI_BASE_URL=          # AI API 代理地址（可选）

# Suno 代理配置
NUXT_SUNO_COOKIE=          # Suno 官网 Cookie
NUXT_TWOCAPTCHA_KEY=       # 2Captcha API Key（验证码破解）

# Udio 代理配置
NUXT_UDIO_COOKIE=          # Udio 官网 Cookie

# 可选云端服务（非核心功能）
NUXT_CLOUD_API_URL=        # 云端服务地址（插件市场、模板社区）
NUXT_CLOUD_API_KEY=        # 云端服务 API Key
```

在 `nuxt.config.ts` 中通过 `runtimeConfig` 暴露：

```typescript
runtimeConfig: {
  aiApiKey: process.env.NUXT_AI_API_KEY,
  aiBaseUrl: process.env.NUXT_AI_BASE_URL,
  sunoCookie: process.env.NUXT_SUNO_COOKIE,
  twoCaptchaKey: process.env.NUXT_TWOCAPTCHA_KEY,
  udioCookie: process.env.NUXT_UDIO_COOKIE,
  cloudApiUrl: process.env.NUXT_CLOUD_API_URL,
  cloudApiKey: process.env.NUXT_CLOUD_API_KEY,
}
```

---

## 分期路线图

### Phase 1 — 创作者模式 MVP（当前阶段）
- [ ] 1.1 Agent 对话界面（类 Codex 风格）
- [ ] 1.2 自然语言音乐创作（输入→生成→试听）
- [ ] 1.3 多版本生成与对比试听
- [ ] 1.4 基础多模态输入（文本 + 音频哼唱）
- [ ] 1.5 一键发布到 Suno/Udio
- [ ] 1.6 本地项目管理与历史记录
- [ ] 1.7 桌面端 Electron 打包

### Phase 2 — 多模态增强 + 开发者模式
- [ ] 2.1 图像风格输入（图片 → 音乐风格）
- [ ] 2.2 音频分析引擎（导入 → 分析 → 优化建议）
- [ ] 2.3 开发者模式切换与工作流画布
- [ ] 2.4 基础节点类型（输入/处理/AI/输出）
- [ ] 2.5 Skill 脚本编辑器（Monaco + 简化语法）
- [ ] 2.6 MCP 服务接入与管理

### Phase 3 — 平台化 + 生态
- [ ] 3.1 插件市场（浏览/安装/更新）
- [ ] 3.2 模板社区（分享/下载/评分）
- [ ] 3.3 可选云端同步（项目/配置/历史）
- [ ] 3.4 工程文件导出（MIDI/Stems/DAW）
- [ ] 3.5 移动端 Capacitor 打包
- [ ] 3.6 社区文档与教程

---

## 约束检查清单

每次提交代码前自查：

- [ ] 组件命名符合 PascalCase 规范
- [ ] 组合式函数使用 use 前缀
- [ ] API 调用通过 composables 或 server routes
- [ ] TypeScript 类型定义完整，无 `any`
- [ ] Server Route 请求体有 Zod Schema 校验
- [ ] 分包结构清晰（按功能分组 + 按模式分组）
- [ ] 不提交 API Key、Cookie 等敏感信息
- [ ] scoped 样式不泄漏
- [ ] 桌面端/移动端代码条件编译正确

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
| 2026-04-21 | **产品定位重大升级**：从"提示词中台"到"创作全链路平台" | 用户需求深化 |
| 2026-04-21 | **双模式架构**：ToCreator + ToDevelop | 覆盖两类核心用户 |
| 2026-04-21 | **交付物扩展**：音频/发布/工程/Prompt/交互/配置 | 完整创作链路 |
| 2026-04-21 | **多终端支持**：Web + Desktop(Electron) + Mobile(Capacitor) | 全场景覆盖 |
| 2026-04-21 | **可选云端同步**：核心功能本地，扩展功能可选登录 | 平衡隐私与便利 |
