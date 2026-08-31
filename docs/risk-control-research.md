# Suno 风控专项调研报告（R1）

> 2026-08-31 · 对应 PRD §7 / TECH-SPEC §14 任务书。所有网络结论标注来源与核验日期；未能核实处显式标**未证实**。

## 0. 结论先行

1. **官方公开 API 不存在**（截至 2026-08-31）——"等官方"不作为主路径，降级为季度复查。
2. 逆向 web 通道的**社区基座已死**：gcui-art/suno-api（我们的 vendor 上游）2025-12-14 公开求交接无人维护；其官方反验证码方案（2Captcha+Playwright）在 issue 区大量失败报告（#263/#258/#211）。我们 fail-fast 的 vendor 分支短期可自维护，但**稳定性的天花板由 Suno 风控方决定**。
3. 第三方托管转售通道**真实存在且商业化**：sunor.cc（$0.10/首，明示 unofficial）、sunoapi.org（credit 制，登录可见价）；同时**有退出者**（PiAPI 首页公告"不提供 Suno API"，kie.ai/suno 路径 404）——该市场在洗牌，供应商存续性是第一风险。
4. 我们自己的触发画像样本太少（1 次 required:false 日志 + 1 次冷却期失败），**触发条件矩阵必须从"调研"转为"埋点测量"**——现有失败编排+事件历史环正好是现成的测量基建（低成本高价值动作）。
5. 实施期自查修正了一个更根本的缺陷（原判断"Android UA 与 macOS cookie 不一致"只对一半）：DEFAULT_USER_AGENT 本就是 macOS Chrome，真正的洞是——**gateway 生产路径总注入自建 proxy transport，而上游把整族指纹头挂在 `axios.create({headers})` 分支，注入即被架空 → 生产请求实际裸发 axios 默认头（零伪装）**；Android 标记（x-suno-client 等）在注入路径下从未生效。gcui README 另明确"macOS 触发率低于 Linux/Windows"。

## 1. 线一：触发条件画像

**闸门机制（一手代码证据，vendor/SunoApi.ts）**：
- `POST /api/c/check {ctype:'generation'}` → `{required, captcha_version:2}`——服务端逐次问询，**可廉价预检**（我们日志实测到一次 required:false）。
- `POST /api/generate/v2/` payload 带 `token:`（hCaptcha 通过后的 token 或 null）；另有休眠的 `getTurnstile()`（POST clerk `captcha_error:300030`）——**Suno 曾实验/并行 Cloudflare Turnstile**（3003xx 为 Turnstile 错误码族）的迹象。
- `keepAlive()` 周期任务维持会话活跃（vendor 已有）。

**触发维度（社区证据 + 我方观察）**：

| 维度 | 证据 | 置信 |
|---|---|---|
| 频率 | gcui#246："连续生成几首后开始弹 CAPTCHA"（2025-04）；我方：短时间连发触发、冷却后恢复 | 中-高 |
| 环境/平台 | gcui README 官方 tip："macOS 触发显著少于 Linux/Windows（ scraping 圈不流行）" | 中（作者经验谈） |
| 指纹一致性 | gcui#201 同时出现 401+CAPTCHA（会话与请求头失配形态）；**我方 UA 伪造 Android vs 真实 macOS cookie = 不一致**（自查） | 推断，待实测 |
| 额度/账号阶段 | gcui#261 标题"Captcha is not triggered after using more than 200 credits"（反直觉形态，未读正文） | 低（孤证待验） |
| 封号 | gcui#236 仅提问，无权威回答 | **未证实**，按"可发生"对待 |

**hCaptcha token 特性（通用文档，适用性推断）**：`P1_` 前缀、**单次使用、约 120s 过期**（nonecap/captchasonic，2026-08 抓取）→ "一次过验证永久续命"不成立；**token 直供只能做"即贴即交"的交互模式**（用户浏览器过验证→粘贴→秒级提交），不能缓存复用。企业版 rqdata 绑定（若 Suno 用企业 hCaptcha）会击穿多数打码服务——未见 Suno 用企业版的直接证据，未证实。

## 2. 线二：绕过/缓解代价

| 手段 | 代价 | 有效性评估 |
|---|---|---|
| **UA/指纹对齐**（把 vendor 头族改成与导出 cookie 的浏览器一致：macOS Chrome UA/sec-ch-ua，去掉 Android x-suno-client） | 半小时改动，$0 | **首选**。消除已知自伤项；效果需实测 |
| **闸门预检+退避**（generate 前查 c/check；required=true 则排队等待/轮换/提示人工，而非撞墙 500） | 半天改动 | 把"失败"变"可解释等待"；与已交付的失败编排/看板快照天然协同 |
| 浏览器会话预热（人工过验证后短时批量生成） | 每轮人工 ~1 分钟 | 续命时长未知；token 不可复用但**验证过的 session 冷却期**存在（我方实证"换代理节点+间隔后可再跑"） |
| token 直供（浏览器插件/手动粘贴→即贴即交） | 交互设计成本 | 受 120s 单次限制，适合"演示前预热"不适合无人值守 |
| 打码服务（2Captcha/CapSolver/YesCaptcha） | 市场价 $1-3/1000 次（**未逐一核实**；2captcha 菜单已不见 hCaptcha 产品页，疑似收缩） | 社区一手报告在失败（gcui#211"2captcha 也过不去"、#263 解算中被重定向到登录页）；**不推荐投入**：贵、慢（30-120s/次）、且是对抗升级的重灾面 |
| 多账号轮换（已实现 CookiePool） | $10-20/账号/月 | 摊薄频率维度触发；封号风险未证实但真实存在；适合"演示日 N 账号待命" |

