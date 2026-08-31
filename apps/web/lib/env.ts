/** Suno 会话/指纹环境（⑯ 指纹对齐）：cookie 池 + 指纹档 + UA，全部调用点统一从此读取 */
import type { SunoFingerprint } from "@colormax/suno-gateway";

export function sunoEnv() {
  const cookies = (process.env.SUNO_COOKIES ?? "").split("||").map((c) => c.trim()).filter(Boolean);
  const fingerprint: SunoFingerprint = process.env.SUNO_FINGERPRINT === "web" ? "web" : "hybrid";
  const userAgent = process.env.SUNO_UA || undefined;
  return { cookies, fingerprint, userAgent };
}
