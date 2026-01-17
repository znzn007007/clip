// src/core/render/browser.ts
import { chromium, type Browser, type BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BROWSER_CHANNELS, DEFAULT_USER_AGENT } from '../config/constants.js';
import { ClipError } from '../errors.js';
import { ErrorCode } from '../export/types.js';

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
    for (const channel of BROWSER_CHANNELS) {
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
      try {
        this.browser = await chromium.launch({
          headless: true,
        });
      } catch (error) {
        throw new ClipError(
          ErrorCode.NETWORK_ERROR,
          `Failed to launch browser: ${error instanceof Error ? error.message : 'Unknown error'}`,
          false,
          'Ensure Playwright browsers are installed. Run: npx playwright install chromium'
        );
      }
    }

    // Ensure session directory exists
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });
    } catch (error) {
      throw new ClipError(
        ErrorCode.EXPORT_FAILED,
        `Failed to create session directory: ${this.sessionDir}`,
        false,
        `Check permissions for directory: ${this.sessionDir}`
      );
    }

    // Create persistent context for session reuse
    this.context = await this.browser.newContext({
      userAgent: DEFAULT_USER_AGENT,
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
