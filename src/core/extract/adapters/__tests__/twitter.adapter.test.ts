// src/core/extract/adapters/__tests__/twitter.adapter.test.ts
import { jest } from '@jest/globals';
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
    const mockTweetHtml = `
      <html>
        <body>
          <article data-testid="tweet">
            <div data-testid="User-Name">
              <a href="/testuser">
                <span>Test User</span>
              </a>
            </div>
            <div data-testid="tweetText">This is a test tweet</div>
            <time datetime="2025-01-17T10:00:00Z">10:00 AM Jan 17, 2025</time>
            <div data-testid="reply" aria-label="5 replies"></div>
            <div data-testid="retweet" aria-label="10 reposts"></div>
            <div data-testid="like" aria-label="100 likes"></div>
            <img src="https://pbs.twimg.com/media/ABC123?format=jpg&name=medium" alt="Test image">
          </article>
        </body>
      </html>
    `;

    it('should extract basic document structure', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/user/status/123456789',
        canonicalUrl: 'https://x.com/user/status/123456789',
        title: 'Post by @testuser',
        html: mockTweetHtml,
        platform: 'twitter' as Platform,
      };

      const result = await adapter.extract(page);

      expect(result.doc).toBeDefined();
      expect(result.doc.platform).toBe('twitter');
      expect(result.doc.sourceUrl).toBe(page.url);
      expect(result.doc.canonicalUrl).toBe(page.canonicalUrl);
      expect(result.doc.fetchedAt).toBeDefined();
      expect(result.doc.blocks).toBeDefined();
      expect(result.doc.blocks.length).toBeGreaterThan(0);
      expect(result.doc.assets).toBeDefined();
    });

    it('should extract author from HTML', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/testuser/status/123',
        canonicalUrl: 'https://x.com/testuser/status/123',
        title: 'Post by @testuser',
        html: mockTweetHtml,
        platform: 'twitter' as Platform,
      };

      const result = await adapter.extract(page);
      expect(result.doc.author).toBe('@testuser');
    });

    it('should return warnings array', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/testuser/status/123',
        canonicalUrl: 'https://x.com/testuser/status/123',
        title: 'Post by @testuser',
        html: mockTweetHtml,
        platform: 'twitter' as Platform,
      };

      const result = await adapter.extract(page);
      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should extract tweet content and metrics', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/testuser/status/123',
        canonicalUrl: 'https://x.com/testuser/status/123',
        title: 'Post by @testuser',
        html: mockTweetHtml,
        platform: 'twitter' as Platform,
      };

      const result = await adapter.extract(page);

      // Check that blocks were created
      expect(result.doc.blocks.length).toBeGreaterThan(0);

      // Check for paragraph block with tweet text
      const paragraphBlock = result.doc.blocks.find((b: any) => b.type === 'paragraph');
      expect(paragraphBlock).toBeDefined();
      if (paragraphBlock && paragraphBlock.type === 'paragraph') {
        expect(paragraphBlock.content).toContain('test tweet');
      }

      // Check images
      expect(result.doc.assets.images.length).toBeGreaterThan(0);
      expect(result.doc.assets.images[0].url).toContain('pbs.twimg.com');
    });

    it('should handle multiple tweets in thread', async () => {
      const threadHtml = `
        <html>
          <body>
            <article data-testid="tweet">
              <div data-testid="User-Name">
                <a href="/testuser"><span>Test User</span></a>
              </div>
              <div data-testid="tweetText">First tweet</div>
              <time datetime="2025-01-17T10:00:00Z"></time>
              <div data-testid="reply" aria-label="1 replies"></div>
              <div data-testid="retweet" aria-label="2 reposts"></div>
              <div data-testid="like" aria-label="10 likes"></div>
            </article>
            <article data-testid="tweet">
              <div data-testid="User-Name">
                <a href="/testuser"><span>Test User</span></a>
              </div>
              <div data-testid="tweetText">Second tweet</div>
              <time datetime="2025-01-17T10:01:00Z"></time>
              <div data-testid="reply" aria-label="0 replies"></div>
              <div data-testid="retweet" aria-label="0 reposts"></div>
              <div data-testid="like" aria-label="5 likes"></div>
            </article>
          </body>
        </html>
      `;

      const page: RenderedPage = {
        url: 'https://x.com/testuser/status/123',
        canonicalUrl: 'https://x.com/testuser/status/123',
        title: 'Thread by @testuser',
        html: threadHtml,
        platform: 'twitter' as Platform,
      };

      const result = await adapter.extract(page);

      // Should have blocks for both tweets with separator
      expect(result.doc.blocks.length).toBeGreaterThan(2);

      // Check for separator
      const separator = result.doc.blocks.find((b: any) => b.type === 'paragraph' && b.content === '---');
      expect(separator).toBeDefined();
    });

    it('should extract from raw data when available', async () => {
      const rawData = JSON.stringify({
        tweets: [
          {
            id: '123456789',
            text: 'Raw data tweet',
            author: {
              name: 'Test User',
              screenName: 'testuser',
              avatarUrl: 'https://example.com/avatar.jpg',
            },
            createdAt: '2025-01-17T10:00:00Z',
            metrics: {
              likes: 100,
              retweets: 10,
              replies: 5,
              views: 1000,
            },
            media: [],
            hashtags: ['#test'],
            urls: [],
          },
        ],
        metadata: {
          extractedFrom: 'window_state' as const,
          timestamp: '2025-01-17T10:00:00Z',
        },
      });

      const page: RenderedPage = {
        url: 'https://x.com/testuser/status/123456789',
        canonicalUrl: 'https://x.com/testuser/status/123456789',
        title: 'Post by @testuser',
        html: mockTweetHtml,
        platform: 'twitter' as Platform,
        rawData,
      };

      const result = await adapter.extract(page);

      expect(result.doc.author).toBe('@testuser');
      expect(result.doc.blocks.length).toBeGreaterThan(0);
    });

    it('falls back to HTML when raw data contains no tweets', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/testuser/status/123456789',
        canonicalUrl: 'https://x.com/testuser/status/123456789',
        title: 'Post by @testuser',
        html: mockTweetHtml,
        platform: 'twitter' as Platform,
        rawData: JSON.stringify({ tweets: [] }),
      };

      const result = await adapter.extract(page);

      // HTML parsing is now the primary path, so no warning needed
      expect(result.warnings.length).toBe(0);
      expect(result.doc.author).toBe('@testuser');
    });

    it('uses DOM extraction when available', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/testuser/status/123456789',
        canonicalUrl: 'https://x.com/testuser/status/123456789',
        title: 'Post by @testuser',
        html: mockTweetHtml,
        platform: 'twitter' as Platform,
        page: {} as any,
      };

      const tweet = {
        id: '1',
        text: 'dom tweet',
        author: { screenName: 'testuser', displayName: 'Test User' },
        createdAt: '2026-01-01T00:00:00Z',
        metrics: { likes: 0, retweets: 0, replies: 0, views: 0 },
        media: [],
        hashtags: [],
        urls: [],
      };

      (adapter as any).domExtractor = {
        extract: jest.fn(() => Promise.resolve({})),
      };
      (adapter as any).parser = {
        parseFromRawState: jest.fn(() => [tweet]),
      };

      const result = await adapter.extract(page);

      // DOM extraction is now only used for metadata, not blocks
      // HTML parsing is the primary path for blocks
      expect(result.doc.author).toBe('@testuser');
    });

    it('continues when DOM extraction fails', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/testuser/status/123456789',
        canonicalUrl: 'https://x.com/testuser/status/123456789',
        title: 'Post by @testuser',
        html: mockTweetHtml,
        platform: 'twitter' as Platform,
        page: {} as any,
      };

      (adapter as any).domExtractor = {
        extract: jest.fn(() => Promise.reject(new Error('dom fail'))),
      };

      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const result = await adapter.extract(page);
      errorSpy.mockRestore();

      expect(result.doc.author).toBe('@testuser');
    });

    it('throws PARSE_FAILED when HTML parsing fails', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/testuser/status/123456789',
        canonicalUrl: 'https://x.com/testuser/status/123456789',
        title: 'Post by @testuser',
        html: '<html><body>No tweets here</body></html>',
        platform: 'twitter' as Platform,
      };

      await expect(adapter.extract(page)).rejects.toMatchObject({
        code: 'PARSE_FAILED',
      });
    });
  });

  describe('TwitterAdapter - 图片位置', () => {
    it('HTML 路径应该保持图片在正确位置', async () => {
      const mockHtmlWithImagesInOrder = `
        <html>
          <body>
            <article data-testid="tweet">
              <div data-testid="User-Name">
                <a href="/testuser">
                  <span>Test User</span>
                </a>
              </div>
              <div data-testid="tweetText">Text before image</div>
              <img src="https://pbs.twimg.com/media/test1.jpg?name=small" alt="First">
              <div data-testid="tweetText">Text between images</div>
              <img src="https://pbs.twimg.com/media/test2.jpg?name=small" alt="Second">
              <time datetime="2025-01-17T10:00:00Z"></time>
              <div data-testid="reply" aria-label="0 replies"></div>
              <div data-testid="retweet" aria-label="0 reposts"></div>
              <div data-testid="like" aria-label="0 likes"></div>
            </article>
          </body>
        </html>
      `;

      const page: RenderedPage = {
        url: 'https://x.com/user/status/123',
        canonicalUrl: 'https://x.com/user/status/123',
        title: 'Post by @user',
        html: mockHtmlWithImagesInOrder,
        platform: 'twitter' as Platform,
      };

      const result = await adapter.extract(page);
      const firstImageIndex = result.doc.blocks.findIndex(b => b.type === 'image');
      const firstParagraphIndex = result.doc.blocks.findIndex(b => b.type === 'paragraph');

      expect(firstImageIndex).toBeGreaterThan(firstParagraphIndex);
      expect(result.doc.blocks.filter(b => b.type === 'image').length).toBe(2);
    });

    it('HTML 失败时应该 fallback 到 rawData', async () => {
      const rawData = JSON.stringify({
        tweets: [{
          id: '123',
          text: 'Test tweet',
          author: { screenName: 'testuser', name: 'Test User' },
          createdAt: '2025-01-01T00:00:00Z',
          metrics: { likes: 0, retweets: 0, replies: 0, views: 0 },
          media: [],
          hashtags: [],
          urls: []
        }],
        metadata: {
          extractedFrom: 'window_state' as const,
          timestamp: '2025-01-01T00:00:00Z',
        },
      });

      const page: RenderedPage = {
        url: 'https://x.com/user/status/123',
        canonicalUrl: 'https://x.com/user/status/123',
        title: 'Post by @user',
        html: '<div>invalid</div>',
        platform: 'twitter' as Platform,
        rawData,
      };

      const result = await adapter.extract(page);
      expect(result.doc.blocks.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('Used fallback'))).toBe(true);
    });

    it('应该正确降级 metadata 到 @unknown', async () => {
      const page: RenderedPage = {
        url: 'https://x.com/user/status/123',
        canonicalUrl: 'https://x.com/user/status/123',
        title: 'Post by @user',
        html: '<html><body><article data-testid="tweet"><div data-testid="tweetText">Text</div></article></body></html>',
        platform: 'twitter' as Platform,
      };

      const result = await adapter.extract(page);
      expect(result.doc.author).toBe('@unknown');
    });
  });
});
