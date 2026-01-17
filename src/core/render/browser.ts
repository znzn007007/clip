// src/core/render/browser.ts
import { chromium, type Browser, type BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class BrowserManager {
  private browser?: Browser;
  private context?: BrowserContext;
  private sessionDir: string;

  constructor(sessionDir: string = path.join(process.cwd(), '.clip', 'session')) {
    this.sessionDir = sessionDir;
  }

  async launch(): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    // Try system browsers first, fallback to Playwright browser
    const channels = ['chrome', 'msedge', 'chromium'];

    for (const channel of channels) {
      try {
        this.browser = await chromium.launch({
          channel,
          headless: true,
        });
        break;
      } catch (e) {
        // Channel not available, try next
        continue;
      }
    }

    // If all channels failed, use Playwright's bundled browser
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
      });
    }

    // Ensure session directory exists
    await fs.mkdir(this.sessionDir, { recursive: true });

    // Create persistent context for session reuse
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    return this.context;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = undefined;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }

  getContext(): BrowserContext | undefined {
    return this.context;
  }
}
