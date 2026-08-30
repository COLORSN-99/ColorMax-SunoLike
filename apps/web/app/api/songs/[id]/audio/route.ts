import { NextRequest } from "next/server";
import axios from "axios";
import { sunoApi, detectSystemProxy, decryptClipAudio, type RightsResponse } from "@colormax/suno-gateway";

/** GET /api/songs/:id/audio — DRM 解密播放（rights unwrap + AES-CTR）→ 同源 audio/mp4 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookies = (process.env.SUNO_COOKIES ?? "").split("||").map((c) => c.trim()).filter(Boolean);
  if (cookies.length === 0) return new Response("SUNO_COOKIES 未配置", { status: 400 });
  try {
    const proxy = detectSystemProxy();
    const transport = axios.create({
      timeout: 60_000,
      ...(proxy ? { proxy: { host: proxy.host, port: proxy.port, protocol: "http" as const } } : {}),
    });
    const api = await sunoApi(cookies[0]!, { transport });
    const detail = (await api.getClip(id)) as Record<string, unknown>;
    const urls: Array<{ url?: string }> = (detail.media_urls as Array<{ url?: string }>) ?? [];
    const source = urls.find((u) => u.url && !u.url.includes("forbidden"))?.url;
    if (!source) return new Response("no media source", { status: 404 });

    const enc = await transport.get(source, { responseType: "arraybuffer" });
    const plain = await decryptClipAudio(
      {
        getJwt: () => api.getJwt(),
        fetchRights: (contentId: string, contentType?: string) => api.fetchRights(contentId, contentType) as Promise<RightsResponse>,
      },
      id,
      new Uint8Array(enc.data as ArrayBuffer),
    );
    return new Response(new Uint8Array(plain), {
      headers: { "Content-Type": "audio/mp4", "Cache-Control": "private, max-age=3600" },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 502 });
  }
}
