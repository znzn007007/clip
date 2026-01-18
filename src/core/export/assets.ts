// src/core/export/assets.ts
import type { BrowserContext } from 'playwright';
import type { AssetImage } from '../types/index.js';
import * as fs from 'fs/promises';
import { join } from 'path';

/**
 * Result of an image download attempt.
 *
 * @example
 * // Successful download
 * { status: 'success', path: './assets/001.jpg' }
 *
 * @example
 * // Failed download (falls back to original URL)
 * { status: 'failed', path: 'https://example.com/image.jpg', error: { reason: '网络超时' } }
 */
export interface DownloadResult {
  /** Download outcome */
  status: 'success' | 'failed';
  /** Local path on success, original URL on failure */
  path: string;
  /** Error details (present only when status is 'failed') */
  error?: {
    /** Localized error message for UI display */
    reason: string;
  };
}

/**
 * Detailed record of a failed download for diagnostics.
 *
 * @example
 * {
 *   url: 'https://example.com/image.jpg',
 *   filename: '001.jpg',
 *   reason: '网络超时',
 *   attempts: 3
 * }
 */
export interface DownloadError {
  /** Original image URL */
  url: string;
  /** Generated filename (for display only, not file path) */
  filename: string;
  /** Localized error reason (Chinese) */
  reason: string;
  /** Number of retry attempts made (0-3 per retry policy) */
  attempts: number;
}

export class AssetDownloader {
  private failures: DownloadError[] = [];

  constructor(private context: BrowserContext) {}

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async downloadImages(
    images: AssetImage[],
    assetsDir: string
  ): Promise<Map<string, DownloadResult>> {
    // Reset failures for this batch
    this.failures = [];

    // Ensure assets directory exists
    await fs.mkdir(assetsDir, { recursive: true });

    const mapping = new Map<string, DownloadResult>();

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const ext = this.getExtension(image.url);
      const filename = `${String(i + 1).padStart(3, '0')}.${ext}`;
      const filepath = join(assetsDir, filename);

      // Download with retry
      const result = await this.downloadWithRetry(image.url, filepath, filename);
      mapping.set(image.url, result);

      // Track failures
      if (result.status === 'failed') {
        this.failures.push({
          url: image.url,
          filename,
          reason: result.error?.reason || '未知错误',
          attempts: 3
        });
      }
    }

    return mapping;
  }

  private getExtension(url: string): string {
    const match = url.match(/\.([a-z]{3,4})(?:\?|$)/i);
    return match ? match[1].toLowerCase() : 'jpg';
  }

  private async tryContextDownload(url: string, filepath: string): Promise<void> {
    const page = await this.context.newPage();
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (!response || !response.ok()) {
        throw new Error(`HTTP ${response?.status() || 'unknown'}`);
      }
      const buffer = await response.body();
      await fs.writeFile(filepath, buffer);
    } finally {
      await page.close();
    }
  }

  private async tryFetchDownload(url: string, filepath: string): Promise<void> {
    // Create a temporary page for fetch injection
    const page = await this.context.newPage();
    try {
      // Use page.evaluate to run fetch in browser context (preserves cookies)
      const bufferArray = await page.evaluate(async (fetchUrl) => {
        const response = await fetch(fetchUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        return Array.from(new Uint8Array(arrayBuffer));
      }, url);

      await fs.writeFile(filepath, Buffer.from(bufferArray));
    } finally {
      await page.close();
    }
  }

  private async downloadWithRetry(
    url: string,
    filepath: string,
    filename: string
  ): Promise<DownloadResult> {
    const errors: string[] = [];

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Try Method 1: Context download
        await this.tryContextDownload(url, filepath);
        return { status: 'success', path: `./assets/${filename}` };
      } catch (e1) {
        errors.push(`Method1: ${(e1 as Error).message}`);

        // Try Method 2: Fetch fallback
        try {
          await this.tryFetchDownload(url, filepath);
          return { status: 'success', path: `./assets/${filename}` };
        } catch (e2) {
          errors.push(`Method2: ${(e2 as Error).message}`);
        }
      }

      // Retry delay with exponential backoff (1s, 2s, 4s)
      if (attempt < 2) {
        await this.sleep(1000 * Math.pow(2, attempt));
      }
    }

    // All attempts failed - return original URL
    const lastError = errors[errors.length - 1] || 'Unknown error';
    const reason = this.formatErrorReason(lastError);
    return {
      status: 'failed',
      path: url,  // Use original URL as fallback
      error: { reason }
    };
  }

  private formatErrorReason(error: string): string {
    if (error.includes('timeout') || error.includes('Timed out')) {
      return '网络超时';
    }
    if (error.includes('404')) {
      return '404 Not Found';
    }
    if (error.includes('403') || error.includes('401')) {
      return '访问被拒绝';
    }
    if (error.includes('ECONNREFUSED') || error.includes('fetch failed')) {
      return '连接失败';
    }
    return '下载失败';
  }

  getFailures(): DownloadError[] {
    return [...this.failures];
  }
}
