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
| `GET /api/jobs/:id/events` | SSE：阶段进度 + 细粒度流式帧（llm_thinking/tool_call/suno_progress/error_review*）；**帧带 `id:seq`，支持 `Last-Event-ID`/`?after=` 断线补帧与已结束任务历史重放**（Stage 6.1） |
| `POST /api/jobs/:id/resume` | 失败接续：从快照落点重跑（同进程内存快照；Stage 6.2）；`DELETE` 同路径=放弃接续 |
| `POST /api/jobs/:id/intent` | 失败后新消息意图三分类（resume/restart/new，LLM 路由；Stage 6.2） |
| `GET /api/jobs/:id/result` | 交付：AlignedSong + JudgeReport |
| `GET /api/songs/:id/audio` | 播放中继：DRM 解密 + **缓存未命中同步转码 MP3 直出**（2026-08-30 修复首帧 mp4/Opus 不可播缺陷；Range/缓存/全端兼容） |
| `GET /api/songs/:jobId/download` | 下载 Suno 源格式音频 |

内部 Suno 接入（2026-08-30 用户拍板：**vendor gcui-art/suno-api 源码本地二次开发**，非远程 HTTP 调独立服务）：
`packages/suno-gateway`：vendor `SunoApi.ts`/`utils.ts`（LGPL-3.0 保留许可+修改声明），二次开发点 = ①移除浏览器/CAPTCHA 重依赖（rebrowser/2captcha/ghost-cursor）→ fail-fast `CaptchaRequiredError`（CookiePool 轮换/人工）②HTTP transport 可注入（测试/代理）③常量 UA ④logger 控制台化 ⑤wait_audio 轮询上限可配（默认 5min）⑥cookie 会话池（轮换+失效剔除，≥2 次失败剔出）⑮轮询进度回调 `onPoll`（→ suno_progress 帧实时回对话；仅签名扩展，不引入项目依赖）。
`SunoGatewayAdapter.render` = 配额预检（`/api/billing/info/` get_credits）→ `custom_generate`（lyrics+创作约束 prompt，tags=风格/调性/节奏型+和弦走向，**strict-complete** 轮询——原版把 streaming 当完成是缺陷）→ feed 对齐 `complete` → **`/api/clip/{id}` 详情取 media_urls 真实源链（feed 的 audio_url=api/forbidden 旧占位）** → **AudioDelivery=server-decrypt-transcode**（2026-08-30 逆向后定版）：下载密文（`media_urls` 直链，feed 的 audio_url=api/forbidden 是旧占位）→ **DRM 解密（逆向自 suno.com bundle：`userKey=SHA-256(JWT)` AES-GCM → `POST /api/mango/rights`(Bearer JWT) → key/iv 以 contentId 为 additionalData GCM unwrap → AES-CTR 单次整批解密）** → **ffmpeg 转码 MP3 缓存 + 同源 Range 播放**（`/api/songs/:id/audio`：缓存未命中**请求内同步转码**直出 audio/mpeg——2026-08-30 修复：旧"首帧直出 mp4/Opus+后台转码"策略下未缓存曲目 Chrome 0:00 不可播且 UI 不重试；仅 ffmpeg 失败回退 mp4 直出）——全浏览器兼容。

## 5. LLM 设置面板（无 mock 契约）

- 设置页字段（真实 API Key 接口，2026-08-30 定版，对齐 DeepSeek「接入 DeepSeek」示例）：**供应商名称 / Base URL / Model / API Key / API 格式下拉（OpenAI 兼容 / Anthropic Messages 兼容）/ maxTokens / 温度 / thinking 开关**；三角色（intent/plan/judge）可各自覆盖 model/temperature。
- 后端封装 `packages/llm`：`chatCompletion` 支持 OpenAI 与 Anthropic `/messages` 双格式；**可选 `stream` + `onChunk/onReasoning`**（DeepSeek-R1 `reasoning_content` 推理链 + 正文双通道；端点不支持流式自动降级一次性）；写入 `.env.local` 增量合并（保留 `SUNO_COOKIES` 等非 LLM 键——防覆盖）；**所有阶段调用真实 LLM，无 mock JSON 分支**；配置缺失时前端引导。输出契约有破损预修复 + zod repairPlan + 自纠错回喂。