**合规**：Suno ToS 禁止未授权自动化访问（条款常识，未逐字核）；RIAA 诉讼背景下 Suno 有强化反爬的动机。**演示/个人项目用途风险可控；对外服务化转售用途 = 高法律/稳定性风险，本报告不背书**。

> **实施记录（2026-08-31，A 组落地）**：⑯ 指纹档 `hybrid|web`（buildSunoHeaders 两档全自洽；`web`=全 macOS Chrome 头族；顺带修复"注入 transport 时上游头族整体失效"的隐藏缺陷——现经拦截器统一注入，读侧四路由收口 `lib/env.ts`）+ ⑰ captchaGate 生成前预检 fail-fast（required=true 直接进失败编排，不再撞 500），G7×3 契约测试。**用户决定：不接中间商（B 组废弃）**。首轮 A/B 探针（scripts/gate-probe.mjs）因系统代理关闭、直连遇 DNS 污染全灭（网络层，非风控信号）——待代理在线复跑后择优定默认档。

## 3. 线三：替代生成通道（逐项核实存在性，2026-08-31）

| 通道 | 存在性 | 形态/价格 | 关键事实 | 评级 |
|---|---|---|---|---|
| 官方公开 API | ❌ 无 | — | musicgpt.com blog（2026 抓取）："no documented Suno API, no public developer portal"；无 waitlist 实证 | 季度复查 |
| **sunor.cc** | ✅ | **$0.10/首**（music 10 credits，1cr=$0.01）、lyrics $0.05、concat $0.05；≥$10 起充、卡/币支付；失败自动退 credit；公开 status 页；跑 **V5.5**；支持 Suno+Udio 双模型 | **自述 "Unofficial — not affiliated with Suno Inc."**（灰色转售）；PiAPI 退场后官方推荐后继 | **托管首选** |
| sunoapi.org | ✅ | credit 包制（价格需登录，未获取）；自称 streaming ~20s、watermark-free | 同为转售商；质量/存续未验证 | 备选比价 |
| ~~Kie.ai~~ | ⚠ 404 | kie.ai/suno 已不可达 | 转售市场洗牌信号 | 剔除 |
| ~~PiAPI~~ | ❌ 退出 | 首页公告"不提供 Suno API 服务，推荐 sunor.cc" | **强信号：转售通道经受过一轮打击** | 剔除 |
| ~~Replicate~~ | ❌ 无商业 Suno | /suno 404；/suno-ai 仅 bark（TTS 老模型） | **修正：此前"Replicate 官方合作 Suno"说法不成立**（至少现状如此；bark 非 Suno 音乐主产品） | 剔除 |
| fal.ai | 未核查 | — | 无 Suno 产品页的检索证据（本次搜索引擎退化，未定论） | 待补 |
| 自家 Mock 引擎 | ✅（已建） | $0 | 链路/编排/演示动线的回归验证，非真实音频终验 | 保留（开发） |

**转售商共性风险**：上游同样是逆向或账号池 → 我们的风控问题只是外包；单点依赖其存续与调价。**若采用，必须做成 EngineAdapter 可切换的第二通道，而非替换**（接口缝已在 Step 3 留好）。

## 4. 建议组合与决策点

**推荐组合 = A（自身修复+测量）先行，B（sunor 备胎）按终验结果决定：**
1. **A1 指纹对齐**（半天）：UA/sec-ch-ua/x-suno-client 与 cookie 导出环境一致化。
2. **A2 闸门预检+退避重试+人工辅助流程**（半天）：required=true 时任务转 queued 等待而非失败；配合看板提示"过验证后自动续跑"。
3. **A3 触发率埋点**（顺手）：把 c/check 结果+生成成败记入结构化日志（本地 JSONL 即可），两周数据替换本报告"频率阈值"的猜测——**验收标准（10 连发 ≥80%）从"赌冷却"变成"有基线"**。
4. **B（条件触发）**：若 A 组合后 10 连发仍 <80%（或你近期就要演示）→ 接 sunor.cc adapter（1-2 天，价格 $0.10/首 ≈ 自持账号 5 倍，月演示量级 = 几美元），作为可切换通道保留 Suno 原生路径。

**需你拍板**：
- ① 先跑 A 组合（$0，本周可完成），B 等终验数据？还是直接 A+B 并行？
- ② sunor.cc 类转售商的合规底线你接受到哪：仅自用终验/演示，还是允许开源用户自行填 key 使用？（影响 README/PRD 的推荐口径与免责写法）
- ③ 多账号池要不要扩（你现有 1 账号）：每加一个 Pro 账号 = $10/月，摊薄频率触发。

## 5. 来源清单
- 本地：vendor/SunoApi.ts（c/check、generate token、getTurnstile、keepAlive）、/tmp/cm_web.log（required:false, captcha_version:2）、我方 8 月冷却期实录
- gcui-art/suno-api README + issues #246/#262/#236/#263/#211/#201/#261（github.com，2026-08-31 抓取）
- sunor.cc 首页定价表 + PiAPI 首页退出公告（2026-08-31）
- musicgpt.com/blog/suno-api（"无官方 API"）；nonecap.com/captchasonic（hCaptcha token 通用特性）
- 工具局限声明：本轮通用搜索引擎池退化（MDN 噪音），部分事实（2captcha hCaptcha 存续、fal.ai、sunoapi.org 价格）未能二次核证，已在文中标注。
