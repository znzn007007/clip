// src/core/render/page.ts
import type { BrowserContext, Page } from 'playwright';
import type { RenderedPage, RenderOptions } from './types.js';
import { detectPlatform, isValidUrl } from './utils.js';
import { DEFAULT_TIMEOUT, DEFAULT_MAX_SCROLLS } from '../config/constants.js';

export class PageRenderer {
  constructor(private context: BrowserContext) {}

  async render(url: string, options: RenderOptions = {}): Promise<RenderedPage> {
    // Validate URL first
    if (!isValidUrl(url)) {
      throw new Error(`Invalid URL: ${url}`);
    }

    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const maxScrolls = options.maxScrolls ?? DEFAULT_MAX_SCROLLS;

    const page = await this.context.newPage();

    try {
      // Navigate to URL
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout,
      });

      // Wait for main content
      const contentSelector = options.waitForSelector || 'article, main, [role="main"]';
      await page.waitForSelector(contentSelector, { timeout: 5000 }).catch(() => {
        // Continue even if selector not found
      });

      // Platform-specific handling
      const platform = detectPlatform(new URL(url));

      if (platform === 'twitter') {
        await this.handleTwitter(page, maxScrolls);
      }

      // Extract page info
      const title = await page.title();
      const canonicalUrl = await this.extractCanonicalUrl(page);
      const html = await page.content();

      // Debug outputs
      let screenshotPath: string | undefined;
      let debugHtmlPath: string | undefined;

      if (options.debug) {
        // Save debug info (implementation later)
      }

      return {
        url,
        canonicalUrl,
        title,
        html,
        platform,
        screenshotPath,
        debugHtmlPath,
      };
    } finally {
      await page.close();
    }
  }

  private async handleTwitter(page: Page, maxScrolls: number): Promise<void> {
    // For Twitter/X, scroll to load thread content
    let scrollCount = 0;
    let previousHeight = 0;

    while (scrollCount < maxScrolls) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });

      await page.waitForTimeout(1000);

      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight) {
        break; // No more content loading
      }
      previousHeight = currentHeight;
      scrollCount++;
    }

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  private async extractCanonicalUrl(page: Page): Promise<string | undefined> {
    try {
      return await page.$eval('link[rel="canonical"]', (el: HTMLAnchorElement) => el.href);
    } catch {
      return undefined;
    }
  }
}
