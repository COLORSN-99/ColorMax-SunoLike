/* Vendored from gcui-art/suno-api (LGPL-3.0-or-later). MODIFIED for @colormax/suno-gateway: 仅保留 sleep，移除 pino/playwright 依赖。 */
export const sleep = (x: number, y?: number): Promise<void> => {
  let timeout = x * 1000;
  if (y !== undefined && y !== x) {
    const min = Math.min(x, y);
    const max = Math.max(x, y);
    timeout = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
  }
  return new Promise((resolve) => setTimeout(resolve, timeout));
};
