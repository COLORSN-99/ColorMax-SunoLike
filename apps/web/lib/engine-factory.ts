import { MockAdapter, SunoAdapter, type EngineAdapter } from "@colormax/engine";
import { sunoEnv } from "./env";
import { GENERATED_DIR } from "./paths";

export interface EngineFactoryResult {
  engine: EngineAdapter;
  mode: "mock" | "suno";
  modeDoc: string;
}

/**
 * 引擎工厂：根据环境变量选择引擎实现
 * - SUNO_COOKIES 配置 → SunoAdapter（真实链路）
 * - 未配置 → MockAdapter（开发调试）
 * 
 * 未来扩展：
 * - ENGINE_PROVIDER=mureka → MurekaAdapter
 * - ENGINE_PROVIDER=eleven → ElevenMusicAdapter
 * - ENGINE_PROVIDER=ace-step → ACEStepAdapter
 */
export function createEngine(): EngineFactoryResult {
  const { cookies, fingerprint, userAgent } = sunoEnv();
  
  if (cookies.length === 0) {
    return {
      engine: new MockAdapter(GENERATED_DIR),
      mode: "mock",
      modeDoc: "未配置 SUNO_COOKIES — 开发期 Mock 引擎（WAV 和弦合成）；验收/演示请配置真实会话池",
    };
  }
  
  return {
    engine: new SunoAdapter({
      cookies,
      publicDir: GENERATED_DIR,
      fingerprint,
      userAgent,
    }),
    mode: "suno",
    modeDoc: "Suno 真实链路（DRM 解密 + MP3 转码）",
  };
}
