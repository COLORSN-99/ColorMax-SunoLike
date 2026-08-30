"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConfigProvider, theme, Layout, Card, Tag, List, Typography } from "antd";

const { Content } = Layout;
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

export default function Songs() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/songs").then((r) => r.json()).then((d) => {
      if (d.error) setError(d.error);
      else setSongs(d.songs);
    });
  }, []);
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorBgBase: "#0d0d0f", colorBgContainer: "#161618", colorBorder: "#2a2a2e", colorText: "#e8e8ea", fontSize: 13 } }}>
      <Content style={{ maxWidth: 860, margin: "0 auto", padding: 28 }}>
        <h1 style={{ fontSize: 20 }}>
          最近生成作品 <Tag>Suno 源链</Tag>{" "}
          <Link href="/">
            <Text style={{ color: "#6a6acd" }}>返回创作室</Text>
          </Link>
        </h1>
        <Text type="secondary">
          源链接由会话在浏览器中播放（Suno 对自动化下载有 policy 封锁——浏览器上下文为放行环境）。
        </Text>
        {error && (
          <Card style={{ marginTop: 12 }}>
            <Text style={{ color: "#ff7875" }}>{error}</Text>
          </Card>
        )}
        <List
          style={{ marginTop: 12 }}
          dataSource={songs}
          renderItem={(s) => (
            <Card size="small" style={{ marginBottom: 10, background: "#141417", borderColor: "#2a2a2e" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {s.imageUrl && (
                  <img src={s.imageUrl} width={56} height={56} style={{ borderRadius: 8, objectFit: "cover" }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Text strong>{s.title}</Text>
                    <Tag color={s.status === "complete" ? "green" : "default"} style={{ fontSize: 10, marginInlineEnd: 0 }}>
                      {s.status}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {s.model}
                    </Text>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="label">时长 {s.durationSec} · {s.model}</span>
                      <a href="https://suno.com/create" target="_blank" rel="noreferrer" style={{ color: "#6a6acd", fontSize: 12 }}>
                        ▶ 在 Suno 面板查收播放（需已登录）
                      </a>
                      <a href={s.audioUrl} target="_blank" rel="noreferrer" style={{ color: "#6a6acd", fontSize: 12 }}>
                        ↗ 源链接
                      </a>
                    </div>
                    <button
                      style={{ marginTop: 8, background: "#1f1f24", color: "#b8b8bd", fontSize: 12 }}
                      onClick={() => {
                        navigator.clipboard?.writeText(s.audioUrl ?? "");
                        alert("已复制源链接");
                      }}
                    >
                      复制源链接
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        />
      </Content>
    </ConfigProvider>
  );
}
