# 第三方音乐模型接入调研报告（引擎池 Top-K）

> 2026-09-01 · 设计点：ColorMax 从「Suno 单引擎（逆向通道）」扩展为**多音乐模型引擎池**。
> 全部结论基于本日直接抓取官方文档/仓库取证（无法核实条目的显式标注），搜索基建退化期间未采信任何二手榜单。

## 0. 结论先行

候选池 11 个，按 ColorMax 场景（**人声全曲 + 自定义歌词 + 接入方式明确公开**）筛后 **Top-K = 5**：

| # | 模型 | 渠道类型 | 一句话定位 | 建议 |
|---|---|---|---|---|
| 1 | **Mureka**（昆仑万维） | 官方 API | 与 Suno 同形态的「歌词→人声全曲」，自称行业唯一官方 API；V7.5/O1，支持**生成中流式播放**、歌词生成、续写、风格微调 | **首选接入**：产品定位对标对象 + Suno 的官方平替，直接缓解 R1 风控依赖 |
| 2 | **Eleven Music**（ElevenLabs） | 官方 API | studio 级人声/器乐全曲，多语言、段落级编辑、30s Audio Reference、Finetunes；**与唱片公司合作训练，商用授权最干净** | **合规位接入**：对外演示/商用素材的免责通道 |
| 3 | **ACE-Step**（v1.5） | 开源权重 | 扩散+线性 transformer，**A100 上 20 秒出 4 分钟整曲**；人声对齐、lyric2vocal、声音克隆、remix；中文说唱 LoRA 现成；HF+ModelScope 双分发 | **自托管主力**：零边际成本 + 与开源项目定位自洽 |
| 4 | **YuE（乐）**（M-A-P） | 开源权重 | lyrics2song 长曲天花板（数分钟人声+伴奏），zh/en/jp-kr 变体、LoRA、增量生成；LLM 架构**推理慢**（分钟级/首） | **质量备选**：接受排队时长时用 |
| 5 | MusicGen（Meta） | 开源 + Replicate 托管（已验证，3.5M runs） | 纯器乐，短时长，研究级 | 仅 BGM/音效素材位，**非主引擎**，可缓一步 |

被排除出 Top-K 的及原因见 §3。

## 1. 筛选准则（为什么不是全都收）

1. **必须能做人声全曲**（ColorMax 主链路=规划产歌词→出带演唱成品）：器乐模型只能占辅位。
2. **接入方式公开可查**：官方 API 文档、或有官方权重的明确自托管路径。逆向转售通道（PiAPI 式）不再纳入——R1 调研已拍板不接中间商。
3. **合规留痕**：商用授权条款明确（Eleven 的 label 合作、ACE-Step/YuE 的开源许可可自证）。
4. **与现有架构的边际成本**：能套用 `EngineAdapter.render(req, hooks)` + 事件帧（tool_call/suno_progress）异步任务模型。

## 2. Top-K 详情

### 2.1 Mureka —— 官方 API（首选）
- 接入：REST（Song Generation / Instrumental Generation / Lyrics Generation / Song Extension 四类），新模型迭代 API 同步跟进。
- 亮点：**流式播放**（生成中即可听，对我们"Generator 进度卡"是天然素材）；O1 智能选曲 + AI 音乐编辑；微调服务（200 首一致风格数据集出定制模型）。
- 商业：官方直连技术支援；B2B 定制与内容服务存在（意味着我们这种项目形态是其标准客户）。
- 风险：价格表未公开抓取（需注册看）；「唯一官方 API」是其营销话术（Eleven 同样官方）——不采信排他说法。
- 集成：与 suno-gateway 的 generate→poll 形态几乎同构，adapter 一天级工作量。

### 2.2 Eleven Music —— 官方 API（合规位）
- 接入：REST（Music v2），文档含 API cookbook；paid 计划含 Audio Reference（≤30s 参考曲，入库前过版权筛查）。
- 亮点：**与 labels/publishers/artists 合作训练 + 商用授权声明覆盖影视/播客/社媒/广告/游戏**——全候选池里版权叙事最干净；段落级人声/歌词编辑。
- 风险：人声自然度口碑数据少（发布较新）；定价按订阅+积分，demo 量级可控但未实测。
- 集成：REST 异步任务，adapter 一天级。

