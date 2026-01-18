// src/core/export/assets.ts
import type { BrowserContext } from 'playwright';
import type { AssetImage } from '../types/index.js';

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
  constructor(private context: BrowserContext) {}

  async downloadImages(
    images: AssetImage[],
    assetsDir: string
  ): Promise<Map<string, string>> {
    const mapping = new Map<string, string>();

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const ext = this.getExtension(image.url);
      const filename = `${String(i + 1).padStart(3, '0')}.${ext}`;

      // Download logic will be implemented with Playwright
      mapping.set(image.url, `./assets/${filename}`);
    }

    return mapping;
  }

  private getExtension(url: string): string {
    const match = url.match(/\.([a-z]{3,4})(?:\?|$)/i);
    return match ? match[1].toLowerCase() : 'jpg';
  }
}
