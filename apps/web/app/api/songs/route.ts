import { NextResponse } from "next/server";
import axios from "axios";
import { sunoApi, detectSystemProxy } from "@colormax/suno-gateway";
import { sunoEnv } from "@/lib/env";

/** GET /api/songs — 最近生成歌曲（浏览器会话播放/下载；Suno 源链直挂） */
export async function GET() {
  const { cookies, ...fp } = sunoEnv();
  if (cookies.length === 0) return NextResponse.json({ songs: [], note: "未配置 SUNO_COOKIES" });
  try {
    const proxy = detectSystemProxy();
    const transport = axios.create({
      timeout: 20_000,
      ...(proxy ? { proxy: { host: proxy.host, port: proxy.port, protocol: "http" as const } } : {}),
    });
    const api = await sunoApi(cookies[0]!, { transport, ...fp });
    const clips = await api.get(undefined, "1");
    const songs = [];
    for (const c of clips.slice(0, 12)) {
      let audioUrl = c.audio_url;
      try {
        const detail = (await api.getClip(c.id)) as Record<string, unknown>;
        const media = (detail.media_urls as Array<{ url?: string }>) ?? [];
        const real = media.find((u) => u.url && !u.url.includes("forbidden"));
        if (real?.url) audioUrl = real.url;
      } catch {
        /* 详情拉取失败则用 feed 值 */
      }
      songs.push({
        id: c.id,
        title: c.title,
        status: c.status,
        durationSec: c.duration ?? "?",
        audioUrl,
        imageUrl: c.image_url,
        createdAt: c.created_at,
        model: c.model_name,
      });
    }
    return NextResponse.json({ songs });
  } catch (e) {
    return NextResponse.json({ songs: [], error: e instanceof Error ? e.message : String(e) });
  }
}
