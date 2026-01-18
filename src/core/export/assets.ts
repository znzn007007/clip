// src/core/export/assets.ts
import type { BrowserContext } from 'playwright';
import type { AssetImage } from '../types/index.js';
import * as fs from 'fs/promises';
import { join } from 'path';

export interface DownloadResult {
  status: 'success' | 'failed';
  path: string;  // success: "./assets/001.jpg", failed: original URL
  error?: {
    reason: string;  // Chinese error message: 网络超时, 404, 连接失败, etc.
  };
}

export interface DownloadError {
  url: string;
  filename: string;  // e.g., "001.jpg" (for display, not URL)
  reason: string;    // Chinese error message
  attempts: number;  // 0-3
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
