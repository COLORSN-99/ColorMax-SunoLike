import { NextRequest } from "next/server";
import { createReadStream, existsSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import axios from "axios";
import { sunoApi, detectSystemProxy, decryptClipAudio, type RightsResponse } from "@colormax/suno-gateway";

/**
 * GET /api/songs/:id/audio — DRM 解密 → 初次直出 mp4（原体验不劣化）+ 后台转 MP3 缓存（二次请求 Range 秒开/全端兼容）
 */
const transcoding = new Set<string>();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookies = (process.env.SUNO_COOKIES ?? "").split("||").map((c) => c.trim()).filter(Boolean);
  if (cookies.length === 0) return new Response("SUNO_COOKIES 未配置", { status: 400 });

  const cachePath = join(process.cwd(), "public/generated", `dl-${id}.mp3`);
  try {
    if (existsSync(cachePath)) {
      const total = statSync(cachePath).size;
      const range = req.headers.get("range");
      if (range) {
        const m = range.match(/bytes=(\d+)-(\d*)/);
        if (m) {
          const start = Number(m[1]);
          const end = m[2] ? Number(m[2]) : total - 1;
          return new Response(createReadStream(cachePath, { start, end }) as unknown as BodyInit, {
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
      }
      return new Response(createReadStream(cachePath) as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(total),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }

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
        fetchRights: (cid: string, ct?: string) => api.fetchRights(cid, ct) as Promise<RightsResponse>,
      },
      id,
      new Uint8Array(enc.data as ArrayBuffer),
    );

    // 后台转码缓存（不阻塞首次响应）：同一 id 防并发
    if (!transcoding.has(id)) {
      transcoding.add(id);
      void execFile(
        "/opt/homebrew/bin/ffmpeg",
        ["-i", "pipe:0", "-vn", "-acodec", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"],
        { maxBuffer: 20 * 1024 * 1024, encoding: "buffer" },
        (err, stdout) => {
          transcoding.delete(id);
          if (!err && stdout?.length) writeFileSync(cachePath, Buffer.from(stdout));
        },
      )
        .stdin?.on("error", () => undefined)
        .end(plain);
    }

    // 首次：解密明文 mp4 直出（保持原可播体验；二次请求走缓存 MP3）
    return new Response(new Uint8Array(plain), {
      status: 200,
      headers: {
        "Content-Type": "audio/mp4",
        "Content-Length": String(plain.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 502 });
  }
}
