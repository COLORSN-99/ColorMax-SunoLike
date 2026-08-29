# ColorMax MVP Demo PRD

> 目标：走通**完整出歌主流程**——输入一句话创作想法，经多 Agent 编排调用 Suno 真实出歌，交付可下载的 Suno 源格式音频。
> 版本：v2（2026-08-29 用户对齐稿确认：LangGraph / gcui-art/suno-api / Vercel AI SDK / LLM 配置面板）

## 1. 背景与定位

开源版 SunoWeb alternative **不是替代 Suno**：Suno 强模型是生成引擎（保留使用），ColorMax 在其上补"平台给不出来的"体验（可解剖、可复现、可并行、沉浸创作）。MVP 只打一条主流程：**一句话 → 一首歌（Suno 源格式音频）**。

## 2. 核心用户故事与验收链路（完整）

> 作为零基础创作者，我在创作室输入一句话想法（+风格/情绪/时长约束），系统自动完成意图分析 → 创作规划 → Agent 框架调度 Subagent 调用 Suno 出歌 → 回传给 Leader 做统一建模对齐与效果评判 → 交付可下载的 Suno 源格式音频，全程每步可见。

```
输入（chat UI）
 → 意图分析（LLM：主题/风格/情绪/时长 → Intent JSON）
 → 创作规划（LLM：歌词结构/段落/编曲配置 → CreationPlan JSON）
 → Agent 框架编排（ Leader 图）：
    ├─ Leader 派发 Subagent 节点（管控调度 Suno）
    ├─ Subagent → SunoAdapter → suno-api 服务（cookie 会话/配额预检/custom_generate/轮询）
    ├─ Subagent 交付歌曲（源格式音频 + 元数据/时长/歌词/风格）回传 Leader
    └─ Leader 统一建模对齐：原语义输入 ↔ Subagent 交付结果（主题/情绪/风格/时长/结构
        schema 对齐 + LLM 效果评判 + 规则检测）→ 不达标重派（上限 3 次）→ 达标 → 交付
 → 交付页：可下载 Suno 源格式音频（原始文件不转码）+ 创作记录 + 对齐评判报告
```

**验收标准（M3）**：完整走完上述链路；交付音频为 Suno 源格式（可下载可播放）；对齐评判报告可见；同输入可复现（固定规划种子）。

## 3. 关键选型（用户已确认）

| 项 | 选型 |
|---|---|
| Agent 框架 | LangGraph（@langchain/langgraph JS）——Leader 编排图 + Subagent 节点 + 评判条件边重派 |
| Suno 调用 | 自托管 gcui-art/suno-api（REST + cookie 会话 + CLI 轮询；LGPL-3.0 独立服务集成）；开发期 MockAdapter 兜底（**验收/演示走 SunoAdapter 真实链路**） |
| 前端 chat UI | Vercel AI SDK（ai-chatbot 模板/shadcn 基座），按官方方式拉取到本地集成扩展 |
| LLM | **OpenAI 兼容接口 + 设置面板（无 JSON mock）**：Base URL / API Key / Model / 温度，按角色（意图/规划/评判）可分别配置 |

## 4. MVP 范围

**做**：chat 入口（开源 UI 集成）｜LLM 设置面板｜意图分析 + 创作规划（真实 LLM 调用）｜LangGraph Leader 编排（派发/回传/对齐评判/重派上限 3）｜SunoAdapter（配额预检 → custom_generate → /api/get 轮询 → 源格式下载）｜对齐建模+效果评判（schema 对齐 + LLM 评分 + 规则检测，报告展示）｜交付页（音频下载 + 创作记录）｜任务状态机与失败重试。

**不做（M4+）**：Stem 分轨 / MIDI 导出｜Studio DAW 空间｜批量流水线 / 工作流共享｜插件化服务接入｜Electron 桌面｜资产库完整版。

**边界**：CAPTCHA/风控处理为 suno-api 服务既有职责（演示环境预配 cookie，遇风控人工续）；MockAdapter 仅开发调试用，不进验收链路。

## 5. 交付物（M3 完成标准）

1. 仓库可运行：README 10 分钟启动（LLM 面板配置 + suno-api 服务启动 + cookie 配置）
2. 验收脚本 = 完整链路（输入→意图→规划→LangGraph 调度 Suno→回传→Leader 对齐评判→下载源格式音频）——以 TECH-SPEC §11.5 **E2E-1** 为载体（演示前手动执行）
3. 评判报告界面可见（对齐维度/评分/重派记录）
4. 同输入可复现（固定规划种子）
5. **冒烟测试通过（§11.4 SM-1/2/3）+ 全套 E2E（§11.5）**——任何演示/交付前前置检查

## 6. 里程碑（对齐 TECH-SPEC Stage 分层，详见 [TECH-SPEC.md](TECH-SPEC.md) §10）

| 里程碑 | Stage | 交付 | 验收 |
|---|---|---|---|
| M1 | Stage 1（P0） | 骨架 + LLM 设置面板 + 意图/规划（真实 LLM） | 输入→规划 JSON 可见 |
| M2 | Stage 2（P0） | LangGraph 编排 + 对齐评判（Mock 引擎调试） | 图跑通（含重派回环） |
| M3 | Stage 3（P0） | SunoAdapter + 交付页 | **完整验收链路通过（源格式音频）** |
| M4+ | Stage 4-5（P1/P2） | 产品壳稳态 / 路线（Studio/批量/Stem 等） | 按需 |

—— 技术实现详见 [TECH-SPEC.md](TECH-SPEC.md)。
