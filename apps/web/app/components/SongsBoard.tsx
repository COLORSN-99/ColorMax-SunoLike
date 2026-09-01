"use client";

/** ARCHIVE · 档案柜 —— 黑胶封套网格；服务端 DRM 解密 + MP3 转码中继（行为不变） */
import { useEffect, useRef, useState } from "react";
import { Row, Col, Alert } from "antd";
import { saveBoard, loadBoard, type KV } from "@/lib/storage";

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

const getKV = (): KV | null =>
  typeof window !== "undefined" && window.localStorage
    ? { getItem: (k) => window.localStorage.getItem(k), setItem: (k, v) => window.localStorage.setItem(k, v), removeItem: (k) => window.localStorage.removeItem(k) }
    : null;

export default function SongsBoard() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errId, setErrId] = useState<string | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<Record<string, HTMLAudioElement | null>>({});

  useEffect(() => {
    const kv = getKV();
    const snap = kv ? loadBoard<Song>(kv) : null;
    if (snap) { setSongs(snap.songs); setSnapshotAt(snap.at); }
    fetch("/api/songs").then((r) => r.json()).then((d) => {
      if (d.error) setError(d.error);
      else {
        setSongs(d.songs);
        setSnapshotAt(null);
        setError(null);
        if (kv) saveBoard(kv, d.songs);
      }
    }).catch((e) => setError(String(e)));
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 4 }}>
        <span className="cm-brand" style={{ fontSize: 26 }}>Archive</span>
        <span style={{ fontSize: 11, letterSpacing: ".22em", textTransform: "uppercase", color: "#7c7068" }}>档案柜 · {songs.length} 张</span>
      </div>
      {snapshotAt && (
        <Alert type="info" showIcon style={{ margin: "8px 0" }}
          message={<span style={{ fontSize: 12 }}>离线快照 · {new Date(snapshotAt).toLocaleTimeString()}（拉取未就绪时先亮出柜内存量）</span>} />
      )}
      {error && (
        <Alert type="warning" showIcon style={{ margin: "8px 0" }}
          message={<span style={{ fontSize: 12 }}>档案索引暂不可达：{String(error).slice(0, 80)}</span>} />
      )}
      <Row gutter={[18, 18]} style={{ marginTop: 12 }}>
        {songs.map((s) => (
          <Col key={s.id} xs={24} sm={12} md={8} lg={6}>
            <div className="cm-panel" style={{ padding: 12 }}>
              <div className={`cm-vinyl ${playing === s.id ? "cm-vinyl--spin cm-vinyl--playing" : ""}`}>
                <div className="cm-vinyl__disc" style={s.imageUrl ? {
                  background: `radial-gradient(circle at 50% 50%, #c98a3a 0 11%, transparent 11.5%), radial-gradient(circle at 50% 50%, var(--cm-ink) 11%, transparent 11.6%), url(${s.imageUrl}) center/cover, repeating-radial-gradient(circle at 50% 50%, #221c18 0 2px, #17120f 2px 4px)`,
                } : undefined} />
                <div className="cm-arm" />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.status === "complete" ? "#48d8bd" : "#45382e", flex: "none" }} />
                <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || "未命名"}</span>
              </div>
              <div style={{ fontSize: 11, color: "#7c7068", marginTop: 2, fontFamily: "var(--cm-mono)" }}>
                {s.durationSec}s · {s.model}
              </div>
              <audio
                controls ref={(el) => { audioRef.current[s.id] = el; }}
                src={`/api/songs/${s.id}/audio`}
                onPlay={() => setPlaying(s.id)}
                onPause={() => setPlaying((p) => (p === s.id ? null : p))}
                onError={() => setErrId(s.id)}
                style={{ width: "100%", height: 32, marginTop: 8, filter: "sepia(.35) hue-rotate(-12deg) saturate(.8) brightness(.95)" }}
              />
              {errId === s.id && (
                <div style={{ fontSize: 11, color: "#f3aa2f", marginTop: 6 }}>
                  首次压制需要解密转码（约 10s），稍后重试；若持续失败检查 SUNO_COOKIES 会话。
                </div>
              )}
            </div>
          </Col>
        ))}
      </Row>
      {songs.length === 0 && !error && !snapshotAt && (
        <div style={{ padding: "48px 0", textAlign: "center", color: "#7c7068", fontSize: 13 }}>
          档案柜是空的 —— 回控制台压第一张片，或把 Suno 作品带进会话库。
        </div>
      )}
    </div>
  );
}
