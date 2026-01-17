// src/core/extract/__tests__/registry.test.ts
import { AdapterRegistry, registry } from '../registry.js';
import { TwitterAdapter } from '../adapters/twitter.js';
import type { Adapter } from '../types.js';

// Test adapter for registration tests
class MockAdapter implements Adapter {
  readonly platform = 'mock';
  readonly domains = ['mock.com'];

  canHandle(url: string): boolean {
    return url.includes('mock.com');
  }

  async extract(page: any): Promise<any> {
    return { doc: { platform: 'mock' }, warnings: [] };
  }
}

describe('AdapterRegistry', () => {
  let customRegistry: AdapterRegistry;

  beforeEach(() => {
    customRegistry = new AdapterRegistry();
  });

  describe('initialization', () => {
    it('should initialize with Twitter adapter', () => {
      const adapters = (customRegistry as any).adapters;
      expect(adapters.length).toBeGreaterThan(0);
      expect(adapters[0]).toBeInstanceOf(TwitterAdapter);
    });
  });

  describe('select', () => {
    it('should return Twitter adapter for x.com URLs', () => {
      const adapter = customRegistry.select('https://x.com/user/status/123');
      expect(adapter).toBeInstanceOf(TwitterAdapter);
      expect(adapter.platform).toBe('twitter');
    });

    it('should return Twitter adapter for twitter.com URLs', () => {
      const adapter = customRegistry.select('https://twitter.com/user/status/123');
      expect(adapter).toBeInstanceOf(TwitterAdapter);
      expect(adapter.platform).toBe('twitter');
    });

    it('should throw error for unsupported URLs', () => {
      expect(() => {
        customRegistry.select('https://unsupported.com/page');
      }).toThrow('No adapter found for URL: https://unsupported.com/page');
    });

    it('should throw error for invalid URLs', () => {
      expect(() => {
        customRegistry.select('not-a-url');
      }).toThrow();
    });
  });

  describe('register', () => {
    it('should add new adapter to registry', () => {
      const mockAdapter = new MockAdapter();
      const initialLength = (customRegistry as any).adapters.length;

      customRegistry.register(mockAdapter);

      const adapters = (customRegistry as any).adapters;
      expect(adapters.length).toBe(initialLength + 1);
      expect(adapters[adapters.length - 1]).toBe(mockAdapter);
    });

    it('should select registered adapter for matching URLs', () => {
      const mockAdapter = new MockAdapter();
      customRegistry.register(mockAdapter);

      const adapter = customRegistry.select('https://mock.com/page');
      expect(adapter).toBe(mockAdapter);
      expect(adapter.platform).toBe('mock');
    });

    it('should still select existing adapters after registration', () => {
      const mockAdapter = new MockAdapter();
      customRegistry.register(mockAdapter);

      const twitterAdapter = customRegistry.select('https://x.com/status/123');
      expect(twitterAdapter).toBeInstanceOf(TwitterAdapter);
    });
  });

  describe('singleton instance', () => {
    it('should export singleton registry instance', () => {
      expect(registry).toBeInstanceOf(AdapterRegistry);
    });

    it('should maintain state across imports', () => {
      const mockAdapter = new MockAdapter();
      registry.register(mockAdapter);

      const adapter = registry.select('https://mock.com/test');
      expect(adapter).toBe(mockAdapter);
    });
  });
});
