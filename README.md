# ColorMax

> AI 提示词中台 — 将创意转化为大模型能理解的上下文

## 产品定位

ColorMax 是一个**模板驱动的 AI 提示词生成平台**，帮助用户通过可视化编辑和多格式输出，快速生成面向各类 AI 平台（Suno、Udio、Claude 等）的结构化提示词。

核心能力：

- **模板管理** — 预设 + 自定义提示词模板，支持变量填充
- **多格式输出** — 一键生成原生 Prompt、MCP Server 配置、Claude Skill 三种格式
- **即用即复制** — 生成结果一键复制，零门槛对接下游平台

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Nuxt 3 (Vue 3) |
| 状态管理 | Pinia |
| UI 方案 | 原生 CSS 变量 + Element Plus（按需） |
| 构建工具 | Vite |
| 语言 | TypeScript |
| 图标/样式 | UnoCSS |

---

## 项目结构

```
ColorMax-SunoLike/
├── app/
│   ├── app.vue                 # 根组件（应用入口）
│   ├── pages/
│   │   └── index.vue           # 首页（模板选择 → 编辑 → 输出）
│   ├── components/
│   │   ├── TemplateSelector.vue # 左侧：模板选择卡片
│   │   ├── TemplateEditor.vue   # 左侧：模板变量编辑
│   │   ├── VariableInput.vue    # 变量输入组件
│   │   └── OutputFormatter.vue  # 右侧：格式切换 + 生成输出
│   ├── stores/
│   │   └── template.ts          # Pinia store：模板状态、生成逻辑
│   ├── types/
│   │   └── index.ts             # TypeScript 类型定义
│   └── assets/
│       └── styles/
│           └── main.css         # 全局 CSS 变量和基础样式
├── public/                       # 静态资源
├── nuxt.config.ts               # Nuxt 配置
├── package.json
└── tsconfig.json
```

---

## 目录约定（Nuxt 3 惯例）

| 目录 | 作用 | 备注 |
|------|------|------|
| `app/pages/` | 路由自动生成 | 本项目仅首页 `/` |
| `app/components/` | 组件自动导入 | 无需手动 import |
| `app/stores/` | Pinia store | 通过 `useXxxStore()` 使用 |
| `app/types/` | 类型定义 | 自动全局可用 |
| `app/assets/` | 静态资源 | 由 Vite 处理 |
| `public/` | 原样复制资源 | 直接映射到 `/` 路径 |

> **注意**：`plugins/` 目录为可选目录，仅在需要注册全局 Vue 插件时才需要。本项目无额外插件需求。

---

## 核心数据流

```
用户选择模板 (TemplateSelector)
    ↓
填写变量 (TemplateEditor / VariableInput)
    ↓
选择输出格式：Prompt | MCP | Skill (OutputFormatter)
    ↓
点击生成 → store.generate() (template.ts)
    ↓
填充模板 + 格式化输出 → 展示结果
```

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 类型检查
npm run typecheck

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

---

## 输出格式说明

| 格式 | 说明 | 典型用途 |
|------|------|----------|
| `Prompt` | 填充后的原始提示词文本 | 直接粘贴到 AI 平台 |
| `MCP Server` | JSON 格式的 MCP Server 配置 | 接入支持 MCP 协议的应用 |
| `Claude Skill` | Markdown 格式的 Claude Skill 定义 | Claude AI 的 Custom Instructions |

---

## 更新日志

> 由 `git commit` 自动维护，详见 `git log`

