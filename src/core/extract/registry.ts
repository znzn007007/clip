// src/core/extract/registry.ts
import type { Adapter } from './types.js';
import { TwitterAdapter } from './adapters/twitter.js';
import { ZhihuAdapter } from './adapters/zhihu/index.js';
import { WeChatAdapter } from './adapters/wechat/index.js';

export class AdapterRegistry {
  private adapters: Adapter[] = [
    new TwitterAdapter(),
    new ZhihuAdapter(),
    new WeChatAdapter(),
  ];

  select(url: string): Adapter {
    const adapter = this.adapters.find(a => a.canHandle(url));

    if (!adapter) {
      throw new Error(`No adapter found for URL: ${url}`);
    }

    return adapter;
  }

  register(adapter: Adapter): void {
    this.adapters.push(adapter);
  }
}

// Singleton instance
export const registry = new AdapterRegistry();
