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
                                  packages/suno-gateway（vendor 源码二次开发, 本地库调用）
                                  配额预检→custom_generate→feed 轮询→源格式下载（cookie 会话池）
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

内部 Suno 接入（2026-08-30 用户拍板：**vendor gcui-art/suno-api 源码本地二次开发**，非远程 HTTP 调独立服务）：
`packages/suno-gateway`：vendor `SunoApi.ts`/`utils.ts`（LGPL-3.0 保留许可+修改声明），二次开发点 = ①移除浏览器/CAPTCHA 重依赖（rebrowser/2captcha/ghost-cursor）→ fail-fast `CaptchaRequiredError`（CookiePool 轮换/人工）②HTTP transport 可注入（测试/代理）③常量 UA ④logger 控制台化 ⑤wait_audio 轮询上限可配（默认 5min）⑥cookie 会话池（轮换+失效剔除，≥2 次失败剔出）。
`SunoGatewayAdapter.render` = 配额预检（`/api/billing/info/` get_credits）→ `custom_generate`（lyrics+创作约束 prompt，tags=风格/调性/节奏型+和弦走向，**strict-complete** 轮询——原版把 streaming 当完成是缺陷）→ feed 对齐 `complete` → **`/api/clip/{id}` 详情取 media_urls 真实源链（feed 的 audio_url=api/forbidden 旧占位）** → **AudioDelivery=server-decrypt-transcode**（2026-08-30 逆向后定版）：下载密文（`media_urls` 直链，feed 的 audio_url=api/forbidden 是旧占位）→ **DRM 解密（逆向自 suno.com bundle：`userKey=SHA-256(JWT)` AES-GCM → `POST /api/mango/rights`(Bearer JWT) → key/iv 以 contentId 为 additionalData GCM unwrap → AES-CTR 单次整批解密）** → **初次 mp4 明文直出（不劣化）+ 后台 ffmpeg 转 MP3 缓存**（`/api/songs/:id/audio`：audio/mpeg + Range/Content-Length + 磁盘缓存 + 预热）——全浏览器兼容。

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
SUNO_COOKIES=…                          # cookie 会话池（分号分隔多 cookie；本地 vendor 二次开发，无独立服务）
```

## 10. 实现层次（Stage 分层：按需求拆分的优先实现层次）

> 原则：每个 Stage 是一个**可独立演示的最小闭环**（上层验收驱动下层）；P0 = MVP 验收必需（按序推进），P1 = 产品壳（验收后按需插入），P2 = 后续路线（不在 MVP）。Stage 内 Step 为本层构建顺序。

### Stage 1 ｜ 输入与规划层（真实 LLM 链路） — P0

- **Step 1.1** 项目骨架：pnpm workspace（apps/web + packages/{schema,llm,engine,agents}）、Next.js 15（App Router）、drizzle+SQLite 初始化、CI-free 本地 dev 脚本
- **Step 1.2** LLM 设置面板 + `packages/llm` client（OpenAI 兼容：Base URL/Key/Model/温度×三角色；写入 `.env.local` 热生效；**全链路真实调用无 mock**；面板未配置时引导交互）
- **Step 1.3** 意图分析 + 创作规划（真实 LLM，zod 解析校验 `Intent`/`CreationPlan`，失败重试 2 次退避）
- **前端形态**：chat 入口（AI SDK 集成基础）+ 创作室规划卡片
- **验收**：输入一句话 → 意图/规划 JSON 可见（真实 LLM）；配置面板可切换端点
- 依赖：无（可并行起前端壳与 schema）

### Stage 2 ｜ Agent 编排层（LangGraph Leader 框架，引擎先 Mock 调试） — P0

- **Step 2.1** LangGraph 图：`intent → plan → leader#dispatch → subagent#suno → align#建模 → judge#评分` + 条件边（fail & retry<3 → 回环 / pass → deliver / 超限 → give-up）
- **Step 2.2** `align`（统一建模：Subagent 交付 → AlignedSong，逐维度对齐主题/情绪/风格/时长/结构）+ `judge`（LLM 多维 rubric 评分 + 规则检测：文件完整/时长 ±15%/歌词非空；PASS_THRESHOLD=3.5；重派记录）
- **Step 2.3** `MockEngineAdapter`（开发期调试链路）+ jobs 状态机（queued/running/各 phase/done/failed）+ `GET /api/jobs/:id/events` 阶段事件
- **Step 2.4** 前端：Agent 阶段进度条 + 评判报告卡（维度得分/意见/重派记录）
- **验收**：图完整跑通（含重派回环可演示）；评判报告可见；step 事件流正常
- 依赖：Stage 1（plan 真实）；S3 的前置引擎接口以本层定稿

