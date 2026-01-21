// src/core/render/page.ts
import type { BrowserContext, Page } from 'playwright';
import type { RenderedPage, RenderOptions } from './types.js';
import { detectPlatform, isValidUrl } from './utils.js';
import { DEFAULT_TIMEOUT, DEFAULT_MAX_SCROLLS, DEFAULT_MAX_TWEETS } from '../config/constants.js';
import { TwitterRawExtractor } from '../extract/adapters/twitter/raw-extractor.js';
import { promises as fs } from 'fs';
import { join } from 'path';

export class PageRenderer {
  constructor(private context: BrowserContext) {}

  async render(url: string, options: RenderOptions = {}): Promise<RenderedPage> {
    // Validate URL first
    if (!isValidUrl(url)) {
      throw new Error(`Invalid URL: ${url}`);
    }

    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const maxScrolls = options.maxScrolls ?? DEFAULT_MAX_SCROLLS;
    const maxTweets = options.maxTweets ?? DEFAULT_MAX_TWEETS;

    const page = await this.context.newPage();

    // Navigate to URL - wait for load since Twitter is a SPA
    await page.goto(url, {
      waitUntil: 'load',
      timeout,
    });

    // Additional wait for dynamic content (Twitter is heavily JS-driven)
    await page.waitForTimeout(3000);

    // Wait for main content with longer timeout
    const contentSelector = options.waitForSelector || 'article, main, [role="main"]';
    await page.waitForSelector(contentSelector, { timeout: 10000 }).catch(() => {
      // Continue even if selector not found
    });

    // Platform-specific handling
    const platform = detectPlatform(new URL(url));

    // For non-Twitter platforms, extract rawData early
    let rawData: string | undefined;
    if (platform === 'zhihu') {
      rawData = await this.extractZhihuRawData(page);
    }

    if (platform === 'twitter') {
      // Additional wait for Twitter to fully load tweet content
      await page.waitForTimeout(5000);

      // Check initial state before expanding
      const beforeExpandCount = await page.locator('article[data-testid="tweet"]').count();
      console.error(`[DEBUG] Before expand: tweet count=${beforeExpandCount}`);

      // Only expand if we have tweets
      if (beforeExpandCount > 0) {
        await this.expandShowMoreButtons(page);
      }

      // Then scroll to load more tweets
      await this.handleTwitter(page, maxScrolls, maxTweets);

      // NOTE: Don't extract rawData for Twitter because:
      // 1. window.__STATE__ contains initial truncated text
      // 2. Clicking "显示更多" buttons only updates DOM, not window.__STATE__
      // 3. DOM extraction in TwitterAdapter will get the expanded content
      // rawData remains undefined so DOM extraction is used instead
    }

    // Extract page info
    const title = await page.title();
    const canonicalUrl = await this.extractCanonicalUrl(page);
    const html = await page.content();

    // Debug outputs
    let screenshotPath: string | undefined;
    let debugHtmlPath: string | undefined;
    let debugDataPath: string | undefined;

    if (options.debug) {
      const timestamp = Date.now();
      const debugDir = join(process.cwd(), 'debug');

      // Ensure debug directory exists
      await fs.mkdir(debugDir, { recursive: true });

      // Save HTML snapshot with platform prefix
      const platformPrefix = platform === 'unknown' ? 'unknown' : platform;
      debugHtmlPath = join(debugDir, `debug-${platformPrefix}-${timestamp}.html`);
      await fs.writeFile(debugHtmlPath, html);

      // Save raw data if available
      if (rawData) {
        debugDataPath = join(debugDir, `debug-data-${timestamp}.json`);
        await fs.writeFile(debugDataPath, rawData);

        console.error(`[DEBUG] rawData source: ${JSON.parse(rawData).metadata?.extractedFrom || 'unknown'}`);
        const tweetCount = JSON.parse(rawData).tweets?.length || 0;
        console.error(`[DEBUG] tweets found: ${tweetCount}`);
      }
    }

    return {
      url,
      canonicalUrl,
      title,
      html,
      platform,
      rawData,
      screenshotPath,
      debugHtmlPath,
      debugDataPath,
      page,  // Include page for DOM extraction
    };
  }

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

  private async expandShowMoreButtons(page: Page): Promise<void> {
    try {
      // Use the unique data-testid selector for "Show more" buttons
      const result = await page.evaluate(() => {
        let clickCount = 0;

        // Find all buttons with data-testid="tweet-text-show-more-link"
        const buttons = document.querySelectorAll('button[data-testid="tweet-text-show-more-link"]');
        for (const button of buttons) {
          try {
            (button as HTMLElement).click();
            clickCount++;
          } catch (e) {
            console.error('[DEBUG] Failed to click show more button:', e);
          }
        }

        return clickCount;
      });

      console.error(`[DEBUG] Clicked ${result} show more buttons`);

      if (result > 0) {
        // Wait for expanded content to load
        await page.waitForTimeout(2000);
      }
    } catch (error) {
      console.error(`[DEBUG] expandShowMoreButtons error:`, error);
    }
  }

  private async extractTwitterRawData(page: Page): Promise<string | undefined> {
    try {
      const extractor = new TwitterRawExtractor();
      const rawData = await extractor.extract(page);
      if (rawData) {
        return JSON.stringify(rawData);
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private async extractZhihuRawData(page: Page): Promise<string | undefined> {
    try {
      const data = await page.evaluate(() => {
        // Try to extract from __STATE__ or similar
        const state = (window as any).__INITIAL_STATE__;
        if (state) return JSON.stringify(state);

        // Fallback: extract from script tags
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent || '';
          if (text.includes('question') && text.includes('answer')) {
            const match = text.match(/({.*})/);
            if (match) return match[0];
          }
        }
        return undefined;
      });
      return data;
    } catch {
      return undefined;
    }
  }

  private async extractCanonicalUrl(page: Page): Promise<string | undefined> {
    try {
      return await page.$eval('link[rel="canonical"]', (el: HTMLAnchorElement) => el.href);
    } catch {
      return undefined;
    }
  }
}
