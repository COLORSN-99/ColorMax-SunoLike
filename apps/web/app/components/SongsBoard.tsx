"use client";

import { useEffect, useState } from "react";
import { ConfigProvider, theme, Card, Tag, Typography, Alert, Row, Col } from "antd";
import Link from "next/link";

const { Text } = Typography;

interface Song {
  id: string;
  title: string;
  status: string;
  durationSec: string;
  audioUrl: string;
  imageUrl?: string;
  createdAt: string;
  model: string;
}

/** 作品看板：全部已创作歌曲（DRM 解密 → 转码 MP3 同源播放） */
export default function SongsBoard() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errId, setErrId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/songs").then((r) => r.json()).then((d) => {
      if (d.error) setError(d.error);
      else setSongs(d.songs);
    });
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
        <Text strong style={{ fontSize: 14 }}>作品看板</Text>
        <Tag>{songs.length} 首</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          已创作歌曲 · 服务端 DRM 解密 + MP3 转码中继（首次约 10s，此后缓存秒开）
        </Text>
      </div>
      {error && (
        <Card style={{ marginBottom: 10 }}>
          <Text style={{ color: "#ff7875" }}>{error}</Text>
        </Card>
      )}
      <Row gutter={[12, 12]}>
        {songs.map((s) => (
          <Col key={s.id} xs={24} sm={12} md={8} lg={6}>
            <Card
              size="small"
              style={{
                background: "#141417",
                borderColor: "#2a2a2e",
                height: "100%",
              }}
              cover={
                s.imageUrl ? (
                  <img
                    src={s.imageUrl}
                    alt={s.title || "cover"}
                    style={{ height: 120, objectFit: "cover", borderTopLeftRadius: 6, borderTopRightRadius: 6 }}
                  />
                ) : (
                  <div style={{ height: 120, background: "#1d1d22", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
                    🎵
                  </div>
                )
              }
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Text strong style={{ fontSize: 13 }}>{s.title || "未命名"}</Text>
                <Tag color={s.status === "complete" ? "green" : "default"} style={{ fontSize: 10, marginInlineEnd: 0 }}>
                  {s.status}
                </Tag>
              </div>
              <div style={{ fontSize: 11, color: "#9a9aa0", margin: "2px 0 8px" }}>
                {s.model} · {s.durationSec}s
              </div>
              <audio
                controls
                src={`/api/songs/${s.id}/audio`}
                style={{ width: "100%", height: 30 }}
                onError={() => setErrId(s.id)}
              />
              {errId === s.id && (
                <Alert
                  style={{ marginTop: 6 }}
                  type="warning"
                  showIcon
                  message="音频加载失败"
                  description={<span style={{ fontSize: 11 }}>首次加载需解密转码（约 10s），稍后刷新重试；仍失败请检查 SUNO_COOKIES 会话。</span>}
                />
              )}
              <div style={{ marginTop: 6 }}>
                <a href={s.audioUrl} target="_blank" rel="noreferrer" style={{ color: "#6a6acd", fontSize: 11 }}>
                  ↗ 原始源链接
                </a>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      {songs.length === 0 && !error && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          暂无歌曲——去「创作室」输入一句话开始创作，或将你的 Suno 作品加入会话库。
        </Text>
      )}
    </div>
  );
}
