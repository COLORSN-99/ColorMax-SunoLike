"use client";

import { useEffect, useRef, useState } from "react";
import { Brain } from "lucide-react";
import type { Segment } from "@/lib/segments";
import { Chevron, Lamp, NODE_LABEL } from "./shared";

export function ThinkingBlock({ seg }: { seg: Extract<Segment, { kind: "thinking" }> }) {
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [open, seg.content, seg.reasoning]);
  const tail = (seg.reasoning || seg.content).slice(-36).replace(/\n/g, " ");
  return (
    <div style={{ margin: "8px 0" }}>
      <div className="cm-head" onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <Brain size={13} style={{ color: "#f3aa2f" }} />
        <span>SIGNAL PATH · {NODE_LABEL[seg.node] ?? seg.node}</span>
        {seg.streaming ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#f3aa2f", fontSize: 11 }}>
            <Lamp kind="signal" /> live{tail ? ` · …${tail}` : ""}
          </span>
        ) : (
          <span className="cm-head__meta">{seg.ms}ms{seg.reasoning ? " · 含推理链" : ""}</span>
        )}
      </div>
      {open && (
        <div ref={scroller} className="cm-body cm-body--scroll">
          {seg.reasoning && (
            <div style={{ marginBottom: seg.content ? 10 : 0, color: "#8a7c6d" }}>
              <div className="cm-agent__tag" style={{ marginBottom: 3 }}>REASONING</div>
              {seg.reasoning}
            </div>
          )}
          {seg.content && (
            <div style={{ color: "#d9c9a6" }}>
              <div className="cm-agent__tag" style={{ marginBottom: 3 }}>OUTPUT</div>
              {seg.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
