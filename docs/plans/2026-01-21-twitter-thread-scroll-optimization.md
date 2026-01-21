# Twitter 长线程抓取优化实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 Twitter 长线程抓取不完整的问题，通过改进滚动逻辑确保能抓取到完整的线程内容（默认最多 30 条推文）。

**Architecture:** 重写 `PageRenderer.handleTwitter()` 方法的滚动逻辑，从基于页面高度判断改为基于推文数量判断，使用"滚动到底部 + 等待 + 检测数量变化"的循环模式。

**Tech Stack:** TypeScript, Playwright, Jest

---

## Context

当前 `PageRenderer.handleTwitter()` 使用以下逻辑：
- 每次滚动 `window.innerHeight`
- 检测 `document.body.scrollHeight` 是否变化
- 高度不变时停止

问题：Twitter 懒加载机制不保证页面高度立即增加，导致提前停止。

新逻辑：
- 直接滚动到底部
- 检测推文数量 (`article[data-testid="tweet"]`)
- 连续 3 次不变时停止

---

## Task 1: 添加配置常量

**Files:**
- Modify: `src/core/config/constants.ts`

**Step 1: 添加 DEFAULT_MAX_TWEETS 常量**

在文件末尾添加：

```typescript
export const DEFAULT_MAX_TWEETS = 30;
```

**Step 2: 验证编译**

```bash
npm run build
```

Expected: 成功编译，无错误

**Step 3: 提交**

```bash
git add src/core/config/constants.ts
git commit -m "feat: add DEFAULT_MAX_TWEETS constant (30)"
```

---

## Task 2: 添加 maxTweets 选项到类型定义

**Files:**
- Modify: `src/core/render/types.ts`

**Step 1: 在 RenderOptions 接口中添加 maxTweets**

找到 `RenderOptions` 接口，在 `maxScrolls` 后添加：

```typescript
export interface RenderOptions {
  // ... 现有字段
  maxScrolls?: number;
  maxTweets?: number;  // 新增
  debug?: boolean;
  // ...
}
```

**Step 2: 验证编译**

```bash
npm run build
```

Expected: 成功编译

**Step 3: 提交**

```bash
git add src/core/render/types.ts
git commit -m "feat: add maxTweets option to RenderOptions"
```

---

## Task 3: 重写 handleTwitter 方法

**Files:**
- Modify: `src/core/render/page.ts`

**Step 1: 在 render 方法中获取 maxTweets 配置**

找到 `render()` 方法中获取 `maxScrolls` 的位置（约第 20 行），在后面添加：

```typescript
const maxScrolls = options.maxScrolls ?? DEFAULT_MAX_SCROLLS;
const maxTweets = options.maxTweets ?? DEFAULT_MAX_TWEETS;  // 新增
```

然后修改 `handleTwitter` 调用，传入 `maxTweets`：

```typescript
await this.handleTwitter(page, maxScrolls, maxTweets);
```

**Step 2: 完全重写 handleTwitter 方法**

替换整个 `handleTwitter` 方法（约第 118-154 行）：

```typescript
private async handleTwitter(page: Page, maxScrolls: number, maxTweets: number): Promise<void> {
  // 初始展开"显示更多"按钮
  await this.expandShowMoreButtons(page);

  let scrollCount = 0;
  let unchangedCount = 0;  // 连续未变化的次数
  let lastTweetCount = 0;

  while (scrollCount < maxScrolls) {
    // 1. 滚动到底部
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    // 2. 等待懒加载
    await page.waitForTimeout(2000);

    // 3. 展开新加载的推文中的"显示更多"按钮
    await this.expandShowMoreButtons(page);

    // 4. 检查推文数量
    const currentTweetCount = await page.locator('article[data-testid="tweet"]').count();
    console.error(`[DEBUG] Scroll ${scrollCount + 1}: tweet count=${currentTweetCount}`);

    // 5. 检查停止条件
    if (currentTweetCount >= maxTweets) {
      console.error(`[DEBUG] Reached maxTweets (${maxTweets}), stopping`);
      break;
    }

    if (currentTweetCount === lastTweetCount) {
      unchangedCount++;
      if (unchangedCount >= 3) {
        console.error(`[DEBUG] No new tweets after 3 scrolls, stopping`);
        break;
      }
    } else {
      unchangedCount = 0;  // 重置计数
    }

    lastTweetCount = currentTweetCount;
    scrollCount++;
  }

  console.error(`[DEBUG] Final: ${scrollCount} scrolls, ${lastTweetCount} tweets`);

  // 滚回顶部
  await page.evaluate(() => window.scrollTo(0, 0));
}
```

**Step 3: 更新 expandShowMoreButtons 的等待时间**

找到 `expandShowMoreButtons` 方法，将等待时间从 3000 改为 2000：

