import { test, expect } from "@playwright/test";

/**
 * E2E 烟雾测试：Mock 引擎快乐路径
 * 前置条件：未配置 SUNO_COOKIES（自动使用 Mock 引擎）
 */
test.describe("Mock Engine Happy Path", () => {
  test("应用首页加载", async ({ page }) => {
    await page.goto("/");
    
    // 检查页面标题
    await expect(page).toHaveTitle(/ColorMax/i);
    
    // 检查核心 UI 元素存在
    await expect(page.locator("text=创作")).toBeVisible();
  });

  test("创建会话", async ({ page }) => {
    await page.goto("/");
    
    // 等待输入框出现
    const promptInput = page.locator('textarea[placeholder*="描述"]').first();
    await expect(promptInput).toBeVisible();
    
    // 输入测试 prompt
    await promptInput.fill("测试创作一首轻快的流行歌曲");
    
    // 点击提交按钮
    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();
    
    // 验证任务已创建（等待事件流或状态更新）
    await expect(page.locator("text=/运行中|已完成|排队中/i")).toBeVisible({ timeout: 10000 });
  });

  test("查看作品列表", async ({ page }) => {
    await page.goto("/songs");
    
    // Mock 引擎未配置 Suno，应显示提示
    await expect(page.locator("text=/未配置|SUNO_COOKIES/i")).toBeVisible({ timeout: 5000 });
  });

  test("设置页面可访问", async ({ page }) => {
    await page.goto("/settings");
    
    // 检查设置表单元素
    await expect(page.locator("text=/LLM|DeepSeek|OpenAI/i")).toBeVisible();
    
    // 检查 API Key 输入框
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
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
