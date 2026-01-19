// src/core/extract/adapters/__tests__/wechat.adapter.test.ts
import { WeChatAdapter } from '../wechat/index.js';
import type { RenderedPage } from '../../../render/types.js';
import type { Platform } from '../../../types/index.js';
import { WeChatExtractError } from '../wechat/errors.js';

describe('WeChatAdapter', () => {
  let adapter: WeChatAdapter;

  beforeEach(() => {
    adapter = new WeChatAdapter();
  });

  describe('platform and domains', () => {
    it('should have correct platform name', () => {
      expect(adapter.platform).toBe('wechat');
    });

    it('should have correct domains', () => {
      expect(adapter.domains).toContain('mp.weixin.qq.com');
    });
  });

  describe('canHandle', () => {
    it('should return true for mp.weixin.qq.com URLs', () => {
      expect(adapter.canHandle('https://mp.weixin.qq.com/s/abc')).toBe(true);
      expect(adapter.canHandle('https://mp.weixin.qq.com/s?__biz=xxx')).toBe(true);
    });

    it('should return false for other URLs', () => {
      expect(adapter.canHandle('https://weixin.qq.com')).toBe(false);
      expect(adapter.canHandle('https://example.com')).toBe(false);
    });
  });

  describe('extract', () => {
    const mockHtml = `
      <html>
        <head>
          <meta property="article:published_time" content="2025-12-31T10:30:00Z" />
          <meta property="og:site_name" content="测试公众号OG" />
        </head>
        <body>
          <h2 class="rich_media_title">测试标题</h2>
          <span id="js_name">测试公众号</span>
          <em id="publish_time">2025-12-31 10:30</em>
          <div id="js_content">
            <p>第一段内容</p>
            <p>第二段内容 <img data-src="https://example.com/image1.jpg" alt="img1"></p>
            <p><a href="https://example.com">示例链接</a></p>
          </div>
        </body>
      </html>
    `;

    it('should extract basic document structure', async () => {
      const page: RenderedPage = {
        url: 'https://mp.weixin.qq.com/s/test',
        canonicalUrl: 'https://mp.weixin.qq.com/s/test',
        title: 'Mock WeChat Page',
        html: mockHtml,
        platform: 'wechat' as Platform,
      };

      const result = await adapter.extract(page);

      expect(result.doc).toBeDefined();
      expect(result.doc.platform).toBe('wechat');
      expect(result.doc.sourceUrl).toBe(page.url);
      expect(result.doc.canonicalUrl).toBe(page.canonicalUrl);
      expect(result.doc.fetchedAt).toBeDefined();
      expect(result.doc.blocks.length).toBeGreaterThan(0);
      expect(result.doc.assets.images.length).toBeGreaterThan(0);
    });

    it('should extract title, author, and publishedAt', async () => {
      const page: RenderedPage = {
        url: 'https://mp.weixin.qq.com/s/test',
        canonicalUrl: 'https://mp.weixin.qq.com/s/test',
        title: 'Mock WeChat Page',
        html: mockHtml,
        platform: 'wechat' as Platform,
      };

      const result = await adapter.extract(page);

      expect(result.doc.title).toContain('测试标题');
      expect(result.doc.author).toBe('测试公众号');
      expect(result.doc.publishedAt).toBe('2025-12-31T10:30:00Z');
    });

    it('should include image assets from content', async () => {
      const page: RenderedPage = {
        url: 'https://mp.weixin.qq.com/s/test',
        canonicalUrl: 'https://mp.weixin.qq.com/s/test',
        title: 'Mock WeChat Page',
        html: mockHtml,
        platform: 'wechat' as Platform,
      };

      const result = await adapter.extract(page);

      expect(result.doc.assets.images.length).toBeGreaterThan(0);
      expect(result.doc.assets.images[0].url).toBe('https://example.com/image1.jpg');
    });

    it('should detect login-required pages', async () => {
      const loginHtml = `
        <html>
          <body>
            请在微信客户端打开
          </body>
        </html>
      `;

      const page: RenderedPage = {
        url: 'https://mp.weixin.qq.com/s/login',
        canonicalUrl: 'https://mp.weixin.qq.com/s/login',
        title: 'Login Required',
        html: loginHtml,
        platform: 'wechat' as Platform,
      };

      await expect(adapter.extract(page)).rejects.toMatchObject({
        name: 'WeChatExtractError',
        code: 'LOGIN_REQUIRED',
      });
    });

    it('should detect missing content', async () => {
      const emptyHtml = `
        <html>
          <body>
            <h2 class="rich_media_title">空内容</h2>
          </body>
        </html>
      `;

      const page: RenderedPage = {
        url: 'https://mp.weixin.qq.com/s/empty',
        canonicalUrl: 'https://mp.weixin.qq.com/s/empty',
        title: 'Empty',
        html: emptyHtml,
        platform: 'wechat' as Platform,
      };

      await expect(adapter.extract(page)).rejects.toBeInstanceOf(WeChatExtractError);
    });

    it('should wrap unexpected errors as PARSE_FAILED', async () => {
      const page: RenderedPage = {
        url: 'https://mp.weixin.qq.com/s/error',
        canonicalUrl: 'https://mp.weixin.qq.com/s/error',
        title: 'Error',
        html: mockHtml,
        platform: 'wechat' as Platform,
      };

      jest.spyOn((adapter as any).parser, 'parseFromCheerio')
        .mockImplementation(() => {
          throw new Error('boom');
        });

      await expect(adapter.extract(page)).rejects.toMatchObject({
        name: 'WeChatExtractError',
        code: 'PARSE_FAILED',
      });
    });
  });
});