## 6. 前端集成（chat UI）

- **实际实现（2026-08-31 定版，替换旧 AI SDK/useChat 草案——从未落地，且与 antd x 栈冲突）**：`@ant-design/x`（Bubble/Sender/Conversations/Welcome）+ **手写 SSE reader**（`fetch('/api/jobs/:id/events')` + `getReader`），不引第三方聊天框架。
- **segment 流式模型**：assistant 消息 = `segments[]`，事件经 `applyEvent` 纯 reducer 归约。块类型：`thinking`（LLM 推理，默认折叠/展开固定高滚动/折叠态尾行摘要）、`terminal`（工具执行，等宽高亮，高度随输出）、`suno`（生成进度条：done/total+elapsed）、`plan/judge/result` 卡片、`error`（结构化失败，raw 只入调试折叠区）。
- 纯函数分层便于 node:test：`lib/segments.ts`（reducer）、`lib/sse.ts`（帧解析）、`lib/storage.ts`（持久化，见 §7）。设计原则不变：能用现成组件就不手搓，但对话流的**流式归约/持久化**自持（第三方模板难以匹配 Agent 阶段事件语义）。

## 7. 数据模型与会话持久化（ADR-001）

- **决策**：MVP 会话持久化用**浏览器 localStorage**（`lib/storage.ts` 纯函数 + KV 注入），**不引入 DB**。理由：后续可能更换 Agent 运行框架 / 加入工作流编排 runtime，届时连同运行 state 做 SQL 存储；现在上 SQLite/drizzle 反而增加后续版本迁移复杂度。
- localStorage 键：`cm.sessions`（≤20）/`cm.msgs:<sid>`（≤200 条，thinking 存合并终态、error.raw 截断 400）/`cm.board.snapshot`(+`cm.board.at`，TTL 10min)/`cm.resume:<jobId>`（失败快照冗余，TTL 24h）/`cm.v` 版本位；坏数据降级空、配额异常静默不崩。
- 刷新恢复三分支：job 服务端 terminal→历史全量重放补齐；running→带 Last-Event-ID 续播；gone（进程重启）→标记丢失（接续快照仅存活于同进程，见 §8）。
- **预留 SQL 蓝图（延后至 runtime 迁移，本版不实现）**：`sessions/messages/jobs/songs` 四表。jobs/songs 服务端仍为内存 `JobStore`（进程内态）。

## 8. 错误与恢复（Stage 6.2 失败编排）

- **失败不直达 raw**：任一节点抛错 → JobStore 捕获 → ①`state_saved`（同进程内存快照累积各节点产出）→ ②`reviewFailure`：LLM 评审 `{category,resolvableByCli,cliSuggestion?,headline,steps[]}`，流式 `error_review_delta`；评审 LLM 自身失败 → 正则 `classifyFallback` 降级 → ③`failed(causeKind)`。前端本轮 workflow 段（thinking/terminal/suno）**清除**，交付卡片保留，error 卡接管。
- **接续（resume）**：同进程内存快照（用户拍板，**不写文件/DB**；localStorage 仅冗余一份供跨刷新提示）。`POST /api/jobs/:id/resume` 从失败落点（`NODE_OF_PHASE`）经 LangGraph START→失败节点，**跳过已完成节点**（seed 注入 channels）。成功即清快照。
- **意图路由**：失败后用户新消息 → `POST /api/jobs/:id/intent` → `routeAfterFailure` LLM 三分类 resume/restart/new（路由不可用保守降 new）。restart=丢弃快照 + 以原 prompt 重发；cancel=丢弃快照。
- **give-up（已接线）**：judge 重派超限仍 retry → 定论 `give-up`，交付当前最优 + 报告注明。
- **Suno cookie 失效/风控**：`SunoQuotaError/CaptchaRequiredError/auth` → 剔除 cookie 并轮换下一会话池；耗尽 → 走上述失败编排（category=captcha/quota/cookie）。
- **LLM 调用失败**：单阶段重试 2 次（退避）；连续失败 → 走失败编排；快照保留可 resume。

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

