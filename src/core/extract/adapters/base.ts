// src/core/extract/adapters/base.ts
import type { Adapter, ExtractResult } from '../types.js';
import type { RenderedPage } from '../../render/types.js';

export abstract class BaseAdapter implements Adapter {
  abstract readonly platform: string;
  abstract readonly domains: string[];

  canHandle(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return this.domains.some(domain => urlObj.hostname.includes(domain));
    } catch {
      return false;
    }
  }

  abstract extract(page: RenderedPage): Promise<ExtractResult>;

  protected cleanText(text: string): string {
    return text
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+\n/g, '\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^ | $/gm, '')
      .trim();
  }
}
