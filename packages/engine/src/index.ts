/** 引擎适配层：SunoAdapter（Stage 3 接入）/ MockAdapter（开发期调试，本地合成可播 wav） */
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface RenderRequest {
  title: string;
  lyrics: string[];
  arrangement: { key: string; bpm: number; chordProgression: string[]; groove: string };
  seed: number;
  durationSec: number;
}

export interface RenderResult {
  audioUrl: string;      // 相对可下载 URL（如 /generated/xxx.wav）
  sourceFormat: "wav" | "mp3" | "flac" | "m4a";
  durationSec: number;
  raw: Record<string, unknown>;
}

export interface EngineAdapter {
  render(req: RenderRequest): Promise<RenderResult>;
}

const NOTE_FREQ: Record<string, number> = {
  C: 261.63, "C#": 277.18, D: 293.66, "D#": 311.13, E: 329.63, F: 349.23,
  "F#": 369.99, G: 392.0, "G#": 415.3, A: 440.0, "A#": 466.16, B: 493.88,
};

const CHORD_INTERVALS: Record<string, number[]> = {
  major: [0, 4, 7], minor: [0, 3, 7],
};

/** Mock：按编曲参数合成和弦音序（16bit PCM wav，可听），保存到 public/generated */
export class MockAdapter implements EngineAdapter {
  private publicDir: string;
  constructor(publicDir = join(process.cwd(), "public/generated")) {
    this.publicDir = publicDir;
  }

  async render(req: RenderRequest): Promise<RenderResult> {
    const seed = req.seed ?? 0;
    const bpm = req.arrangement.bpm || 100;
    const beatSec = 60 / bpm;
    const bars = Math.max(4, Math.round(req.durationSec / (beatSec * 4)));
    const chords = req.arrangement.chordProgression.length
      ? req.arrangement.chordProgression
      : ["C", "G", "Am", "F"];

    const strings = chords.map((c) => {
      const root = c.slice(0, c.length - 1);
      const kind = c.endsWith("m") ? "minor" : "major";
      const rootF = NOTE_FREQ[root] ?? NOTE_FREQ.C;
      return CHORD_INTERVALS[kind].map((semi) => rootF * 2 ** (semi / 12)) as number[];
    });

    const sampleRate = 22050;
    const samples: number[] = [];
    const rng = seedRandom(seed);
    for (let bar = 0; bar < bars; bar++) {
      const chord = strings[bar % strings.length];
      for (let beat = 0; beat < 4; beat++) {
        const n = Math.floor(sampleRate * beatSec);
        for (let i = 0; i < n; i++) {
          const t = i / sampleRate;
          const env = Math.min(1, t / 0.01) * Math.exp(-2.2 * t);
          let s = 0;
          const pick = chord[Math.floor(rng() * chord.length)];
          s += Math.sin(2 * Math.PI * pick * t) * 0.5 * env;
          s += Math.sin(2 * Math.PI * (pick / 2) * t) * 0.18 * env;
          samples.push(s * 0.6);
        }
      }
    }
    const wav = encodeWav(samples, sampleRate);
    if (!existsSync(this.publicDir))
      await mkdir(this.publicDir, { recursive: true });
    const name = `mock_${req.title.replace(/[^\w\u4e00-\u9fff-]+/g, "_").slice(0, 40)}_${seed}.wav`;
    const file = join(this.publicDir, name);
    await writeFile(file, wav);
    return {
      audioUrl: `/generated/${name}`,
      sourceFormat: "wav",
      durationSec: Math.round(bars * beatSec * 4),
      raw: { adapter: "mock", bars, bpm, chords },
    };
  }
}

function seedRandom(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function encodeWav(samples: number[], sampleRate: number): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

export { SunoAdapter } from "./suno.ts";