- 创作记录列表页（历史歌曲/报告）✅（作品看板 2026-08-30）、会话持久化完善 → **已升级为 Stage 4.1 实现**、失败友好 UI（→ Stage 6.2 结构化评审）、Mock 模式开关 UI（仅开发可见，❌ 未做）、README 10 分钟启动说明（❌）、基础 e2e 测试（❌）

### Stage 4.1 ｜ 会话持久化（R2，localStorage 过渡） — P0 ✅（2026-08-31）

- **Step 4.1.1** `lib/storage.ts` 纯函数 + KV 注入：sessions(≤20)/msgs(≤200，终态收敛+raw 截断)/board 快照(TTL 10min)/resume 冗余(TTL 24h)/版本位；坏数据降级、配额异常静默
- **Step 4.1.2** `useSessions`：初始化/新建/切换/落盘节流（30 帧一存+终态必存）；刷新恢复**三分支**（terminal→重放 / running→Last-Event-ID 续播 / gone→丢失提示）
- **Step 4.1.3** SongsBoard 快照先行渲染 + 离线标注（cookie 冷却期不白屏）
- **验收**：SM-4 刷新续播（HTTP 冒烟：25 帧断开→seq26 续播 183 帧含 done→结束后重放 208 帧）✅；S4-T1/T2/T3 ✅
- 依赖：Stage 6.1（事件历史环+replay 为底座）；**明确不引入 DB（ADR-001，见 §7）**

### Stage 6 ｜ 流式可观测与失败恢复（R3，本轮用户提报） — P0 ✅（2026-08-31）

- **6.1 流式可观测层**：
  - Step 6.1.1 事件契约扩展（schema：llm_thinking/tool_call/suno_progress + 信封 seq/roundId + JobStore 历史环形缓冲 + SSE Last-Event-ID 补帧）✅
  - Step 6.1.2 LLM 流式：`chatCompletion` stream/onChunk/onReasoning（OpenAI/Anthropic 双格式 + 非流式端点自动降级）；`llmThinkingCall` 80ms/240 字符节流成帧 ✅
  - Step 6.1.3 Suno 进度：vendor onPoll（二次开发点⑮）→ adapter tool_call 全步骤包夹 + suno_progress；`EngineAdapter.render(req, hooks)` ✅
  - Step 6.1.4 前端 segment 架构：`lib/segments.ts` reducer + `lib/sse.ts` + blocks 五组件（Thinking/Terminal/SunoProgress/ErrorCard/卡片化 plan/judge/result）+ Studio 拆分 ✅
- **6.2 失败编排与接续**：
  - Step 6.2.1 `reviewFailure`（LLM 结构化评审 + classifyFallback 降级 + 流式 delta）；`routeAfterFailure` 三分类 ✅
  - Step 6.2.2 JobStore 失败编排：快照累积（onSnapshot）→ state_saved → 评审 → failed(causeKind)；resume/canResume/resumeInfo/dropResume（同进程内存，不跨重启——用户拍板）✅
  - Step 6.2.3 API：`/resume`（POST/DELETE）+ `/intent`（POST）✅
  - Step 6.2.4 graph give-up 枚举接线（超限→定论 give-up 交付最优）；前端失败→自动路由→接续；reducer 评审帧即时建卡+failed 收敛 ✅
- **验收**：S6-T1~T13 全绿；HTTP 契约冒烟（failed(intent,network)→review→resume→resume_applied→drop）✅；真实 Suno 链路「失败→接续→交付」终验随风控冷却复跑
- 依赖：6.1→6.2；6.1 依赖 Stage 2（图节点）；前端依赖 Stage 4.1（恢复底座共享历史环）

### Stage 5 ｜ M4+ 路线（P2，不实现） — P2

- Stem 分轨/MIDI 导出、Studio DAW 空间、批量流水线/工作流共享、插件化服务接入、Electron 桌面端、资产库完整版（详见 PRD「不做」节）

