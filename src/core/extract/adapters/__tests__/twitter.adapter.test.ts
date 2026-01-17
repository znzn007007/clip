// src/core/extract/adapters/__tests__/twitter.adapter.test.ts
import { TwitterAdapter } from '../twitter.js';
import type { RenderedPage } from '../../../render/types.js';
import type { Platform } from '../../../types/index.js';

describe('TwitterAdapter', () => {
  let adapter: TwitterAdapter;

  beforeEach(() => {
    adapter = new TwitterAdapter();
  });

  describe('platform and domains', () => {
    it('should have correct platform name', () => {
      expect(adapter.platform).toBe('twitter');
    });

    it('should have correct domains', () => {
      expect(adapter.domains).toContain('x.com');
      expect(adapter.domains).toContain('twitter.com');
    });
  });

  describe('canHandle', () => {
    it('should return true for x.com URLs', () => {
      expect(adapter.canHandle('https://x.com/user/status/123')).toBe(true);
      expect(adapter.canHandle('https://x.com/user')).toBe(true);
    });

    it('should return true for twitter.com URLs', () => {
      expect(adapter.canHandle('https://twitter.com/user/status/123')).toBe(true);
      expect(adapter.canHandle('https://twitter.com/user')).toBe(true);
    });

    it('should return false for other URLs', () => {
      expect(adapter.canHandle('https://facebook.com/post/123')).toBe(false);
      expect(adapter.canHandle('https://example.com')).toBe(false);
    });
  });

  describe('extract', () => {
    it('should extract basic document structure', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/user/status/123456789',
        canonicalUrl: 'https://x.com/user/status/123456789',
        title: 'Test Tweet',
        html: '<html>test content</html>',
        platform: 'twitter' as Platform,
        screenshotPath: undefined,
      };

      const result = await adapter.extract(page);

      expect(result.doc).toBeDefined();
      expect(result.doc.platform).toBe('twitter');
      expect(result.doc.sourceUrl).toBe(page.url);
      expect(result.doc.canonicalUrl).toBe(page.canonicalUrl);
      expect(result.doc.title).toBe('Test Tweet');
      expect(result.doc.fetchedAt).toBeDefined();
      expect(result.doc.blocks).toBeDefined();
      expect(result.doc.blocks.length).toBeGreaterThan(0);
      expect(result.doc.assets).toBeDefined();
      expect(result.doc.assets.images).toEqual([]);
    });

    it('should extract author from HTML', async () => {
      const html = '{"screen_name":"testuser"}';
      const page: RenderedPage = {
        url: 'https://x.com/user/status/123',
        canonicalUrl: 'https://x.com/user/status/123',
        title: 'Tweet',
        html,
        platform: 'twitter' as Platform,
        screenshotPath: undefined,
      };

      const result = await adapter.extract(page);
      expect(result.doc.author).toBe('@testuser');
    });

    it('should return warnings array', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/user/status/123',
        canonicalUrl: 'https://x.com/user/status/123',
        title: 'Tweet',
        html: '<html>test</html>',
        platform: 'twitter' as Platform,
        screenshotPath: undefined,
      };

      const result = await adapter.extract(page);
      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should handle missing author gracefully', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/user/status/123',
        canonicalUrl: 'https://x.com/user/status/123',
        title: 'Tweet',
        html: '<html>no author here</html>',
        platform: 'twitter' as Platform,
        screenshotPath: undefined,
      };

      const result = await adapter.extract(page);
      expect(result.doc.author).toBeUndefined();
    });

    it('should create paragraph block for content', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/user/status/123',
        canonicalUrl: 'https://x.com/user/status/123',
        title: 'Tweet',
        html: '<html>test</html>',
        platform: 'twitter' as Platform,
        screenshotPath: undefined,
      };

      const result = await adapter.extract(page);
      const block = result.doc.blocks[0];
      expect(block.type).toBe('paragraph');
      if (block.type === 'paragraph') {
        expect(block.content).toBe('Content extraction to be implemented');
      }
    });
  });
});
