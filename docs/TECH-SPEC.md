# ColorMax MVP Tech Spec

> 基于 [PRD v2](PRD-mvp-demo.md) 的技术规格。目标：一条完整出歌主流程（M1–M3）。

## 1. 系统架构

```
┌────────────────────────── apps/web (Next.js 15 App Router, TS) ─────────────────────────┐
│ 创作室里（chat UI, Vercel AI SDK 集成）│ 设置面板（LLM 配置）│ 交付页（音频+记录+评判报告）│
└──────────────┬──────────────────────────────────────────────────────────────┬───────────┘
               │ Server Actions / API Routes (BFF)                              │
┌──────────────▼──────────────────────────────────────────────┐   ┌───────────▼───────────┐
│ packages/agents：Orchestrator（LangGraph 图）               │   │ packages/engine       │
│  intent → plan → leader-dispatch → subagent(suno) → align   │   │ EngineAdapter         │
│  → judge →（条件边：pass→deliver / fail→retry≤3）            │   │  ├ SunoAdapter(gcui)  │
│ packages/schema：Intent/Plan/SongResult/AlignmentReport      │   │  └ MockAdapter(开发)  │
└──────────────┬──────────────────────────────────────────────┘   └───────────┬───────────┘
               │ drizzle (SQLite: sessions/messages/jobs/songs)                │ HTTP(REST)
               └───────────────────────────────────────────────────────────────┘
                                  suno-api 服务（自托管 Next.js, SUNO_COOKIE env）
                                  POST /api/custom_generate · GET /api/get?ids · /api/get_limit
```

## 2. LangGraph 编排（packages/agents）

**图结构**（StateGraph，状态= `AgentState`）：

```
[intent] → [plan] → [leader#dispatch] → [subagent#suno] → [align#建模] → [judge#评分]
                                                        ↑ fail & retry<3 │ pass
                                                        └──── retry ─────┘ [deliver]
```

- `AgentState`：`{ intent, plan, songResult?, alignment?, judgeScore?, retries, originPrompt }`
- **align（统一建模对齐）**：以 `CreationPlan` 为基准 schema，把 Subagent 交付（Suno 歌曲：style/lyrics/duration/audio url/cover url/歌名）映射进统一模型 `AlignedSong`，逐维度对齐：主题/情绪/风格/时长/结构（利用 Subagent 交付的元数据抽取）。
- **judge（效果评判）**：LLM 评分（多维 rubric：主题契合/情绪传达/风格一致/歌词结构/时长合规，0-5 分加权）+ 规则检测（音频文件完整、时长在约束 ±15% 内、非空歌词）→ `score`；`score ≥ PASS_THRESHOLD(3.5)` 且规则通过 → pass；否则 retry（规划种子更新，上限 3 次）。
- `retry` 边：subagent 再次调 Suno（新 seed/tag 变体），judge 记录重派日志。
- 每个节点产出落 `jobs` 记录（阶段状态），供前端轮询展示。

## 3. Schema 定义（packages/schema，zod 单一事实源）

```ts
Intent   { theme; mood; style; durationSec; extra?: string[]; originPrompt }
CreationPlan { intent; structure: SongSection[]; lyrics: string (按段);
               arrangement: { key; bpm; chordProgression: string[]; groove } }
SongResult   { sunoId; title; lyrics; style; tags; audioUrl; coverUrl; durationSec;
               sourceFormat: 'mp3' | 'wav' }        // 源格式，不转码
AlignedSong  { plan: CreationPlan; song: SongResult;
               alignment: { theme: number; mood: number; style: number; duration: number; structure: number } }
JudgeReport  { score; perDimension: Record<string, number>; rules: {passed; notes};
               retried: number; verdict: 'pass' | 'retry' | 'give-up' }
Job          { id; sessionId; phase: 'intent'|'plan'|'dispatch'|'suno'|'align'|'judge'|'deliver'|'failed';
               status: 'queued'|'running'|'done'|'failed'; payload: JSON; createdAt; updatedAt }
```

## 4. 接口草案（apps/web API Routes）

