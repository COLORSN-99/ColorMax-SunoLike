"use client";

/**
 * Analog Console · 机台模块入口
 * Agent 事件流的设备化呈现，分发到各专用 block 组件
 */
import type { Segment } from "@/lib/segments";
import { ThinkingBlock } from "./ThinkingBlock";
import { TerminalBlock } from "./TerminalBlock";
import { GeneratorBlock } from "./GeneratorBlock";
import { WaitGate } from "./WaitGate";
import { SessionSheet } from "./SessionSheet";
import { MixReview } from "./MixReview";
import { Pressed } from "./Pressed";
import { StopPlate } from "./StopPlate";

export * from "./ThinkingBlock";
export * from "./TerminalBlock";
export * from "./GeneratorBlock";
export * from "./WaitGate";
export * from "./SessionSheet";
export * from "./MixReview";
export * from "./Pressed";
export * from "./StopPlate";
export * from "./shared";

/**
 * Segment 分发路由器
 * 根据 segment 类型渲染对应的 block 组件
 */
export function SegmentView({ seg, onOpenBoard }: { seg: Segment; onOpenBoard: () => void }) {
  switch (seg.kind) {
    case "text":
      return <div className="cm-msg">{seg.text}</div>;
    case "thinking":
      return seg.content || seg.reasoning ? <ThinkingBlock seg={seg} /> : null;
    case "terminal":
      return <TerminalBlock seg={seg} />;
    case "suno":
      return <GeneratorBlock seg={seg} />;
    case "wait":
      return <WaitGate seg={seg} />;
    case "plan":
      return <SessionSheet plan={seg.plan} />;
    case "judge":
      return <MixReview report={seg.report as Record<string, unknown>} />;
    case "result":
      return <Pressed seg={seg} onOpenArchive={onOpenBoard} />;
    case "error":
      return <StopPlate seg={seg} />;
  }
}
