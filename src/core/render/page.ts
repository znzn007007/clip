// src/core/render/page.ts
import type { BrowserContext, Page } from 'playwright';
import type { RenderedPage, RenderOptions } from './types.js';
import { detectPlatform, isValidUrl } from './utils.js';
import { DEFAULT_TIMEOUT, DEFAULT_MAX_SCROLLS } from '../config/constants.js';
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

    const page = await this.context.newPage();

    // Navigate to URL
    await page.goto(url, {
      waitUntil: 'commit',
      timeout,
    });

    // Wait for main content
    const contentSelector = options.waitForSelector || 'article, main, [role="main"]';
    await page.waitForSelector(contentSelector, { timeout: 5000 }).catch(() => {
      // Continue even if selector not found
    });

    // Platform-specific handling
    const platform = detectPlatform(new URL(url));

    let rawData: string | undefined;
    if (platform === 'twitter') {
      rawData = await this.extractTwitterRawData(page);
    } else if (platform === 'zhihu') {
      rawData = await this.extractZhihuRawData(page);
    }

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
    let debugDataPath: string | undefined;

    if (options.debug) {
      const timestamp = Date.now();
      const debugDir = join(process.cwd(), 'debug');

      // Ensure debug directory exists
      await fs.mkdir(debugDir, { recursive: true });

      // Save HTML snapshot
      debugHtmlPath = join(debugDir, `debug-twitter-${timestamp}.html`);
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