### Stage 3 ｜ 出歌交付层（Suno 真实链路 + 源格式下载） — P0

- **Step 3.1** `packages/suno-gateway`：vendor gcui-art/suno-api 源码 + 二次开发（fail-fast CAPTCHA/transport 注入/cookie 会话池/轮询上限可配）✅；**3.1b DRM 解密链**（getJwt/fetchRights + decrypt.ts：rights unwrap + AES-CTR；D1/D2 自证）✅
- **Step 3.2** `SunoGatewayAdapter`：配额预检 → `custom_generate` → **strict-complete 轮询** → feed 对齐 → **`/api/clip/{id}` 详情取 media_urls** → 下载密文 → **解密** → 交付（媒体已被 DRM，非"直接下载保存"）✅
- **Step 3.3** 交付页/作品页：**同源播放端点** `/api/songs/:id/audio`（初次 mp4 直出 + 后台 ffmpeg MP3 缓存 + Range + 预热），播放+创作记录+评判报告 ✅；Studio 创作室交付卡 ⚠ 待接线（现为面板入口按钮）
- **Step 3.4** 验收脚本/检查单：**已达成** 生成✓/完成检测✓/评判✓/**解密播放✓（12/12 MP3 缓存）**；**待补** = ①创作室单次"输入→…→本页播放"终验（生成风控冷却后跑）②Playwright E2E 基建（@e2e-suno/@e2e-mock）③S3-T2/T3 用例与现状对齐
- **验收**：完整链路通过，交付可下载源格式音频（PRD 验收标准 4 条）
- 依赖：Stage 2（engine 接口/图）+ `SUNO_COOKIES` 会话（无独立服务进程）

### Stage 4 ｜ 产品壳与稳态（P1，验收后按需） — P1

- 创作记录列表页（历史歌曲/报告）、会话持久化完善、失败友好 UI（cookie 失效引导/LLM 未配置引导）、Mock 模式开关 UI（仅开发可见）、README 10 分钟启动说明、基础 e2e 测试

### Stage 5 ｜ M4+ 路线（P2，不实现） — P2

- Stem 分轨/MIDI 导出、Studio DAW 空间、批量流水线/工作流共享、插件化服务接入、Electron 桌面端、资产库完整版（详见 PRD「不做」节）

### Stage 依赖图

```
Stage 1 ──► Stage 2 ──► Stage 3 ──► Stage 4（P1）
              ▲ engine 接口定稿       └─► Stage 5（P2 路线）
              └── MockAdapter 仅 Stage2-3 开发调试；验收/演示必须 SunoAdapter
```

### 里程碑对应

| 里程碑 | 覆盖 Stage |
|---|---|
| M1 | Stage 1 |
| M2 | Stage 2 |
| M3 | Stage 3 + 验收 |
| M4+ | Stage 4-5 |

### 测试策略（按 Stage）

- Stage 1：schema zod 单测、llm client 契约测试（mock HTTP 端点）
- Stage 2：align/judge 单测（固定 LLM 响应 rubric 边界：3.5 阈值/重派上限）；图端到端（MockAdapter）
- Stage 3：SunoAdapter 契约测试（suno-api HTTP mock）；E2E 验收脚本
- Stage 4：前端组件测试 + 全链路 e2e（Playwright，真实 LLM + Mock 引擎回归）

## 11. 测试计划（Test Plan）

**分层**：单测（vitest）｜契约（msw/nock mock HTTP）｜组件（Testing Library）｜集成（图/API 全链，mock 外围）｜E2E（Playwright）｜冒烟（时间盒快速验证）。脚本统一入口：`pnpm test:unit` / `test:contract` / `test:component` / `test:integration` / `test:e2e` / `test:smoke`。

### 11.1 Stage 1 用例

| 用例 | 类型 | 步骤/断言 |
|---|---|---|
| S1-T1 配置注入 | 单测 | 面板写入 `.env.local` → llm client 读取 → 请求带对 baseURL/key/model；intent/plan/judge 三角色温度、模型分别生效 |
| S1-T2 LLM 契约 | 契约 | mock OpenAI `chat/completions` 200 → 解析成功；500/超时 → 重试 2 次退避后 failed；错误消息透传设置面板 |
| S1-T3 schema 解析 | 单测 | Intent/CreationPlan 合法 → 通过；缺字段/错类型/越界（时长非正、结构为空）→ zod 拒绝并给出字段级错误 |
| S1-T4 设置面板 | 组件 | 未配置 → 引导页；保存 → 热生效（下条请求命中新端点）；无效 baseURL → 明确报错不崩 |
| S1-T5 规划集成 | 集成 | `POST /api/chat` + mock LLM → 返回流式意图/规划 JSON；前端规划卡片渲染 |

### 11.2 Stage 2 用例

| 用例 | 类型 | 步骤/断言 |
|---|---|---|
| S2-T1 align 建模 | 单测 | 任意形状 Suno 元数据 → AlignedSong 五维（主题/情绪/风格/时长/结构）映射正确；缺元数据字段时降级为 LLM 抽取 |
| S2-T2 judge 阈值 | 单测 | 评分 3.5 → pass；3.4 → retry；规则检测：时长超 ±15% / 空歌词 / 音频缺失 → 任一失败即 retry（记录原因） |
| S2-T3 重派回环 | 集成 | fail → retry（seed 更新）→ 二次 pass（断言重派记录=1）；连续 3 次 fail → give-up，交付最优+报告 |
| S2-T4 图端到端（Mock） | 集成 | AgentState 流转 intent→plan→dispatch→subagent→align→judge→deliver；每个 phase 事件顺序与 payload 校验 |
| S2-T5 jobs 状态机 | 集成 | queued→running(phases)→done / failed；LLM 500 → failed 且会话可重跑；重复请求幂等（同 jobId 返回同 job） |
| S2-T6 阶段进度 UI | 组件 | 事件流 → 进度条/报告卡渲染；judge 报告维度与分数展示 |

### 11.3 Stage 3 用例

| 用例 | 类型 | 步骤/断言 |
|---|---|---|
| S3-T1 Suno 契约 | 契约 | 配额预检：低配额 → failed(quota) 提示；`custom_generate` 参数映射（计划→prompt/title/tags/lyrics）正确；`/api/get?ids` 轮询（5s 间隔、5min 超时、pending→complete）正确 |
| S3-T2 源格式保护 | 集成 | 下载不经转码：文件字节与源直链一致、mime 保持（mp3/wav） |
| S3-T3 交付完整 | 集成 | job done → `/api/jobs/:id/result` 返回 AlignedSong+JudgeReport 完整 → 下载可用且可播 |
| S3-T4 失效路径 | 集成 | cookie 失效（401/429）→ job failed(reason) → 前端引导续 cookie 界面；恢复后同 job 可重跑 |

### 11.4 冒烟测试（Smoke，整体实现完成后的**必跑项**）

| 用例 | 步骤/断言 | 时间盒 |
|---|---|---|
| SM-1 快速链路 | 输入预置文案 → 意图+规划（真实 LLM）→ 引擎（Mock，冒烟不回退真实 Suno 保速）→ 出歌+下载存在 | ≤3 分钟 |
| SM-2 配置冒烟 | 无效 LLM 端点 → 报错恢复不崩；切回有效 → 恢复可用 | ≤1 分钟 |
| SM-3 复现冒烟 | 同输入+种子 → 规划/编曲参数一致性断言（计划 hash 相同） | ≤1 分钟 |

冒烟执行：`pnpm test:smoke`（vitest sequential）；作为任何演示/交付前的前置检查。

### 11.5 端到端测试（E2E，Playwright）

| 用例 | 断言 | 备注 |
|---|---|---|
| E2E-1 完整链路（Suno） | 输入→意图→规划→Agent 调度→回传→对齐评判→交付页下载**源格式音频**；每步产物可见；报告卡显示 | `@e2e-suno`，需 cookie+配额，演示前手动跑/CI 跳过 |
| E2E-2 完整链路（Mock 回退） | 同 E2E-1，引擎=Mock | `@e2e-mock`，无 cookie 环境的链路回归（断言全同，仅引擎替） |
| E2E-3 重派演示 | 注入低分 judge → retry 可见 → 二次成功 | 与 S2-T3 联动 |
| E2E-4 失败恢复 | LLM 断连 → 重试提示；cookie 失效 → 引导 | 与 S3-T4 联动 |

**执行策略**：E2E-2/3/4 纳入 `test:e2e`（CI 可跑）；E2E-1 为**验收脚本主体**（`test:e2e:suno`，演示前手动执行——即 PRD §5 交付物 2 的可执行化）。

### 11.6 测试矩阵（模块 × 层次）

| 模块 | 单测 | 契约 | 组件 | 集成 | E2E/冒烟 |
|---|---|---|---|---|---|
| packages/schema | S1-T3 | — | — | — | — |
| packages/llm（面板/客户端） | S1-T1 | S1-T2 | S1-T4 | S1-T5 | SM-2 |
| packages/agents（图/align/judge） | S2-T1, S2-T2 | — | — | S2-T3, S2-T4, S2-T5 | E2E-3 |
| packages/engine（adapter） | — | S3-T1 | — | S3-T2, S3-T3, S3-T4 | E2E-1/2 |
| apps/web（UI） | — | — | S2-T6 | — | E2E-1..4, SM-1/3 |

## 11. 风险

- suno 反爬/风控（hCaptcha）：依赖 suno-api 的 2Captcha/Playwright 方案，演示环境预配 cookie；接口变动时 adapter 隔离修复。
- LGPL-3.0：suno-api 为独立服务进程（HTTP 集成），不静态链接，MIT 仓库边界清晰。
- LLM 依赖：演示需可用 OpenAI 兼容端点（本地 Ollama 或云端 key）。


## 12. 状态对账（2026-08-30）

| Stage | 内容 | 状态 | 缺口 |
|---|---|---|---|
| Stage 1 输入与规划层 | 骨架/LLM 面板/意图规划（真实 LLM）/测试 S1 | ✅ 完成 | 前端组件单测（S1-T4 组件自动化）留 Stage 4 |
| Stage 2 Agent 编排层 | LangGraph 图+align/judge+MockAdapter+jobs+SSE+前端进度/报告 | ✅ 完成（S2-T1~T5） | — |
| Stage 3 出歌交付层 | vendor 二次开发/DRM 解密/同源播放端点（MP3 缓存+Range） | ✅ 主体完成（G1~G6 + D1/D2） | ①创作室单次真实出歌终验（生成风控冷却后）②Playwright E2E 基建 ③S3-T2/T3 用例对齐 |
| Stage 4 产品壳（P1） | 创作记录列表/会话持久化/失败引导 UI/Mock 开关 UI/README 10 分钟/基础 e2e | ⚠ 部分：作品列表页✅（songs）；失败引导=报错文案⚠ | 会话持久化（sessions 内存态）：❌；Mock 开关 UI：❌；README 10 分钟启动：❌；Playwright 基测：❌ |
| Stage 5 M4+（P2） | Stem/Studio/批量/工作流共享/插件化/Electron/资产库 | 不实现（PRD「不做」节） | —（路线预留） |

**定版说明**：AudioDelivery 三阶段——suno-session（绕开）→ server-decrypt（解密失败表象）→ **server-decrypt-transcode**（最终：解密+转码双层缓存，解决 mp4/Opus 浏览器容器差异）。
