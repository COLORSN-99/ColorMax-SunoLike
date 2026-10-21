"use client";

import { Disc3 } from "lucide-react";
import type { Segment } from "@/lib/segments";
import { Lamp, Leds } from "./shared";

export function GeneratorBlock({ seg }: { seg: Extract<Segment, { kind: "suno" }> }) {
  const pct = seg.total ? (seg.done / seg.total) * 100 : 8;
  const lamp = seg.status === "complete" ? "ok" : seg.status === "error" ? "err" : "rec";
  return (
    <div className="cm-panel" style={{ margin: "8px 0", padding: "10px 12px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Disc3 size={15} style={{ color: "#f3aa2f" }} />
        <span style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 600 }}>Generator</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8a7c6d" }}>
          <Lamp kind={lamp} /> {seg.status === "complete" ? "READY" : seg.status === "error" ? "ERROR" : "PRINTING"}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--cm-mono)", fontSize: 11, color: "#b9ab9f" }}>
          {seg.done}/{seg.total} · {Math.round(seg.elapsedMs / 1000)}s
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        <Leds pct={pct} hot={seg.status === "error"} />
      </div>
      {seg.note && <div className="cm-logline dim" style={{ marginTop: 6 }}>{seg.note}</div>}
    </div>
  );
}
