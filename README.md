# ColorMax (SunoWeb Alternative)

> 开源版 SunoWeb alternative：以 Suno 等强模型为生成引擎，在其上自建创作栈——增强"平台给不出来的"可解剖、可复现、可并行的沉浸创作体验。

**定位**：对 SunoWeb 的关系 ≈ OpenCut 之于剪映——我们不是替代 Suno（Suno 的 API、强模型仍是生成引擎），而是在它之上补产品体验与沉浸创作效果。

## 当前 Baseline（项目上下文锚点）

1. **多 Agent 联合编曲**：本地/云端 LLM 作 Leader 做意图分析+创作规划（多模态输入融合），经 Grill 迭代拆分为编曲（MIDI 参数化、声部编排）/作词/歌声合成/混音母带子任务，统一管道合成。
2. **基础应用服务**（对标 Mureka 类服务面）：Next.js 全栈，web/桌面端一套代码复用；能力分预封装（播放/队列/导出/创作管理）与插件化（服务接入、渐进式专业配置插件）两种形态；BFF + 长任务状态机轮询 + 状态持久化。
3. **并行创作与工作流共享**：批量创作流水线（任务队列+并发调度）；节点工作流配置化（配置即创作程序，可保存/分享/重放）。
4. **专业 Studio 第三方集成**：DAW 式沉浸空间；有接口的第三方按官方封装（SDK/HTTP 适配层），无接口的走浏览器自动化+会话池封装为 OpenAI 兼容接口；作品可解剖（Stem 分轨/MIDI 参数化再创作）。

## 里程碑

- **M0**：仓库初始化 + MVP Demo PRD ← 当前
- **M1**：Next.js 骨架 + 创作对话 + LLM 创作规划（JSON 化）
- **M2**：编曲参数化 + 引擎适配层（SunoAdapter / MockAdapter 可切换）
- **M3**：端到端出歌（可播放音频 + 创作记录）→ MVP Demo 验收
- **M4+**：创作资产管理、批量流水线、Studio 空间、Stem 分轨（roadmap）

## 文档

- [MVP Demo PRD](docs/PRD-mvp-demo.md)

## License

MIT