```typescript
if (result > 0) {
  // Wait for expanded content to load
  await page.waitForTimeout(2000);  // 从 3000 改为 2000
}
```

**Step 4: 验证编译**

```bash
npm run build
```

Expected: 成功编译

**Step 5: 提交**

```bash
git add src/core/render/page.ts
git commit -m "refactor: rewrite handleTwitter with tweet-count-based stopping"
```

---

## Task 4: 添加单元测试

**Files:**
- Modify: `src/core/render/__tests__/page.test.ts`

**Step 1: 添加滚动停止条件测试**

在 `describe('handleTwitter' ...)` 中添加新的测试：

```typescript
it('should stop when reaching maxTweets', async () => {
  const page = await context.newPage();

  // Mock page content with 5 tweets initially
  await page.setContent(`
    <html><body>
      <article data-testid="tweet">1</article>
      <article data-testid="tweet">2</article>
      <article data-testid="tweet">3</article>
      <article data-testid="tweet">4</article>
      <article data-testid="tweet">5</article>
    </body></html>
  `);

  const renderer = new PageRenderer(context);

  // Mock expandShowMoreButtons
  (renderer as any).expandShowMoreButtons = jest.fn();

  // Mock scrolling to add 1 tweet each time
  let scrollCallCount = 0;
  await page.evaluate(() => {
    (window as any).scrollTo = () => {
      scrollCallCount++;
      if (scrollCallCount < 5) {
        // Simulate adding a tweet on scroll
        const article = document.createElement('article');
        article.setAttribute('data-testid', 'tweet');
        article.textContent = String(5 + scrollCallCount);
        document.body.appendChild(article);
      }
    };
  });

  // maxTweets=7, 应该在 7 条时停止
  await (renderer as any).handleTwitter(page, 10, 7);

  const tweetCount = await page.locator('article[data-testid="tweet"]').count();
  expect(tweetCount).toBe(7);  // 停止在 maxTweets
});
```

**Step 2: 添加连续不变停止测试**

```typescript
it('should stop after 3 unchanged scrolls', async () => {
  const page = await context.newPage();

  await page.setContent(`
    <html><body>
      <article data-testid="tweet">1</article>
    </body></html>
  `);

  const renderer = new PageRenderer(context);
  (renderer as any).expandShowMoreButtons = jest.fn();

  let scrollCallCount = 0;
  await page.evaluate(() => {
    (window as any).scrollTo = () => {
      scrollCallCount++;
      // Never add new tweets
    };
  });

  // 应该在 3 次不变后停止
  await (renderer as any).handleTwitter(page, 10, 100);

  expect(scrollCallCount).toBe(3);  // 只滚动 3 次
});
```

**Step 3: 运行测试**

```bash
npm test -- page.test.ts
```

Expected: 新测试通过，现有测试不受影响

**Step 4: 修复可能的问题**

如果测试失败，检查 mock 是否正确设置。主要问题可能是 `page.locator` mock 需要正确实现。

**Step 5: 提交**

```bash
git add src/core/render/__tests__/page.test.ts
git commit -m "test: add handleTwitter stopping condition tests"
```

---

## Task 5: 集成测试

**Files:**
- 创建临时测试脚本

**Step 1: 用实际 URL 测试**

运行：

```bash
npm run build
node dist/cli/index.js "https://x.com/bcherny/status/2007179832300581177" --force --verbose
```

Expected:
- DEBUG 日志显示滚动过程
- 最终推文数量接近 30 或达到线程实际数量
- 检查生成文件中的推文条数

**Step 2: 验证生成文件**

```bash
grep -c "^---$" clips/twitter/2026/*/im-boris-and-i-created-claude-code-lots-of-peopl-*/content.md
```

Expected: 数字接近 30（或线程实际推文数）

**Step 3: 测试短线程**

```bash
node dist/cli/index.js "https://x.com/tychozzz/status/2009543833491837207" --force --verbose
```

Expected: 正常抓取，不会因"连续不变"而提前停止

**Step 4: 更新文档**

如果需要，更新 `CLAUDE.md` 中关于 Twitter 处理的说明。

**Step 5: 最终提交**

```bash
git add -A
git commit -m "test: verify Twitter thread scraping with real URLs"
```

---

## Summary

**修改的文件：**
1. `src/core/config/constants.ts` - 添加常量
2. `src/core/render/types.ts` - 添加选项
3. `src/core/render/page.ts` - 重写滚动逻辑
4. `src/core/render/__tests__/page.test.ts` - 添加测试

**关键变化：**
- 从"页面高度判断"改为"推文数量判断"
- 滚动策略：直接滚动到底部
- 停止条件：maxTweets 达到 / maxScrolls 达到 / 连续 3 次不变
- 等待时间：1s → 2s

**测试要点：**
- 长线程抓取 30 条
- 短线程正常停止
- 连续不变检测生效
