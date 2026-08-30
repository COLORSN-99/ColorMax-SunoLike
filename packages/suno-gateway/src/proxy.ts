import { execSync } from "node:child_process";

/** 探测系统代理（macOS scutil；env 优先级更高）——浏览器可达但 curl/axios 不读系统代理的缺口 */
export interface ProxyConfig {
  host: string;
  port: number;
}

export function detectSystemProxy(): ProxyConfig | undefined {
  for (const [envKey, defaultPort] of [
    ["HTTPS_PROXY", 7890],
    ["https_proxy", 7890],
    ["HTTP_PROXY", 7890],
    ["http_proxy", 7890],
  ] as const) {
    const raw = process.env[envKey];
    if (raw) {
      const m = raw.match(/https?:\/\/([^:]+):(\d+)/);
      if (m) return { host: m[1]!, port: Number(m[2]) };
    }
  }
  try {
    const out = execSync("scutil --proxy", { encoding: "utf-8" });
    const get = (key: string) => out.match(new RegExp(`${key} : ([0-9.]+)`))?.[1];
    const host = get("HTTPProxy") ?? get("HTTPSProxy");
    const port = Number(get("HTTPPort") ?? get("HTTPSPort") ?? "0");
    if (host && port > 0 && host !== "0.0.0.0") return { host, port };
  } catch {
    /* 非 macOS/命令不存在 → 无系统代理 */
  }
  return undefined;
}
