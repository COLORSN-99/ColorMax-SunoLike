/**
 * Server-only config entry. Uses node:fs to parse .env files.
 * Client code must import from `@colormax/config` (CONFIG only), never this path.
 */
export { CONFIG } from "./index.ts";
export { parseEnvFile, loadEnv, loadEnvSafe } from "./env-loader.ts";
