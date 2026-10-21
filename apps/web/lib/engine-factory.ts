import { MockAdapter, SunoAdapter, type EngineAdapter } from "@colormax/engine";
import { join } from "node:path";
import { sunoEnv } from "./env";

/**
 * 引擎工厂：根据环境配置选择 Mock 或 Suno 引擎
 * 策略：有 SUNO_COOKIES 则用 Suno，否则用 Mock（本地合成可播音频）
 */
export function createEngine(): {
  engine: EngineAdapter;
  mode: "mock" | "suno";
  modeDoc: string;
} {
  const { cookies, fingerprint, userAgent } = sunoEnv();
  const publicDir = join(process.cwd(), "public/generated");

  if (cookies.length === 0) {
    return {
      engine: new MockAdapter(publicDir),
      mode: "mock",
      modeDoc: "Mock 本地合成（未配置 SUNO_COOKIES）",
    };
  }

  return {
    engine: new SunoAdapter({ cookies, publicDir, fingerprint, userAgent }),
    mode: "suno",
    modeDoc: `Suno 真实引擎（${cookies.length} cookies）`,
  };
}
