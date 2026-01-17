// src/core/render/browser.ts
import { chromium, type BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DEFAULT_USER_AGENT } from '../config/constants.js';
import { ClipError } from '../errors.js';
import { ErrorCode } from '../export/types.js';

export class BrowserManager {
  private context?: BrowserContext;
  private sessionDir: string;

  constructor(sessionDir: string = path.join(process.cwd(), '.clip', 'session')) {
    this.sessionDir = sessionDir;
  }

  async launch(): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
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

    // Try to copy cookies from Edge's Default profile
    const edgeCookiesPath = this.getEdgeCookiesPath();
    if (edgeCookiesPath) {
      try {
        // Check if Edge cookies file exists
        await fs.access(edgeCookiesPath);
        console.error(`[INFO] Found Edge cookies at: ${edgeCookiesPath}`);
        console.error('[INFO] Note: Edge must be closed to use its cookies directly');
        console.error('[INFO] Alternatively, use a persistent session that will remember logins');
      } catch {
        console.error('[INFO] Edge cookies not found, starting fresh session');
      }
    }

    // Launch Edge with persistent session context
    // This will remember cookies between runs
    try {
      console.error(`[INFO] Launching Edge with persistent session: ${this.sessionDir}`);
      this.context = await chromium.launchPersistentContext(this.sessionDir, {
        channel: 'msedge',
        headless: false,
        userAgent: DEFAULT_USER_AGENT,
        viewport: { width: 1920, height: 1080 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--no-default-browser-check',
        ],
      });

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

    } catch (error) {
      throw new ClipError(
        ErrorCode.NETWORK_ERROR,
        `Failed to launch browser: ${error instanceof Error ? error.message : 'Unknown error'}`,
        false,
        'Ensure Microsoft Edge is installed on your system'
      );
    }

    return this.context;
  }

  /**
   * Get Edge cookies file path based on platform
   */
  private getEdgeCookiesPath(): string | null {
    const platform = os.platform();
    const homedir = os.homedir();

    switch (platform) {
      case 'win32':
        return path.join(homedir, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Network', 'Cookies');
      case 'darwin':
        return path.join(homedir, 'Library', 'Application Support', 'Microsoft Edge', 'Default', 'Cookies');
      case 'linux':
        return path.join(homedir, '.config', 'microsoft-edge', 'Default', 'Cookies');
      default:
        return null;
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