| 端点 | 说明 |
|---|---|
| `POST /api/chat` | 消息 + 意图/规划（流式）——AI SDK useChat 路由 |
| `POST /api/settings` | LLM 配置（Base URL/Key/Model/温度×角色）→ .env.local 写入（不入库/不进 git；写入后热生效） |
| `POST /api/jobs` | 发起创作任务（LangGraph 执行；返回 jobId，异步流式阶段事件） |
| `GET /api/jobs/:id/events` | SSE/轮询：阶段进度 + 每步 JSON |
| `GET /api/jobs/:id/result` | 交付：AlignedSong + JudgeReport |
| `GET /api/songs/:jobId/download` | 下载 Suno 源格式音频（透传，不转码） |

内部 `packages/engine` 对 suno-api 的调用映射（SunoAdapter）：
`quota: GET /api/get_limit` → `generate: POST /api/custom_generate {prompt, title, tags, lyrics}` → `poll: GET /api/get?ids=...`（间隔 5s，超时 5min）→ `download: audioUrl`（直链保存，源格式）。

## 5. LLM 设置面板（无 mock 契约）

- 设置页字段：Base URL（默认 `http://localhost:11434/v1`）、API Key（可空——本地端点）、Model、温度（意图/规划/评判三角色可各配置或共用一套）。
- 后端封装 `packages/llm`：OpenAI 兼容 client（`baseURL`/`apiKey`/`model` 自配置面板注入请求头）；**所有阶段调用真实 LLM，无 mock JSON 分支**；配置缺失时前端引导去设置页。

## 6. 前端集成（chat UI）

- 采用 **Vercel AI SDK（ai-chatbot 模板/shadcn 基座）**：`git clone` 官方模板 → 迁入 `apps/web` 的创作室（`useChat` 流式 + 消息持久化），扩展组件：创作计划卡片、Agent 阶段进度条、评判报告卡（维度得分+意见）、音频播放器 + 下载按钮。
- 设计原则：先找现成组件（开源 chat UI/shadcn 组件），按项目支持方式（pnpm + 模板/组件库）拉到本地开发，不手搓聊天基础设施。

## 7. 数据模型（drizzle + SQLite 起步）

`sessions(id, title, createdAt)`；`messages(id, sessionId, role, content, createdAt)`；`jobs(id, sessionId, phase, status, payload, report, createdAt, updatedAt)`；`songs(jobId, sunoId, title, audioPath, sourceFormat, createdAt)`。

## 8. 错误与恢复

- **Suno cookie 失效/风控**：quota 预检失败 → job 状态 `failed(reason: quota/captcha)` → 前端提示续 cookie/检查 suno-api 日志（风控处理为 suno-api 职责）。
- **judge 不达标**：重派 ≤3；超限 → `give-up`，交付当前最优 + 报告注明。
- **LLM 调用失败**：单阶段重试 2 次（退避）；连续失败 → job failed，阶段上下文保留可重跑。

## 9. 环境变量（.env.local，gitignore）

```
LLM_BASE_URL / LLM_API_KEY / LLM_MODEL（默认 openai 兼容本地）
SUNO_API_BASE=https://localhost:3001   # suno-api 服务
SUNO_API_COOKIE=…                       #（或由 suno-api 服务自身 .env 管理，本仓不存）
```

## 10. 里程碑任务拆分

- **M1**：`create-next-app` + pnpm 结构（apps/web，packages/{agents,engine,schema,llm}）→ 设置面板 + LLM client → intent/plan 两阶段（真实 LLM）→ ①验收：输入→规划 JSON。
- **M2**：LangGraph 图（intent→plan→dispatch→subagent(mock/mock engine)→align→judge→retry 边）→ 阶段事件 API + 前端进度 → ②验收：图跑通（重派回环可演示）。
- **M3**：SunoAdapter 对接 suno-api（自托管 + cookie 配置 + 配额预检 + 轮询 + 下载）→ 交付页（音频下载+报告）→ ③验收：完整链路 + 源格式音频下载。
- 测试：packages/schema 单测（zod 校验）；align/judge 单测（固定 LLM 响应的 rubric 边界）；engine adapter 契约测试（suno-api 单测 mock HTTP）。

## 11. 风险

- suno 反爬/风控（hCaptcha）：依赖 suno-api 的 2Captcha/Playwright 方案，演示环境预配 cookie；接口变动时 adapter 隔离修复。
- LGPL-3.0：suno-api 为独立服务进程（HTTP 集成），不静态链接，MIT 仓库边界清晰。
- LLM 依赖：演示需可用 OpenAI 兼容端点（本地 Ollama 或云端 key）。