### Stage 依赖图

```
Stage 1 ──► Stage 2 ──► Stage 3 ──► Stage 6（6.1 流式可观测 → 6.2 失败接续）
              ▲ engine 接口定稿            │        ▲
              └── MockAdapter 仅 2-3 调试；  │        └── Stage 4.1 持久化（共享历史环+replay）
                  验收/演示必须 SunoAdapter  └──► Stage 4（P1 剩余壳：Mock 开关 UI/README/e2e）──► Stage 5（P2 路线）
```

### 里程碑对应

| 里程碑 | 覆盖 Stage |
|---|---|
| M1 | Stage 1 |
| M2 | Stage 2 |
| M3 | Stage 3 + 验收 |
| M4 | Stage 4.1 + Stage 6（流式/持久化/失败恢复——2026-08-31 交付） |
| M4+ | Stage 4 剩余 / Stage 5（路线） |

### 测试策略（按 Stage）

- Stage 1：schema zod 单测、llm client 契约测试（mock HTTP 端点）
- Stage 2：align/judge 单测（固定 LLM 响应 rubric 边界：3.5 阈值/重派上限）；图端到端（MockAdapter）
- Stage 3：SunoAdapter 契约测试（suno-api HTTP mock）；E2E 验收脚本
- Stage 4.1：storage 纯函数单测（S4-T1~T3）+ SM-4 刷新续播 HTTP 冒烟
- Stage 6：llm 流式契约（S6-T1/T2/T3 降级）、事件环/replay（S6-T4/T5）、Suno 事件链（S6-T6）、reducer/SSE 解析（S6-T7/T8）、失败编排/接续/路由（S6-T9~T13）；SM-5 失败→接续→交付
- Stage 4 剩余：前端组件测试 + 全链路 e2e（Playwright，真实 LLM + Mock 引擎回归）

## 11. 测试计划（Test Plan）

**分层**：单测｜契约（mock HTTP 端点）｜组件｜集成（图/API 全链）｜E2E（Playwright，待建）｜冒烟（时间盒快速验证）。**落地说明（2026-08-31）**：实际基建=node:test + 手搭 mock HTTP server（零新依赖，与 workspace 风格一致，vitest 引入取消）；入口=各包 `node --test test/*.test.ts` + 根 `pnpm test:unit`。

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

### 11.3 Stage 3 用例（S3-T2/T3/T4 已按定版架构对齐 2026-08-31——原「源格式保护不转码」与 server-decrypt-transcode 矛盾，废弃改写）

| 用例 | 类型 | 步骤/断言 | 状态 |
|---|---|---|---|
| S3-T1 Suno 契约 | 契约 | 配额预检（低配额→SunoQuotaError）；`custom_generate` 参数映射；strict-complete 轮询（waitAudioMs 上限、streaming 不算完成） | ✅ G1/G3/G4 |
| S3-T2 解密转码交付 | 集成 | 密文源→DRM 解密（rights unwrap+AES-CTR 自证 fixture）→MP3 缓存→Range 206；未命中同步转码首帧 audio/mpeg | ✅ D1/D2 + 中继冒烟（S6-T6 覆盖事件链） |
| S3-T3 交付完整 | 集成 | job done → result 返回 AlignedSong+JudgeReport 完整 → `/api/songs/:id/audio` 可播 | ✅（浏览器终验待真实链路） |
| S3-T4 失效路径 | 集成 | cookie 失效/风控/CAPTCHA → CookiePool 轮换（告警帧）→ 池耗尽 → 失败编排（见 S6-T9） | ✅ G2 + S6-T9 |

### 11.3a Stage 4.1 用例（持久化）

| 用例 | 类型 | 断言 | 状态 |
|---|---|---|---|
| S4-T1 序列化往返 | 单测 | sessions cap 20/msgs 截断流式标记/raw 限 400/坏 JSON 降级空/配额异常静默 | ✅ |
| S4-T2 恢复三分支 | 单测 | terminal→replay、running→watch(fromSeq=已见游标)、gone→lost；error 卡终结消息 | ✅ |
| S4-T3 快照 TTL | 单测 | board 10min / resume 24h / clearResume | ✅ |

