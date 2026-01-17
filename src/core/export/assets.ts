// src/core/export/assets.ts
import type { BrowserContext } from 'playwright';
import type { AssetImage } from '../types/index.js';

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
