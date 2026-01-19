import { describe, it, expect } from '@jest/globals';
import * as cheerio from 'cheerio';
import { WeChatParser } from '../parser.js';
import { WeChatExtractError } from '../errors.js';

const load = (html: string) => cheerio.load(html);

describe('WeChatParser', () => {
  it('throws RATE_LIMITED when access is throttled', () => {
    const html = '<body>访问过于频繁</body><div id="js_content">x</div>';
    const parser = new WeChatParser();

    expect(() => parser.parseFromCheerio(load(html), 'https://mp.weixin.qq.com/s/1'))
      .toThrowError(WeChatExtractError);
  });

  it('throws LOGIN_REQUIRED when login wall is detected', () => {
    const html = '<body>请在微信客户端打开</body><div id="js_content">x</div>';
    const parser = new WeChatParser();

    expect(() => parser.parseFromCheerio(load(html), 'https://mp.weixin.qq.com/s/1'))
      .toThrowError(WeChatExtractError);
  });

  it('throws CONTENT_NOT_FOUND when content is missing', () => {
    const html = '<body>hello</body>';
    const parser = new WeChatParser();

    expect.assertions(2);
    try {
      parser.parseFromCheerio(load(html), 'https://mp.weixin.qq.com/s/1');
    } catch (err) {
      expect(err).toBeInstanceOf(WeChatExtractError);
      expect((err as WeChatExtractError).code).toBe('CONTENT_NOT_FOUND');
    }
  });

  it('extracts title, author, publishedAt, and images', () => {
    const html = `
      <meta property="article:published_time" content="2026-01-18T09:30" />
      <div class="rich_media_title">  Test Title  </div>
      <span id="js_name">Author Name</span>
      <div id="js_content">
        <p>Content</p>
        <img data-src="//mmbiz.qpic.cn/img1.jpg" />
        <img src="https://mmbiz.qpic.cn/img2.jpg" />
        <img src="data:image/png;base64,abc" />
        <img data-src="//mmbiz.qpic.cn/img1.jpg" />
      </div>
    `;

    const parser = new WeChatParser();
    const result = parser.parseFromCheerio(load(html), 'https://mp.weixin.qq.com/s/1');

    expect(result.title).toBe('Test Title');
    expect(result.author).toBe('Author Name');
    expect(result.publishedAt).toBe('2026-01-18T09:30');
    expect(result.images).toEqual([
      'https://mmbiz.qpic.cn/img1.jpg',
      'https://mmbiz.qpic.cn/img2.jpg',
    ]);
  });

  it('parses Chinese date formats', () => {
    const html = `
      <div class="rich_media_title">Title</div>
      <div id="js_content">x</div>
      <span class="rich_media_meta_text">2026年1月18日 9:05</span>
    `;
    const parser = new WeChatParser();
    const result = parser.parseFromCheerio(load(html), 'https://mp.weixin.qq.com/s/1');

    expect(result.publishedAt).toBe('2026-01-18T09:05');
  });

  it('extracts title/author from script and meta fallbacks', () => {
    const html = `
      <meta name="title" content="Meta Title" />
      <meta name="author" content="Meta Author" />
      <script>var msg_title = 'Script Title'; var nickname = "Script Author";</script>
      <div id="js_content">x</div>
    `;
    const parser = new WeChatParser();
    const result = parser.parseFromCheerio(load(html), 'https://mp.weixin.qq.com/s/1');

    expect(result.title).toBe('Meta Title');
    expect(result.author).toBe('Script Author');
  });

  it('parses simple date formats with seconds', () => {
    const html = `
      <div class="rich_media_title">Title</div>
      <div id="js_content">x</div>
      <meta name="publish_date" content="2026/01/18 09:05:30" />
    `;
    const parser = new WeChatParser();
    const result = parser.parseFromCheerio(load(html), 'https://mp.weixin.qq.com/s/1');

    expect(result.publishedAt).toBe('2026-01-18T09:05:30');
  });

  it('returns undefined when publishedAt cannot be parsed', () => {
    const html = `
      <div class="rich_media_title">Title</div>
      <div id="js_content">x</div>
      <span class="rich_media_meta_text">not a date</span>
    `;
    const parser = new WeChatParser();
    const result = parser.parseFromCheerio(load(html), 'https://mp.weixin.qq.com/s/1');

    expect(result.publishedAt).toBeUndefined();
  });
});
