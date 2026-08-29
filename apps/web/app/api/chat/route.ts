import { NextRequest } from "next/server";
import {
  readSettings,
  chatCompletion,
  extractJson,
  stableInt,
} from "@colormax/llm";
import { IntentSchema, CreationPlanSchema } from "@colormax/schema";

/**
 * POST /api/chat — 流式（SSE）：
 * event: intent → 意图 JSON；event: plan → 创作计划 JSON；event: error / done
 * 全链路真实 LLM 调用（OpenAI 兼容端点），zod 校验后输出；解析失败重试 2 次。
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { prompt?: string };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return new Response("prompt required", { status: 400 });

  const settings = readSettings();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      try {
        // ① 意图分析
        const intentRaw = await extractJson<Record<string, unknown>>(
          (
            await chatCompletion(settings, [
              {
                role: "system",
                content:
                  "你是音乐创作意图分析器。根据用户输入输出 JSON：" +
                  '{"theme":string,"mood":string,"style":string,"durationSec":number(30-600),' +
                  '"extra":string[]}。仅输出 JSON。',
              },
              { role: "user", content: prompt },
            ])
          ).text,
        );
        const intent = IntentSchema.parse({
          ...intentRaw,
          originPrompt: prompt,
          durationSec: Number(intentRaw.durationSec ?? 180),
        });
        send("intent", intent);

        // ② 创作规划（含歌词结构 + 编曲参数 + 固定种子）
        const seed = stableInt(prompt, 1_000_000);
        const planRaw = await extractJson<Record<string, unknown>>(
          (
            await chatCompletion(settings, [
              {
                role: "system",
                content:
                  "你是音乐创作编导。基于意图输出创作计划 JSON：" +
                  '{"title":string,"structure":[{"name":"verse|preChorus|chorus|bridge|outro","lyrics":string}]' +
                  ',"arrangement":{"key":string,"bpm":number(40-240),"chordProgression":string[],"groove":string}}。' +
                  `意图：${JSON.stringify(intent)}。仅输出 JSON。`,
              },
              { role: "user", content: prompt },
            ])
          ).text,
        );
        const plan = CreationPlanSchema.parse({ ...planRaw, intent, seed });
        send("plan", plan);
        send("done", { ok: true, seed });
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
