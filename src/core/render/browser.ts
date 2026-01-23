// src/core/render/browser.ts
import { chromium, type BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DEFAULT_USER_AGENT } from '../config/constants.js';
import { ClipError } from '../errors.js';
import { ErrorCode } from '../export/types.js';
import { detectPlatform } from './utils.js';
import { BrowserSelector } from './browser-selector.js';
import { BROWSER_CONFIGS } from '../config/browser-config.js';
import type { BrowserType, ConfigurableBrowser } from '../types/index.js';

export interface BrowserOptions {
  cdpEndpoint?: string;  // Chrome DevTools Protocol endpoint (e.g., 'http://localhost:9222')
  browserType?: BrowserType;  // 新增
}

export class BrowserManager {
  private context?: BrowserContext;
  private sessionDir: string;
  private options?: BrowserOptions;
  private selectedBrowser?: BrowserType;

  constructor(
    sessionDir: string = path.join(process.cwd(), '.clip', 'session'),
    options?: BrowserOptions
  ) {
    this.sessionDir = sessionDir;
    this.options = options;
  }

  async launch(targetUrl?: string): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    // Step 1: Select browser using BrowserSelector
    const selector = new BrowserSelector();
    const resolvedBrowser = await selector.select(this.options?.browserType);
    this.selectedBrowser = resolvedBrowser;
    // Type assertion: select() always returns ConfigurableBrowser (never 'auto')
    const browserConfig = BROWSER_CONFIGS[resolvedBrowser as ConfigurableBrowser];

    // Step 2: Determine session directory
    const sessionDir = path.join(process.cwd(), browserConfig.sessionDir);

    // Ensure session directory exists
    try {
      await fs.mkdir(sessionDir, { recursive: true });
    } catch (error) {
      throw new ClipError(
        ErrorCode.EXPORT_FAILED,
        `Failed to create session directory: ${sessionDir}`,
        false,
        `Check permissions for directory: ${sessionDir}`
      );
    }

    // Step 3: Check for existing cookies from browser
    const cookiesPath = browserConfig.cookiesPath(process.platform);
    if (cookiesPath) {
      try {
        await fs.access(cookiesPath);
        console.error(`[INFO] Found ${browserConfig.name} cookies at: ${cookiesPath}`);
        console.error(`[INFO] Note: ${browserConfig.name} must be closed to use its cookies directly`);
        console.error('[INFO] Alternatively, use a persistent session that will remember logins');
      } catch {
        console.error(`[INFO] ${browserConfig.name} cookies not found, starting fresh session`);
      }
    }

    // Step 4: Launch browser with persistent session context
    try {
      console.error(`[INFO] Launching ${browserConfig.name} with persistent session: ${sessionDir}`);
      this.context = await chromium.launchPersistentContext(sessionDir, {
        channel: browserConfig.channel,
        headless: false,
        userAgent: DEFAULT_USER_AGENT,
        viewport: { width: 1920, height: 1080 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--no-default-browser-check',
        ],
      });

      // Step 5: Check for Twitter login if needed
      const shouldCheckTwitterLogin = this.shouldCheckTwitterLogin(targetUrl, this.selectedBrowser);
      if (shouldCheckTwitterLogin) {
        await this.checkTwitterLogin();
      }

    } catch (error) {
      throw new ClipError(
        ErrorCode.NETWORK_ERROR,
        `Failed to launch browser: ${error instanceof Error ? error.message : 'Unknown error'}`,
        false,
        `Ensure ${browserConfig.name} is installed on your system`
      );
    }

    return this.context;
  }

  private shouldCheckTwitterLogin(targetUrl?: string, browserType?: BrowserType): boolean {
    if (!targetUrl) {
      return true;
    }
    try {
      const url = new URL(targetUrl);
      return detectPlatform(url) === 'twitter';
    } catch {
      return true;
    }
  }

  /**
   * Check and handle Twitter/X login
   */
  private async checkTwitterLogin(): Promise<void> {
    if (!this.context) {
      return;
    }

    // Check if we have Twitter/X cookies
    const cookies = await this.context.cookies();
    const hasTwitterCookie = cookies.some(c =>
      c.domain.includes('x.com') || c.domain.includes('twitter.com')
    );

    if (!hasTwitterCookie) {
      console.error('[WARN] No Twitter/X cookies found in session.');
      console.error('[INFO] Please log in to Twitter/X in the browser window that will open.');
      console.error('[INFO] The browser will wait for you to navigate to Twitter/X and log in.');
      console.error('[INFO] After logging in, the extraction will proceed automatically.');

      // Navigate to Twitter to give user a chance to log in
      const page = this.context.pages()[0] || await this.context.newPage();
      await page.goto('https://x.com');
      console.error('[INFO] Waiting for you to log in... (Press Ctrl+C to cancel)');

      // Wait for auth cookie (check every 2 seconds)
      let loggedIn = false;
      for (let i = 0; i < 60; i++) { // Wait up to 2 minutes
        await page.waitForTimeout(2000);
        const currentCookies = await this.context.cookies();
        if (currentCookies.some(c => c.name === 'auth_token' && (c.domain.includes('x.com') || c.domain.includes('twitter.com')))) {
          loggedIn = true;
          console.error('[INFO] Login detected! Proceeding with extraction...');
          break;
        }
      }

      if (!loggedIn) {
        console.error('[WARN] Login not detected within timeout. Proceeding anyway...');
      }
    } else {
      console.error('[INFO] Twitter/X cookies found in session, proceeding...');
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = undefined;
    }
  }

  getContext(): BrowserContext | undefined {
    return this.context;
  }
}
