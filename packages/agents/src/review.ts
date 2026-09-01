import { chatCompletion, extractJson, type LlmSettings, type ChatMessage } from "@colormax/llm";
import type { ErrorReviewEvent, AgentStreamEvent } from "@colormax/schema";
import { randomUUID } from "node:crypto";

type Emitter = (evt: AgentStreamEvent) => void;

const CATEGORIES = ["llm", "network", "cookie", "captcha", "quota", "engine", "schema", "unknown"] as const;
type Category = (typeof CATEGORIES)[number];

/** 正则降级分类（评审 LLM 也失败时用；raw 错误藏调试区） */
export function classifyFallback(raw: string): ErrorReviewEvent {
  const mk = (category: Category, headline: string, steps: string[], resolvableByCli = false, cliSuggestion?: string): ErrorReviewEvent =>
    ({ type: "error_review", callId: "fallback", category, resolvableByCli, cliSuggestion, headline, steps });
  if (/LLM HTTP 402|Insufficient Balance|余额不足|欠费|arrears/i.test(raw))
    return mk("llm", "LLM 服务商余额不足（HTTP 402）", [
      "到服务商控制台充值（DeepSeek：platform.deepseek.com → Balance/余额）",
      "或到「LLM 设置」切换到其他有额度的服务商 / 本地 Ollama",
      "充值或换端点后，直接发送「继续」从失败落点接续，不重跑已完成步骤",
    ]);
  if (/CAPTCHA/i.test(raw))
    return mk("captcha", "Suno 风控验证（CAPTCHA）", [
      "浏览器打开 suno.com/create 人工过一次验证后重试",
      "或更换 SUNO_COOKIES（|| 分隔多账号）后重启服务",
      "短期高频生成会触发风控，建议间隔数分钟",
    ]);
  if (/配额|quota/i.test(raw))
    return mk("quota", "Suno 配额不足", ["检查 credits 余量或更换账号 cookie"]);
  if (/cookie|401|403|429|unauthorized|expired/i.test(raw))
    return mk("cookie", "Suno 会话失效", [
      "重新导出 suno.com 的 Cookie 填入 apps/web/.env.local 的 SUNO_COOKIES",
      "多账号用 || 分隔，失效自动轮换",
    ]);
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|network|ENOTFOUND/i.test(raw))
    return mk("network", "网络/端点不可达", [
      "检查 LLM Base URL 与代理；Suno 侧确认能访问 suno.com",
      "本地端点示例：http://localhost:11434/v1（Ollama）",
    ], true, "curl -sS $LLM_BASE_URL/models");
  if (/LLM|大模型|model|api.?key/i.test(raw))
    return mk("llm", "LLM 调用失败", ["到「LLM 设置」页测试连接；核对 Key/Model/BaseURL/API 格式"]);
  if (/JSON|parse|契约|schema|zod|结构/i.test(raw))
    return mk("schema", "模型输出不符合契约", ["重试一次（规划层有自修复兜底）；持续失败可调低温度或换更强模型"]);
  return mk("unknown", "任务执行失败", ["稍后重试；展开「调试详情」查看原始错误"]);
}

/**
 * 失败评审（Stage 6.2【4】）：raw error 不直达用户——先经 LLM 评审
 * 「能否用命令行/自助操作解决」，输出结构化 {category,resolvableByCli,headline,steps,cliSuggestion?}，
 * 流式正文经 error_review_delta 透传。评审 LLM 自身失败 → 正则降级。
 */
export async function reviewFailure(
  settings: LlmSettings,
  fail: { phase?: string; error: string; recentTools?: string[] },
  emit?: Emitter,
): Promise<ErrorReviewEvent> {
  const callId = randomUUID();
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是任务失败诊断器。给定出错阶段与错误信息，判断根因并给用户可操作建议。" +
        "输出 JSON：{\"category\":\"llm|network|cookie|captcha|quota|engine|schema|unknown\"," +
        "\"resolvableByCli\":boolean,\"cliSuggestion\":string(仅 resolvableByCli=true 时给一条命令否则省略)," +
        "\"headline\":string(≤20字中文标题),\"steps\":string[](1-4 条中文可操作建议)}。" +
        "resolvableByCli=该问题能否通过命令行或明确自助操作直接解决。仅输出 JSON。",
    },
    {
      role: "user",
      content: `出错阶段：${fail.phase ?? "unknown"}\n工具/调用上下文：${(fail.recentTools ?? []).slice(-6).join(" | ") || "无"}\n错误信息：${fail.error.slice(0, 800)}`,
    },
  ];
  let buf = "";
  let last = 0;
  const onChunk = (t: string) => {
    buf += t;
    if (Date.now() - last >= 80 || buf.length >= 160) {
      emit?.({ type: "error_review_delta", callId, delta: buf });
      buf = "";
      last = Date.now();
    }
  };
  try {
    const res = await chatCompletion(settings, messages, { stream: true, onChunk, maxTokens: 400 });
    if (buf) emit?.({ type: "error_review_delta", callId, delta: buf });
    const j = extractJson<Record<string, unknown>>(res.text);
    const cat = CATEGORIES.includes(j.category as Category) ? (j.category as Category) : "unknown";
    return {
      type: "error_review",
      callId,
      category: cat,
      resolvableByCli: Boolean(j.resolvableByCli),
      cliSuggestion: typeof j.cliSuggestion === "string" ? j.cliSuggestion.slice(0, 300) : undefined,
      headline: String(j.headline ?? "任务执行失败").slice(0, 40),
      steps: Array.isArray(j.steps) ? j.steps.map((s) => String(s)).filter(Boolean).slice(0, 4) : [],
    };
  } catch (e) {
    const fb = classifyFallback(fail.error);
    emit?.({
      type: "tool_call", callId, node: "error-review", tool: "reviewLLM", op: "end", level: "warn",
      message: `评审 LLM 失败，正则降级：${e instanceof Error ? e.message.slice(0, 120) : ""}`,
    });
    return { ...fb, callId };
  }
}

/**
 * 失败后下一句意图路由（Stage 6.2）：三分类决定接续/重开/取消。
 * 仅在存在失败快照时调用。失败默认 resume（用户「继续」语义优先）。
 */
export async function routeAfterFailure(
  settings: LlmSettings,
  fail: { phase: string; error: string },
  message: string,
): Promise<"resume" | "restart" | "new"> {
  try {
    const res = await chatCompletion(settings, [
      {
        role: "system",
        content:
          "上一轮创作任务在" + fail.phase + "阶段失败（" + fail.error.slice(0, 120) + "）。" +
          "判断用户新消息意图，仅输出一个词：resume（接着把这首歌做完/重试/继续）｜" +
          "restart（重开但仍是同一首歌的意图，如换个版本重来）｜new（明显是另一首歌或无关新请求）。",
      },
      { role: "user", content: message },
    ], { temperature: 0, maxTokens: 8 });
    const t = res.text.toLowerCase();
    if (/new/.test(t)) return "new";
    if (/restart|重开|重来/.test(t)) return "restart";
    return "resume";
  } catch {
    // 路由不可用（如 LLM 就是故障源）→ 保守：不自动接续，交给用户重开
    return "new";
  }
}
