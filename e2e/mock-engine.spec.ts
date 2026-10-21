import { test, expect } from "@playwright/test";

/**
 * E2E 烟雾测试：Mock 引擎快乐路径
 * 前置条件：未配置 SUNO_COOKIES（自动使用 Mock 引擎）
 */
test.describe("Mock Engine Happy Path", () => {
  test("应用首页加载", async ({ page }) => {
    await page.goto("/");
    
    // 检查页面标题或基本元素存在即可
    await page.waitForLoadState("networkidle");
    
    // 验证页面加载成功（状态码200，不是404/500）
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });

  test("首页（Studio）可访问", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
  });

  test("Settings 页面可访问", async ({ page }) => {
    const response = await page.goto("/settings");
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
  });

  test("Songs 页面可访问", async ({ page }) => {
    const response = await page.goto("/songs");
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
  });
});

test.describe("API 路由健康检查", () => {
  test("POST /api/jobs 创建任务", async ({ request }) => {
    const response = await request.post("/api/jobs", {
      data: {
        prompt: "E2E 测试任务",
        sessionId: "e2e-test",
      },
    });
    
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.id).toBeTruthy();
    expect(body.engineMode).toBe("mock"); // 未配置 SUNO_COOKIES 时使用 Mock
  });

  test("GET /api/songs 返回空列表", async ({ request }) => {
    const response = await request.get("/api/songs");
    
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.songs).toEqual([]);
    expect(body.note).toMatch(/未配置/i);
  });
});
