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

      // Extract original author from URL for filtering
      const urlMatch = url.match(/x\.com\/([^\/]+)/);
      const originalAuthor = urlMatch ? urlMatch[1] : null;

      // Check initial state before expanding (only primary column tweets)
      const beforeExpandCount = await page.locator('div[data-testid="primaryColumn"] article[data-testid="tweet"]').count();
      console.error(`[DEBUG] Before expand: tweet count=${beforeExpandCount}`);

      // Only expand if we have tweets
      if (beforeExpandCount > 0) {
        await this.expandShowMoreButtons(page);
        // Try to click "Show more thread" button to load complete thread
        await this.expandShowMoreThreadButton(page);
      }

      // Then scroll to load more tweets
      await this.handleTwitter(page, maxScrolls, maxTweets, originalAuthor);

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

  private async handleTwitter(page: Page, maxScrolls: number, maxTweets: number, originalAuthor: string | null): Promise<void> {
    // 初始展开"显示更多"按钮
    await this.expandShowMoreButtons(page);

    let scrollCount = 0;
    let unchangedCount = 0;  // 连续未变化的次数
    let lastTweetCount = 0;
    let maxAuthorTweets = 0;  // 记录最大推文数量
    let lowGrowthCount = 0;  // 连续低增长次数

    // 新增：收集多个批次的推文ID，用于最终合并
    const collectedTweetIds = new Set<string>();
    const allExtractedTweets: any[] = [];

    while (scrollCount < maxScrolls) {
      // 1. 滚动一小步（更小的步长以减少Twitter卸载）
      await page.evaluate(() => {
        // Scroll by 50% of viewport height to minimize tweet unloading
        window.scrollBy(0, window.innerHeight * 0.5);
      });

      // 2. 等待懒加载
      await page.waitForTimeout(2000);

      // 3. 展开新加载的推文中的"显示更多"按钮
      await this.expandShowMoreButtons(page);

      // 4. 检查推文数量 (只计算原推文作者的推文数量)
      let currentTweetCount = await page.locator('div[data-testid="primaryColumn"] article[data-testid="tweet"]').count();

      if (originalAuthor) {
        // Count only original author's tweets
        const authorTweetCount = await page.evaluate((author) => {
          const primaryColumn = document.querySelector('div[data-testid="primaryColumn"]');
          if (!primaryColumn) return 0;

          const tweets = primaryColumn.querySelectorAll('article[data-testid="tweet"]');
          let count = 0;

          for (const tweet of tweets) {
            const authorLink = tweet.querySelector('[data-testid="User-Name"] a[href^="/"]');
            if (authorLink) {
              const href = authorLink.getAttribute('href');
              if (href === `/${author}`) {
                count++;
              }
            }
          }

          return count;
        }, originalAuthor);

        console.error(`[DEBUG] Scroll ${scrollCount + 1}: all tweets=${currentTweetCount}, @${originalAuthor} tweets=${authorTweetCount}`);
        currentTweetCount = authorTweetCount;
      } else {
        console.error(`[DEBUG] Scroll ${scrollCount + 1}: tweet count=${currentTweetCount}`);
      }

      // 5. 检查停止条件
      if (currentTweetCount >= maxTweets) {
        console.error(`[DEBUG] Reached maxTweets (${maxTweets}), stopping`);
        break;
      }

      // Update max author tweets count
      if (currentTweetCount > maxAuthorTweets) {
        maxAuthorTweets = currentTweetCount;
      }

      // Check growth rate
      const growth = currentTweetCount - lastTweetCount;

      // 新增：当原作者推文数量增加时，立即提取当前可见的推文
      if (originalAuthor && growth > 0) {
        const currentBatch = await page.evaluate((author) => {
          const primaryColumn = document.querySelector('div[data-testid="primaryColumn"]');
          if (!primaryColumn) return [];

          const tweets = primaryColumn.querySelectorAll('article[data-testid="tweet"]');
          const batch: any[] = [];

          for (const tweet of tweets) {
            const authorLink = tweet.querySelector('[data-testid="User-Name"] a[href^="/"]');
            if (authorLink) {
              const href = authorLink.getAttribute('href');
              if (href === `/${author}`) {
                // 提取推文ID和时间，用于去重和排序
                const permalink = tweet.querySelector('a[href*="/status/"]');
                const idMatch = permalink?.getAttribute('href')?.match(/\/status\/(\d+)/);
                const id = idMatch?.[1] || '';
                const timeEl = tweet.querySelector('time');
                const createdAt = timeEl?.getAttribute('datetime') || '';

                batch.push({ id, createdAt });
              }
            }
          }

          return batch;
        }, originalAuthor);

        // 添加新推文到集合
        for (const tweet of currentBatch) {
          if (!collectedTweetIds.has(tweet.id)) {
            collectedTweetIds.add(tweet.id);
            allExtractedTweets.push(tweet);
          }
        }

        console.error(`[DEBUG] Batch extracted: ${currentBatch.length} new, total unique: ${collectedTweetIds.size}`);
      }

      // If author tweet count decreased, stop immediately
      if (originalAuthor && growth < 0 && maxAuthorTweets > 0) {
        console.error(`[DEBUG] Author tweet count peaked at ${maxAuthorTweets}, now ${currentTweetCount}. Stopping immediately.`);
        break;
      }

      // If growth is low (0 or 1 tweet) for 2 consecutive scrolls, we're near the end
      if (originalAuthor && growth <= 1) {
        lowGrowthCount++;
        if (lowGrowthCount >= 2 && currentTweetCount >= 5) {
          console.error(`[DEBUG] Low growth detected for ${lowGrowthCount} scrolls. Stopping at ${currentTweetCount} tweets.`);
          break;
        }
      } else {
        lowGrowthCount = 0;  // Reset if we had good growth
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
    console.error(`[DEBUG] Total unique tweets collected during scrolling: ${collectedTweetIds.size}`);

    // DON'T scroll to top - it will cause Twitter to unload tweets
    // Instead, stay at current position and extract what's visible
  }

  /**
   * 点击"显示更多"按钮来展开被截断的推文文本
   */
  private async expandShowMoreButtons(page: Page): Promise<void> {
    try {
      // Use the unique data-testid selector for "Show more" buttons (only in primary column)
      const result = await page.evaluate(() => {
        let clickCount = 0;

        // Only find buttons in the primary column to avoid clicking sidebar buttons
        const primaryColumn = document.querySelector('div[data-testid="primaryColumn"]');
        const buttons = primaryColumn
          ? Array.from(primaryColumn.querySelectorAll('button[data-testid="tweet-text-show-more-link"]'))
          : Array.from(document.querySelectorAll('button[data-testid="tweet-text-show-more-link"]'));
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

  /**
   * 点击"显示更多线程"按钮来加载完整的线程
   */
  private async expandShowMoreThreadButton(page: Page): Promise<void> {
    try {
      const result = await page.evaluate(() => {
        let clickCount = 0;

        // Twitter uses different text for "Show more thread" button
        // Try various selectors and text patterns
        const primaryColumn = document.querySelector('div[data-testid="primaryColumn"]');
        if (!primaryColumn) return 0;

        // Find all links/divs with text containing "more" or "thread" or "显示"
        const allElements = primaryColumn.querySelectorAll('a, div[role="button"], span[role="button"]');

        for (const el of Array.from(allElements)) {
          const text = el.textContent?.toLowerCase() || '';
          // Look for "show more thread", "show this thread", "显示更多" etc
          if ((text.includes('show') && text.includes('thread')) ||
              (text.includes('more') && text.includes('thread')) ||
              text === '显示更多' ||
              text === 'show more') {
            try {
              (el as HTMLElement).click();
              clickCount++;
              console.log('[DEBUG] Clicked show more thread button:', text);
            } catch (e) {
              // Ignore click failures
            }
          }
        }

        return clickCount;
      });

      if (result > 0) {
        console.error(`[DEBUG] Clicked ${result} show more thread buttons`);
        // Wait for thread content to load
        await page.waitForTimeout(3000);
      }
    } catch (error) {
      console.error(`[DEBUG] expandShowMoreThreadButton error:`, error);
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
