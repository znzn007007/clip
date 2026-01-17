// src/core/extract/registry.ts
import type { Adapter } from './types.js';
import { TwitterAdapter } from './adapters/twitter.js';

export class AdapterRegistry {
  private adapters: Adapter[] = [
    new TwitterAdapter(),
    // More adapters will be added here
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