### 11.3b Stage 6 用例（流式可观测 + 失败恢复）

| 用例 | 类型 | 断言 | 状态 |
|---|---|---|---|
| S6-T1/T2 llm 流式契约 | 契约 | OpenAI content/reasoning_content、Anthropic text_delta/thinking_delta 双通道聚合 | ✅ |
| S6-T3 流式降级 | 契约 | 端点返回 JSON（非 SSE）→ 全文单回调 | ✅ |
| S6-T4 事件历史环 | 单测 | cap 截断、done/failed/state_saved 永驻、seq 单调 | ✅ |
| S6-T5/T5b replay 语义 | 单测 | historyAfter 游标切片、roundId 信封、failed 带 failPhase | ✅ |
| S6-T3(agents) 思考帧 | 集成 | intent/plan/judge 帧全覆盖、双通道聚合=模型输出、delta 被节流合并 | ✅ |
| S6-T6 Suno 事件链 | 集成 | tool_call 七步骤 start/end 配对、onPoll→suno_progress | ✅ |
| S6-T7/T8 前端 reducer/SSE | 单测 | segment 归约（thinking/terminal/suno/failed 清除/评审建卡）、帧解析残帧 | ✅ |
| S6-T9~T13 失败编排 | 集成 | state_saved→review→failed(causeKind)；classifyFallback 降级；resume 跳过已完成节点；intent 三分类+故障保守 new；dropResume | ✅ |

### 11.4 冒烟测试（Smoke，整体实现完成后的**必跑项**）

| 用例 | 步骤/断言 | 时间盒 | 状态 |
|---|---|---|---|
| SM-1 快速链路 | 输入预置文案 → 意图+规划（真实 LLM）→ 引擎（Mock，冒烟不回退真实 Suno 保速）→ 出歌+下载存在 | ≤3 分钟 | ✅（2026-08-31 真实 DeepSeek+Mock 引擎跑通，297 思考帧） |
| SM-2 配置冒烟 | 无效 LLM 端点 → 报错恢复不崩；切回有效 → 恢复可用 | ≤1 分钟 | ✅（S6-T5b/SM-5 覆盖失败面） |
| SM-3 复现冒烟 | 同输入+种子 → 规划/编曲参数一致性断言（计划 hash 相同） | ≤1 分钟 | ❌ 未跑 |
| SM-4 刷新续播 | 事件流中途断开 → Last-Event-ID 续播补齐至 done；已结束任务重放；localStorage 三分支恢复 | ≤2 分钟 | ✅（HTTP 冒烟 + S4-T2） |
| SM-5 失败→接续→交付 | 引擎首败 → 评审卡（非 raw）→ resume 跳过已完成节点 → done；drop 清快照 | ≤3 分钟 | ✅（单元 S6-T9~T13 + HTTP 契约冒烟；真实 Suno 终验随冷却复跑） |

冒烟执行：逐包 `node --test` + 手工 HTTP 冒烟脚本（Playwright 化待 Stage 4 e2e 基建）；作为任何演示/交付前的前置检查。

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
| packages/llm（面板/客户端） | S1-T1 | S1-T2, **S6-T1/T2/T3** | S1-T4(待) | S1-T5 | SM-2 |
| packages/agents（图/align/judge/review） | S2-T1, S2-T2, S4-T2(前端域) | — | — | S2-T3~T5, **S6-T4/T5/T5b/思考帧T3/T9~T13** | E2E-3 |
| packages/engine + suno-gateway | — | S3-T1, G 系列 | — | S3-T2~T4, **S6-T6** | E2E-1/2 |
| apps/web（UI/lib） | — | — | S2-T6(待) | **S6-T7/T8, S4-T1/T3** | E2E-1..4, SM-1/4/5 |

## 12. 风险

