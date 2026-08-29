# ColorMax MVP Demo PRD

> 目标：跑通**核心出歌主流程**——输入一句创作 idea，端到端输出一首可播放的完整歌曲（含创作参数记录）。本轮 M0 范围 = 仓库初始化 + 本 PRD。

## 1. 背景与定位

- 产品定位：开源版 SunoWeb alternative。Suno 等强模型是**生成引擎**（保留使用），ColorMax 在其上补"平台给不出来的"体验：可解剖、可复现、可并行的沉浸创作。
- 与 Suno 的关系：not replacement——引擎用 Suno/强模型；我们提供创作编排层（多 Agent 编曲）、作品资产管理、可复现工作流、Studio 深度创作空间（后续迭代）。
- 本项目以当前 baseline 从零搭建（继承旧仓库仅仓库名与"基于 Suno 的 AI 音乐创作"主题；代码全部重新实现，方向：Next.js 全栈）。

## 2. MVP 范围（一条出歌主流程）

### 2.1 用户故事（核心）

> 作为零基础创作者，我输入一句话创作想法（如"给妈妈写一首温暖的中文抒情歌"），选择风格/情绪/时长约束，等待系统自动完成**创作规划 → 歌词 → 编曲参数 → 音频渲染**，最终得到一首可播放的歌（音频 + 创作记录展示），全程可见每步产出。

### 2.2 端到端主流程（demo 链路）

```
输入 idea（+风格/情绪/时长约束）
  → [Agent 1] 意图分析与创作规划：解析主题/风格/情绪 → 输出创作计划 JSON
  → [Agent 2] 词曲生成：歌词结构（主歌-副歌-桥段）+ 段落歌词
  → [Agent 3] 编曲参数化：调性/和弦走向/节奏型/速度/音色轨 → 编曲参数 JSON（MIDI 参数化最小实现）
  → [引擎层] 音频渲染：EngineAdapter 按编曲参数/歌词合成歌曲
  → [输出] 音频播放（可听）+ 创作记录（每步 JSON 回放展示）
```

**demo 验收标准**：从输入到可播放歌曲 ≤ 2 分钟（mock 引擎模式）；每步产出在界面可见可回溯；刷新/重跑可复现（同输入+同种子 → 同产物）。

### 2.3 MVP 内（In-Scope）

| 模块 | 内容 | 对齐 bullet |
|---|---|---|
| 创作入口 | 对话式输入 + 约束选择（风格/情绪/时长） | B1 多 Agent 编曲（零基础层） |
| 创作规划 Agent | LLM 意图分析 → 创作计划 JSON（主题/情绪/结构/参数骨架） | B1 |
| 词曲 Agent | 歌词段落生成（按计划结构） | B1 |
| 编曲 Agent | 编曲参数 JSON：调性/和弦/节奏型/BPM/音色轨（MIDI 参数化最小集） | B1 |
| 引擎适配层 | `EngineAdapter` 接口：`SunoAdapter`（真实 Suno API，配置 key 后启用）/ `MockAdapter`（本地合成可播放音频——WebAudio/预置音色片段拼接，可听） | B4 引擎接入抽象（API 化接入） |
| 渲染任务状态 | 长任务状态机（queued/running/done/failed）+ 轮询 | B2 BFF 长任务状态机 |
| 创作记录 | 每步产物 JSON 落库 + 展示（可复现） | B3 配置即创作程序（可重放雏形） |

### 2.4 MVP 外（Out of Scope → 后续迭代）

- Studio DAW 空间 / 第三方服务集成（B4 完整版）——后续 M4+
- Stem 分轨 / MIDI 导出（可解剖栈）——M4+
- 批量流水线 / 工作流共享（B3 完整版）——M4+
- 插件化服务接入与渐进式插件——M4+
- 桌面端（Electron）——M4+
- 计费 / 用户体系完整版——M4+

## 3. 技术蓝图

### 3.1 栈

- **Next.js 15 (App Router) + TypeScript**；前端 + API 路由（BFF 一层）
- 数据库：SQLite（drizzle）起步（零依赖；后续切 Postgres）
- LLM：**OpenAI 兼容接口**（可配置 baseURL——支持云端/本地 Ollama 等；角色：创作规划/歌词/编曲参数）
- 音频引擎：`packages/engine` 适配层（SunoAdapter 预留 / MockAdapter 本地合成——WebAudio 离线渲染或预置素材拼接，保证无可外部依赖也能出可听音频）
- 任务状态：内存/DB 轮询（MVP 单实例即可）

### 3.2 目录结构（规划）

```
apps/web          Next.js 前端 + API（创作对话/规划/渲染/状态）
packages/engine   EngineAdapter（Suno/Mock）+ 音频合成工具
packages/agents   编排器（规划→词曲→编曲→渲染链 + Grill 迭代骨架）
packages/schema   创作计划/编曲参数/创作记录 JSON Schema（zod）
docs/             PRD 与设计文档
```

### 3.3 关键接口（草案）

```ts
// packages/schema: 创作计划
interface CreationPlan { theme; mood; style; durationSec; structure: SongSection[]; }
// 编曲参数（MIDI 参数化最小集）
interface ArrangementParams { key: string; bpm: number; chordProgression: string[];
  groove: string; stemTracks: { type: 'drums'|'bass'|'chords'|'melody'; samples: string[] }[]; }
// 引擎适配层
interface EngineAdapter { render(req: RenderRequest): Promise<RenderJob>; status(jobId); poll(jobId); }
```

## 4. 里程碑（实现计划）

| 阶段 | 交付 | 验收 |
|---|---|---|
| M1 骨架 | Next.js 起 + 创作对话 + LLM 规划 JSON（mock 词曲/编曲可先统一下发） | 输入→规划可见 |
| M2 引擎 | EngineAdapter（Mock 合成可听音频）+ 任务状态机 | 规划→可播放音频 |
| M3 出歌 | 创作记录落库 + 展示 + 重跑复现 | **端到端出歌 demo 通过** |
| M4+ | 资产库/批量/Studio/Stem | roadmap |

## 5. 风险与依赖

- **Suno 官方 API 可用性**：不可得则长期以 Mock 引擎保端到端真实链路，Adapter 隔离；"真实引擎"通过配置切换，不在 demo 链路上强耦合。
- **LLM 供应**：开发用 OpenAI 兼容端点（本地或云端，可 config）；demo 出厂带 mock LLM 响应兜底（无网络也能跑通链路演示）。
- **版权边界**：歌词/旋律均由 LLM 参数化生成，mock 音色使用自资/免版权素材。

## 6. 验收清单（M3 完成标准）

- [ ] 输入一句话+约束 → 出歌（可播放音频，Mock 引擎）
- [ ] 每步产物（计划/歌词/编曲参数/音频）界面可见
- [ ] 同输入+种子 → 复现同产物
- [ ] 状态机异常路径（失败重试）不崩
- [ ] README 提供 10 分钟启动说明（零 LLM key / 零引擎 key 可跑）
