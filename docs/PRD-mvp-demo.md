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

**M4 体验增量（2026-08-31 用户提报，已实现）**：链路全程在对话窗口**流式可见**——①LLM 推理文字（含 R1 推理链）以可折叠定高滚动块实时呈现；②非 LLM 的工具执行（配额/生成/下载/解密/规则检测等）以可展开 terminal 小块呈现（高度随输出）；③Suno Sub-Agent 生成进度（轮询就绪数/耗时）实时回显；④任何运行失败：**清除本轮 workflow 节点、raw 错误不进对话流**，经 LLM 评审（能否 CLI/自助解决）后结构化流式返回建议；修复后用户直接发「继续」，意图路由自动判定 resume/restart/new 并从失败落点接续（不重跑已完成步骤）。会话与作品看板 localStorage 持久化，刷新不丢、进行中任务自动续播。对应 TECH-SPEC Stage 4.1 + Stage 6。

## 3. 关键选型（用户已确认）

| 项 | 选型 |
|---|---|
| Agent 框架 | LangGraph（@langchain/langgraph JS）——Leader 编排图 + Subagent 节点 + 评判条件边重派 |
| Suno 调用 | **vendor gcui-art/suno-api 源码 + 本地二次开发**（packages/suno-gateway：cookie 会话池轮换/失效剔除、fail-fast CAPTCHA、transport 可注入、轮询上限可配；LGPL-3.0 保留许可+修改声明）；开发期 MockAdapter 兜底（**验收/演示走 SunoAdapter 真实链路**） |
| 前端 chat UI | **antd v6 + @ant-design/x（Codex 暗色壳）+ 手写 SSE 流式 segment 渲染**（2026-08-31 定版，替换早期 Vercel AI SDK 草案——与实际事件流语义不匹配未采用） |
| LLM | **OpenAI/Anthropic 兼容双格式 + 设置面板（无 JSON mock）**：供应商/BaseURL/API Key/Model/API 格式/maxTokens/温度，按角色（意图/规划/评判）可分别配置；全链路流式（正文+推理链双通道，端点不支持自动降级） |
| 会话持久化 | **localStorage 过渡（ADR-001）**：不上 DB——待更换 Agent runtime/工作流编排时整体迁 SQL（详见 TECH-SPEC §7） |

## 4. MVP 范围

**做**：chat 入口（开源 UI 集成）｜LLM 设置面板｜意图分析 + 创作规划（真实 LLM 调用）｜LangGraph Leader 编排（派发/回传/对齐评判/重派上限 3）｜SunoAdapter（配额预检 → custom_generate → /api/get 轮询 → 源格式下载）｜对齐建模+效果评判（schema 对齐 + LLM 评分 + 规则检测，报告展示）｜交付页（音频下载 + 创作记录）｜任务状态机与失败重试。

**不做（M4+）**：Stem 分轨 / MIDI 导出｜Studio DAW 空间｜批量流水线 / 工作流共享｜插件化服务接入｜Electron 桌面｜资产库完整版。

**边界**：CAPTCHA/风控当前为偶发阻塞项，**深度调研（触发条件/绕过代价/替代生成通道）单列 §7 + TECH-SPEC §14 任务书**（后续沟通立项）；短期靠浏览器预热+冷却+CookiePool 轮换。MockAdapter 仅开发调试用，不进验收链路。

## 5. 交付物（M3 完成标准）

1. 仓库可运行：README 10 分钟启动（LLM 面板配置 + cookie 配置；vendor gateway 进程内集成，无独立服务）
2. 验收脚本 = 完整链路（输入→意图→规划→LangGraph 调度 Suno（本地 vendor gateway，`SUNO_COOKIES`）→回传→Leader 对齐评判→下载源格式音频）——以 TECH-SPEC §11.5 **E2E-1** 为载体（演示前手动执行）
3. 评判报告界面可见（对齐维度/评分/重派记录）
4. 同输入可复现（固定规划种子）
5. **冒烟测试通过（§11.4 SM-1~SM-5，其中 SM-4 刷新续播/SM-5 失败→接续已绿）+ 全套 E2E（§11.5）**——任何演示/交付前前置检查

## 6. 里程碑（对齐 TECH-SPEC Stage 分层，详见 [TECH-SPEC.md](TECH-SPEC.md) §10）

| 里程碑 | Stage | 交付 | 验收 |
|---|---|---|---|
| M1 | Stage 1（P0） | 骨架 + LLM 设置面板 + 意图/规划（真实 LLM） | 输入→规划 JSON 可见 |
| M2 | Stage 2（P0） | LangGraph 编排 + 对齐评判（Mock 引擎调试） | 图跑通（含重派回环） |
| M3 | Stage 3（P0） | SunoAdapter + 交付页 | **完整验收链路通过（源格式音频）** |
| M4 | Stage 4.1 + 6（P0） | 流式可观测对话流 + localStorage 持久化 + 失败评审/接续/意图路由（2026-08-31 交付） | S4/S6 用例 + SM-1/4/5 绿 |
| M4+ | Stage 4-5（P1/P2） | 产品壳稳态 / 路线（Studio/批量/Stem 等） | 按需 |

—— 技术实现详见 [TECH-SPEC.md](TECH-SPEC.md)。

## 7. Suno 风控策略（R1 调研需求——后续单独沟通立项）

MVP 期间实测：读侧（列表/详情/解密/播放）可经浏览器 session 预热稳定工作；**写侧（custom_generate）存在 hCaptcha/风控概率性拦截**，与代理节点、账号新鲜度、生成频率相关，是当前唯一未闭环的验收阻塞项（创作室单次真实出歌终验待冷却复跑）。需要一次**深度技术调研**给出可运维结论，三条线（触发条件画像 / 绕过代价评估（session 预热续命时长、token 直供、打码服务、多账号轮换）/ 替代生成通道（官方 API、第三方聚合镜像横评）），交付调研报告 + 决策点清单后再立实现 Stage。**目标验收**：连续 10 次真实生成无人工介入成功率 ≥80%，或给出明确「不可行+替代通道」结论。任务书详见 TECH-SPEC §14。**（2026-08-31：调研已完成 → [risk-control-research.md](risk-control-research.md)：无官方 API；vendor 上游弃维护；托管转售存活代表 sunor.cc $0.10/首（unofficial）；建议先做指纹对齐+闸门预检+触发率埋点，再决定托管备胎接入）**