### 2.3 ACE-Step —— 开源自托管（主力备胎）
- 权重：HF `ACE-Step/ACE-Step-v1-3.5B` + ModelScope（国内可达性好）；v1.5 已发布；技术报告 arXiv 2506.00045。
- 性能：4 分钟 ≤20s@A100（比 LLM 系基线快 15×）；MERT/hubert 语义对齐 → 歌词对齐与结构连贯兼顾；细粒度控制：人声克隆、改词、remix、lyric2vocal、singing2accompaniment；现成中文说唱 LoRA。
- 成本：本地/云 GPU 推理，边际成本=电费；单机 Mac 可跑（offload 慢）。
- 风险：需要维护一条推理服务线（建议独立 HTTP 服务 + adapter 包装，别塞进 Next 进程）；GPU 资源需要落实（云上 A100 按时租）。
- 集成：先包成 `AceStepAdapter`（HTTP 任务队列），事件帧全复用。

### 2.4 YuE —— 开源自托管（质量备选）
- 权重：m-a-p 系列（en/zh/jp-kr × cot/icl + s2 + upsampler），MIT（自 repo）；demo 页人声质量口碑高。
- 限制：LLM-based → 一首歌分钟级起步，批量流水线吞吐差；无官方托管 API。
- 用法：作为「精修模式」引擎（用户显式选择长等待换质量）。

### 2.5 MusicGen —— 器乐辅位（缓接）
- Replicate 托管已验证（API 页/参数/计费俱在）；权重开源。
- 无歌词人声，时长短——只服务未来 Studio 空间的 BGM/过门素材位。

## 3. 排除池与原因（同样调查过）

| 模型 | 排除原因 |
|---|---|
| **Suno**（官方） | 无官方 API（R1 调研已核实）；现有通道=逆向 vendor，保留但非新增方向 |
| Udio | 无任何官方/合作 API 暴露 |
| Google Lyria（Vertex/Gemini） | 本轮 3 个官方文档 URL 全部 404/重定向循环，**当前接入入口无法核实**——存疑挂起，不编造事实入表；后续单独验证（另：Lyria 系器乐向为主，与人声全曲场景错位） |
| MiniMax Music | 官网确认覆盖音乐模态 + 有开放平台，但**音乐生成 API 文档页本轮未定位到**——待核挂起 |
| Stable Audio（Stability） | platform 文档 audio 页 404、fal 路径 404——疑似已撤下托管/迁移，待核；且器乐定位 |
| Riffusion / SoundGen 等 | 影响力与维护状态不足 |
| SunoAPI.org / sunor.cc 等转售 | R1 已拍板：不接中间商 |

## 4. 接入架构建议（拍板后展开）

```
EngineAdapter.render(req, hooks)            ← 现有接口，零改动
 ├─ SunoGatewayAdapter        （现有：官方形态不可用的逆向通道）
 ├─ MurekaAdapter / ElevenAdapter（新增：REST 异步任务，结构最接近现状，先做）
 ├─ AceStepAdapter / YuEAdapter  （新增：指向自托管推理服务，需 GPU 方案先定）
 └─ MockAdapter               （现有：回归/开发）
路由层：settings 机位增设「音乐引擎」维度（与 LLM 服务商档案同构：每引擎独立 key/额度/探活），
看板/交付卡按引擎标注来源；judge 不受影响（对齐评判消费的是 RenderResult，天然引擎无关）。
```

优先级建议：**Mureka（一天级）→ Eleven（一天级）→ ACE-Step（需先定 GPU/服务化方案）**。前两个落地后，R1 的「10 连发 ≥80%」验收就从单通道赌冷却变成多通道调度问题。

## 5. 取证清单
- platform.mureka.ai/docs（官方 API 平台页，2026-09-01 抓取）
- elevenlabs.io/docs/overview/capabilities/music + music-terms（官方文档）
- github.com/ace-step/ACE-Step + HF/ModelScope 权重页（官方 repo）
- github.com/multimodal-art-projection/YuE + HF m-a-p/*（官方 repo）
- replicate.com/meta/musicgen（托管 API 页）
- 反例核实：ai.google.dev/gemini-api/docs/lyria(-realtime) 404/循环、platform.stability.ai audio 404、fal stable-audio/v2 404、replicate instadeepai/yue 404、MiniMax 官网无音乐 API 直达（均 2026-09-01）