- suno 反爬/风控（hCaptcha）：生成端 token/验证链路为最大不确定项——**专项调研见 §14（任务书）**；短期=浏览器预热+冷却+CookiePool 轮换；接口变动时 adapter 隔离修复。
- LGPL-3.0：vendor 源码本地二次开发（非独立服务进程，2026-08-30 拍板），修改点以「二次开发点①~⑮」注释划界，LICENSE 文件随附。
- LLM 依赖：演示需可用 OpenAI/Anthropic 兼容端点；输出契约破损面已有三级兜底（预修复/repairPlan/自纠错回喂）。
- 流式链路：端点不支持 SSE 自动降级一次性（已测）；高频帧 localStorage 写入已节流。

## 13. 状态对账（2026-08-31）

| Stage | 内容 | 状态 | 缺口 |
|---|---|---|---|
| Stage 1 输入与规划层 | 骨架/LLM 面板/意图规划（真实 LLM）/测试 S1 | ✅ 完成 | 前端组件单测（S1-T4 组件自动化）留 Stage 4 |
| Stage 2 Agent 编排层 | LangGraph 图+align/judge+MockAdapter+jobs+SSE+前端进度/报告 | ✅ 完成（S2-T1~T8） | — |
| Stage 3 出歌交付层 | vendor 二次开发/DRM 解密/同源播放（MP3 缓存+Range+**未命中同步转码修复 08-30**） | ✅ 完成（G/D 系列 + 中继冒烟） | ①创作室单次真实出歌终验（生成风控冷却后，配合 §14 调研）②Playwright E2E 基建（Stage 4） |
| Stage 4 产品壳（P1） | 作品看板✅/失败引导✅（升 6.2）/持久化✅（升 4.1） | ⚠ 部分 | Mock 开关 UI ❌；README 10 分钟启动 ❌；Playwright 基测 ❌ |
| Stage 4.1 会话持久化 | localStorage（ADR-001）：sessions/msgs/三分支恢复/看板快照/resume 冗余 | ✅ 完成（S4-T1~T3 + SM-4） | 跨进程接续不做（拍板） |
| Stage 6 流式可观测+失败恢复 | 事件契约/llm 流式双通道/Suno 进度/segment UI/评审编排/resume/意图路由/give-up | ✅ 完成（S6-T1~T13 + SM-1/4/5） | 真实 Suno 链路「失败→接续→交付」终验随冷却复跑 |
| Stage 5 M4+（P2） | Stem/Studio/批量/工作流共享/插件化/Electron/资产库 | 不实现（PRD「不做」节） | —（路线预留） |

**定版说明**：AudioDelivery 三阶段——suno-session（绕开）→ server-decrypt（解密失败表象）→ **server-decrypt-transcode**（最终：解密+转码双层缓存，解决 mp4/Opus 浏览器容器差异；08-30 追加：缓存未命中请求内同步转码，消灭首帧不可播窗口）。

## 14. Suno 风控调研任务书（R1——后续单独沟通，本轮只立项）

**目标**：把「生成端 CAPTCHA/风控」从偶发阻塞变成可预期、可运维的能力。**调研三条线**：

1. **触发条件画像**：哪些变量决定 token 校验强度（账号等级/生成频率/IP 与设备指纹一致性/session 新鲜度/新模型灰度期）；产出=触发概率矩阵 + 最小冷却间隔建议（实测 suno.com 面板 vs vendor 路径的差异）。
2. **绕过代价评估**：①浏览器会话预热+人工过一次验证的续命时长；②token 直供（从已登录浏览器导出注入 vendor `getCaptcha` 通路）的可行性与失效半径；③hCaptcha 打码服务（2Captcha 类）的成本/合规/稳定性；④多账号 CookiePool 轮换的有效性与封号风险。**结论需含合规声明**（演示环境 vs 生产使用边界）。
3. **替代生成通道**：官方 API waitlist/合作通道、第三方聚合（如 SunoAPI.org/RingAPI 类）镜像的接口保真度与价格；横评表=延迟/成功率/风控暴露面/许可。

**交付形态**：调研报告（`docs/risk-control-research.md`）+ 决策点清单（选哪条线接入）→ 再立实现 Stage。**验收标准**：连续 10 次真实生成无人工介入成功率 ≥80%，或给出明确「不可行+替代通道」结论。
