# ColorMax (SunoWeb Alternative)

> 开源版 SunoWeb alternative：以 Suno 等强模型为生成引擎，在其上自建创作栈——增强"平台给不出来的"可解剖、可复现、可并行的沉浸创作体验。

**定位**：对 SunoWeb 的关系 ≈ OpenCut 之于剪映——我们不是替代 Suno（Suno 的 API、强模型仍是生成引擎），而是在它之上补产品体验与沉浸创作效果。

## 10 分钟启动

```bash
# 1) 依赖（Node ≥ 22.18：type-stripping 运行 TS 源）
pnpm install

# 2) 配置 LLM + Suno 会话（apps/web/.env.local）
#    LLM_PROVIDER/LLM_BASE_URL/LLM_API_FORMAT(openai|anthropic)/LLM_MODEL/LLM_API_KEY/LLM_MAX_TOKENS/LLM_THINKING
#    SUNO_COOKIES=__client=...;ajs_anonymous_id=...   # 多账号 || 分隔（浏览器 DevTools 从 suno.com 导出）
#    也可启动后在网页「LLM 设置」面板配置（写入同一文件，增量合并不覆盖 cookie）

# 3) 构建 + 启动（端口固定 3123——3000 让给本机 OrbStack；或 `pnpm --filter @colormax/web dev` 开发模式）
pnpm --filter @colormax/web build
pnpm --filter @colormax/web start

# 4) 打开 http://localhost:3123 —— 创作室输入一句话
#    过程全程流式可见：LLM 思考折叠块 / 工具 terminal / Suno 生成进度 / 评判报告
#    生成完成 → 「作品看板」直接播放（服务端 DRM 解密 + MP3 转码缓存）
#    未配置 SUNO_COOKIES 时自动用 Mock 引擎（开发调试链路，验收请配真实会话）
```

测试：逐包 `node --test test/*.test.ts`（packages/*、apps/web）；当前全仓 51 用例。
要求：`ffmpeg` 在 `/opt/homebrew/bin/ffmpeg`（Linux 改 `packages/suno-gateway/src` 音频中继路径常量）。
风控（R1-A，见 docs/risk-control-research.md）：可选 `SUNO_FINGERPRINT=hybrid|web`（指纹档）、`SUNO_UA`、`SUNO_CAPTCHA_TTL_MS`（人工验证等待上限，默认 10min）、`SUNO_CAPTCHA_POLL_MS`。生成遇 CAPTCHA 时任务挂起 `pending` + 对话渲染等待卡（打开 suno.com/create 验证），**通过即自动续跑**，无需回复。

## 当前能力（MVP Demo，Stage 1-3 + 4.1 + 6 已交付）

- **多 Agent 编排**（LangGraph）：意图分析 → 创作规划 → 派发 suno-subagent → 统一建模对齐 → LLM 评判+规则检测 → 重派（≤3）→ 交付；全程真实 LLM 无 mock 分支。
- **Suno 真实链路**：vendor suno-api 源码本地二次开发（会话池轮换/fail-fast CAPTCHA/strict-complete 轮询）+ DRM 解密（rights unwrap + AES-CTR）+ MP3 转码同源播放（Range/缓存）。
- **流式可观测对话流**：思考（含推理链双通道）/工具执行/Suno 进度实时回显；断线补帧（Last-Event-ID）。
- **会话持久化**：localStorage（ADR-001 过渡方案，刷新续播三分支恢复；SQL 留待 runtime 迁移）。
- **失败编排**：raw 错误不出对话流——LLM 评审结构化建议（流式）+ 本轮节点清除 + 「继续」意图路由自动接续（跳过已完成节点）。

## 当前 Baseline（项目上下文锚点）

1. **多 Agent 联合编曲**：本地/云端 LLM 作 Leader 做意图分析+创作规划（多模态输入融合），经 Grill 迭代拆分为编曲（MIDI 参数化、声部编排）/作词/歌声合成/混音母带子任务，统一管道合成。
2. **基础应用服务**（对标 Mureka 类服务面）：Next.js 全栈，web/桌面端一套代码复用；能力分预封装（播放/队列/导出/创作管理）与插件化（服务接入、渐进式专业配置插件）两种形态；BFF + 长任务状态机轮询 + 状态持久化。
3. **并行创作与工作流共享**：批量创作流水线（任务队列+并发调度）；节点工作流配置化（配置即创作程序，可保存/分享/重放）。
4. **专业 Studio 第三方集成**：DAW 式沉浸空间；有接口的第三方按官方封装（SDK/HTTP 适配层），无接口的走浏览器自动化+会话池封装为 OpenAI 兼容接口；作品可解剖（Stem 分轨/MIDI 参数化再创作）。

## 里程碑

- **M1**：Next.js 骨架 + 创作对话 + LLM 创作规划（JSON 化）✅
- **M2**：LangGraph 编排 + 引擎适配层（SunoAdapter / MockAdapter）✅
- **M3**：端到端出歌（DRM 解密可播 + 作品看板）✅（真实链路单次终验随生成风控冷却复跑）
- **M4**：流式可观测对话流 + localStorage 持久化 + 失败评审/接续/意图路由 ✅（2026-08-31）
- **M4+**：Suno 风控专项（调研立项见 PRD §7）；创作资产管理、批量流水线、Studio 空间、Stem 分轨（roadmap）

## 文档

- [MVP Demo PRD](docs/PRD-mvp-demo.md)（含 §7 Suno 风控策略）
- [TECH-SPEC](docs/TECH-SPEC.md)（架构/Stage 分层/测试计划/状态对账/§14 风控调研任务书）

## License

MIT（packages/suno-gateway/vendor 为 LGPL-3.0 衍生，见该目录 LICENSE）
