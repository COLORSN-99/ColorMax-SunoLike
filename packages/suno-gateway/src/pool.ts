/** 二次开发：Cookie 会话池 —— 多 cookie 轮换 + 失效剔除（对接"cookie 会话池"叙事） */
interface PooledCookie {
  cookie: string;
  failCount: number;
  disabled: boolean;
}

export class CookiePool {
  private list: PooledCookie[];
  private cursor = 0;

  constructor(cookies: string[]) {
    this.list = cookies.map((cookie) => ({ cookie, failCount: 0, disabled: false }));
    if (cookies.length === 0) throw new Error("CookiePool 为空：请配置 SUNO_COOKIES");
  }

  /** round-robin 取下一个可用 cookie */
  next(): string | null {
    for (let i = 0; i < this.list.length; i++) {
      const cur = this.list[this.cursor % this.list.length]!;
      this.cursor++;
      if (!cur.disabled) return cur.cookie;
    }
    return null;
  }

  /** 标记失败；同一 cookie 失败 ≥2 次 → 剔除出池 */
  disable(cookie: string): void {
    const cur = this.list.find((x) => x.cookie === cookie);
    if (cur) {
      cur.failCount++;
      if (cur.failCount >= 2) cur.disabled = true;
    }
  }

  get size(): number {
    return this.list.length;
  }

  get usable(): number {
    return this.list.filter((x) => !x.disabled).length;
  }
}
