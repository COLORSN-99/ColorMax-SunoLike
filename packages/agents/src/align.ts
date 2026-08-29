import type { AlignedSong, CreationPlan, SongResult } from "@colormax/schema";

/** leader 统一建模对齐：Subagent 交付 → AlignedSong（五维：主题/情绪/风格/时长/结构） */
export function alignSong(plan: CreationPlan, song: SongResult): AlignedSong {
  const durationDelta = Math.abs(song.durationSec - plan.intent.durationSec);
  const duration = durationDelta <= plan.intent.durationSec * 0.15 ? 5 : 2;
  const lyricsOk = Boolean(song.lyrics?.trim());
  const structure = lyricsOk ? 4 : 1;
  // 语义维度（theme/mood/style）由 judge LLM 打分；这里先建模型骨架
  return {
    plan,
    song,
    alignment: { theme: 0, mood: 0, style: 0, duration, structure },
  };
}

/** judge 规则检测（LLM 之外的硬规则） */
export function ruleChecks(plan: CreationPlan, song: SongResult): {
  name: string;
  passed: boolean;
  note?: string;
}[] {
  const durationDelta = Math.abs(song.durationSec - plan.intent.durationSec);
  return [
    {
      name: "时长在约束 ±15% 内",
      passed: durationDelta <= plan.intent.durationSec * 0.15,
      note: `期望 ${plan.intent.durationSec}s，实际 ${song.durationSec}s`,
    },
    { name: "歌词非空", passed: Boolean(song.lyrics?.trim()) },
    { name: "音频存在", passed: Boolean(song.audioUrl) },
  ];
}
