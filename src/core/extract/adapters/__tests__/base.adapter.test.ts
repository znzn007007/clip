// src/core/extract/adapters/__tests__/base.adapter.test.ts
import { BaseAdapter } from '../base.js';
import type { ExtractResult } from '../../types.js';
import type { RenderedPage } from '../../../render/types.js';
import type { Platform } from '../../../types/index.js';

// Test implementation of BaseAdapter
class TestAdapter extends BaseAdapter {
  readonly platform: Platform = 'twitter';
  readonly domains = ['example.com', 'test.org'];

  async extract(page: RenderedPage): Promise<ExtractResult> {
    return {
      doc: {
        platform: this.platform,
        sourceUrl: page.url,
        canonicalUrl: page.canonicalUrl,
        title: 'Test Document',
        fetchedAt: new Date().toISOString(),
        blocks: [{ type: 'paragraph', content: 'Test content' }],
        assets: { images: [] },
      },
      warnings: [],
    };
  }
}

describe('BaseAdapter', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = new TestAdapter();
  });

  describe('canHandle', () => {
    it('should return true for matching domain', () => {
      expect(adapter.canHandle('https://example.com/page')).toBe(true);
      expect(adapter.canHandle('https://test.org/page')).toBe(true);
    });

    it('should return true for subdomains', () => {
      expect(adapter.canHandle('https://sub.example.com/page')).toBe(true);
      expect(adapter.canHandle('https://blog.test.org/article')).toBe(true);
    });

    it('should return false for non-matching domains', () => {
      expect(adapter.canHandle('https://other.com/page')).toBe(false);
      expect(adapter.canHandle('https://example.net/page')).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      expect(adapter.canHandle('not-a-url')).toBe(false);
      expect(adapter.canHandle('')).toBe(false);
    });
  });

  describe('cleanText', () => {
    it('should normalize whitespace', () => {
      const result = (adapter as any).cleanText('hello     world');
      expect(result).toBe('hello world');
    });

    it('should limit consecutive newlines to 2', () => {
      const result = (adapter as any).cleanText('line1\n\n\n\nline2');
      expect(result).toBe('line1\n\nline2');
    });

    it('should trim leading and trailing whitespace', () => {
      const result = (adapter as any).cleanText('  \n  text  \n  ');
      expect(result).toBe('text');
    });

    it('should handle mixed whitespace', () => {
      const result = (adapter as any).cleanText('  line1\n\n  \n  line2   ');
      expect(result).toBe('line1\n\nline2');
    });
  });

  describe('abstract methods', () => {
    it('should require platform property', () => {
      expect(adapter.platform).toBe('twitter');
    });

    it('should require domains property', () => {
      expect(adapter.domains).toEqual(['example.com', 'test.org']);
    });

    it('should require extract method', async () => {
      const page: RenderedPage = {
        url: 'https://example.com/test',
        canonicalUrl: 'https://example.com/test',
        title: 'Test Page',
        html: '<html>test</html>',
        platform: 'twitter',
        screenshotPath: undefined,
      };

      const result = await adapter.extract(page);
      expect(result.doc).toBeDefined();
      expect(result.doc.platform).toBe('twitter');
      expect(result.warnings).toEqual([]);
    });
  });
});
