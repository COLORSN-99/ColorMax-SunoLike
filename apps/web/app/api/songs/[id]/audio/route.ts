import { NextRequest } from "next/server";
import { createReadStream, existsSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import axios from "axios";
import { sunoApi, detectSystemProxy, decryptClipAudio, type RightsResponse } from "@colormax/suno-gateway";
import { sunoEnv } from "@/lib/env";

/**
 * GET /api/songs/:id/audio — DRM 解密 → ffmpeg 转码 MP3 缓存（同源 Range、全端可播）
 * 缓存未命中：请求内同步等待转码（同一 id 并发共享一次 in-flight），
 * 避免旧行为「首响应直出 mp4/Opus」——Chrome 对该容器 0:00 不可播且 UI 不会自动重试。
 * 仅当 ffmpeg 失败/不可用时回退直出解密 mp4（不缓存，保证不比以前更差）。
 */
const transcoding = new Map<string, Promise<{ mp3: Buffer | null; mp4: Buffer }>>();

function transcodeToMp3(input: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const child = execFile(
      "/opt/homebrew/bin/ffmpeg",
      ["-i", "pipe:0", "-vn", "-acodec", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"],
      { maxBuffer: 20 * 1024 * 1024, encoding: "buffer" },
      (err, stdout) => resolve(!err && stdout?.length ? Buffer.from(stdout) : null),
    );
    child.stdin?.on("error", () => undefined).end(input);
  });
}

function serveFile(path: string, total: number, req: NextRequest): Response {
  const range = req.headers.get("range");
  const m = range?.match(/bytes=(\d+)-(\d*)/);
  if (m) {
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : total - 1;
    return new Response(createReadStream(path, { start, end }) as unknown as BodyInit, {
      status: 206,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=86400",
      },
    });
  }
  return new Response(createReadStream(path) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=86400",
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookies = (process.env.SUNO_COOKIES ?? "").split("||").map((c) => c.trim()).filter(Boolean);
  if (cookies.length === 0) return new Response("SUNO_COOKIES 未配置", { status: 400 });

  const cachePath = join(process.cwd(), "public/generated", `dl-${id}.mp3`);
  try {
    if (existsSync(cachePath)) return serveFile(cachePath, statSync(cachePath).size, req);

    let flight = transcoding.get(id);
    if (!flight) {
      flight = (async () => {
        const proxy = detectSystemProxy();
        const transport = axios.create({
          timeout: 60_000,
          ...(proxy ? { proxy: { host: proxy.host, port: proxy.port, protocol: "http" as const } } : {}),
        });
        const api = await sunoApi(cookies[0]!, { transport });
        const detail = (await api.getClip(id)) as Record<string, unknown>;
        const urls: Array<{ url?: string }> = (detail.media_urls as Array<{ url?: string }>) ?? [];
        const source = urls.find((u) => u.url && !u.url.includes("forbidden"))?.url;
        if (!source) throw new Error("no media source");

        const enc = await transport.get(source, { responseType: "arraybuffer" });
        const mp4 = await decryptClipAudio(
          {
            getJwt: () => api.getJwt(),
            fetchRights: (cid: string, ct?: string) => api.fetchRights(cid, ct) as Promise<RightsResponse>,
          },
          id,
          new Uint8Array(enc.data as ArrayBuffer),
        );
        const mp3 = await transcodeToMp3(Buffer.from(mp4));
        if (mp3) writeFileSync(cachePath, mp3);
        return { mp3, mp4: Buffer.from(mp4) };
      })().finally(() => transcoding.delete(id));
      transcoding.set(id, flight);
    }

    const { mp3, mp4 } = await flight;
    if (mp3 && existsSync(cachePath)) return serveFile(cachePath, statSync(cachePath).size, req);
    // 转码失败兜底：直出解密 mp4（保持原体验，不缓存）
    return new Response(new Uint8Array(mp4), {
      status: 200,
      headers: {
        "Content-Type": "audio/mp4",
        "Content-Length": String(mp4.length),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 502 });
  }
}
