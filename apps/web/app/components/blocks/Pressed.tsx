"use client";

import { Play } from "lucide-react";
import type { Segment } from "@/lib/segments";
import { Lamp } from "./shared";

export function Pressed({ seg, onOpenArchive }: { seg: Extract<Segment, { kind: "result" }>; onOpenArchive: () => void }) {
  return (
    <div className="cm-panel" style={{ margin: "10px 0", padding: 12, borderColor: "#5a4630" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div className="cm-vinyl" style={{ width: 54, flex: "none" }}>
          <div className="cm-vinyl__disc" />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Lamp kind="ok" />
            <span style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 700, color: "#f3aa2f" }}>Pressed</span>
          </div>
          <div style={{ fontFamily: "var(--cm-display)", fontSize: 18, marginTop: 2 }}>《{seg.song.title}》</div>
          <div className="cm-logline dim" style={{ marginTop: 2 }}>{seg.song.durationSec}s · {seg.song.sourceFormat} · 已入库</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="cm-transport" onClick={onOpenArchive}><Play size={13} /> 进档案柜播放</button>
        </div>
      </div>
    </div>
  );
}
