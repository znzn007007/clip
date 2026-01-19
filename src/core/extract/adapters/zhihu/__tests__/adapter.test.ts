import { describe, it, expect, jest } from '@jest/globals';
import { ZhihuAdapter } from '../index.js';
import { ZhihuExtractError } from '../errors.js';

jest.mock('../parser.js', () => ({
  ZhihuParser: jest.fn().mockImplementation(() => ({
    parseFromRawState: jest.fn(),
    parseFromCheerio: jest.fn(),
  })),
}));

jest.mock('../html-to-blocks.js', () => ({
  ZhihuHtmlToBlocks: jest.fn().mockImplementation(() => ({
    convert: jest.fn(),
  })),
}));

describe('ZhihuAdapter', () => {
  it('falls back to HTML parsing when raw data is missing', async () => {
    const adapter = new ZhihuAdapter();
    const parser = (adapter as any).parser;
    const htmlConverter = (adapter as any).htmlConverter;

    parser.parseFromRawState.mockReturnValue(null);
    parser.parseFromCheerio.mockReturnValue({
      type: 'article',
      title: 'Title',
      content: '<p>hi</p>',
      author: { name: 'Author', url: '' },
      publishedAt: '2026-01-19T00:00:00Z',
      images: [],
    });
    htmlConverter.convert.mockReturnValue([{ type: 'paragraph', content: 'hi' }]);

    const result = await adapter.extract({
      url: 'https://zhuanlan.zhihu.com/p/1',
      canonicalUrl: 'https://zhuanlan.zhihu.com/p/1',
      html: '<html></html>',
      rawData: undefined,
    } as any);

    expect(result.warnings).toContain('Used HTML fallback parsing');
    expect(result.doc.title).toBe('Title');
  });

  it('rethrows ZhihuExtractError from HTML parsing', async () => {
    const adapter = new ZhihuAdapter();
    const parser = (adapter as any).parser;

    parser.parseFromRawState.mockReturnValue(null);
    parser.parseFromCheerio.mockImplementation(() => {
      throw new ZhihuExtractError('blocked', 'RATE_LIMITED');
    });

    await expect(adapter.extract({
      url: 'https://www.zhihu.com/question/1/answer/2',
      canonicalUrl: 'https://www.zhihu.com/question/1/answer/2',
      html: '<html></html>',
      rawData: undefined,
    } as any)).rejects.toBeInstanceOf(ZhihuExtractError);
  });

  it('uses raw data when available', async () => {
    const adapter = new ZhihuAdapter();
    const parser = (adapter as any).parser;
    const htmlConverter = (adapter as any).htmlConverter;

    parser.parseFromRawState.mockReturnValue({
      type: 'article',
      title: 'Raw Title',
      content: '<p>raw</p>',
      author: { name: 'Author', url: '' },
      publishedAt: '2026-01-19T00:00:00Z',
      images: [],
      upvotes: 10,
    });
    htmlConverter.convert.mockReturnValue([]);

    const result = await adapter.extract({
      url: 'https://zhuanlan.zhihu.com/p/1',
      canonicalUrl: 'https://zhuanlan.zhihu.com/p/1',
      html: '<html></html>',
      rawData: JSON.stringify({}),
    } as any);

    const heading = result.doc.blocks.find((b: any) => b.type === 'heading');
    const upvotes = result.doc.blocks.find((b: any) => b.type === 'paragraph' && b.content.includes('赞同数'));
    expect(heading).toBeDefined();
    expect(upvotes).toBeDefined();
  });

  it('falls back to HTML when raw data parsing throws', async () => {
    const adapter = new ZhihuAdapter();
    const parser = (adapter as any).parser;
    const htmlConverter = (adapter as any).htmlConverter;

    parser.parseFromRawState.mockImplementation(() => {
      throw new Error('boom');
    });
    parser.parseFromCheerio.mockReturnValue({
      type: 'article',
      title: 'Fallback Title',
      content: '<p>hi</p>',
      author: { name: 'Author', url: '' },
      publishedAt: '2026-01-19T00:00:00Z',
      images: [],
    });
    htmlConverter.convert.mockReturnValue([{ type: 'paragraph', content: 'hi' }]);

    const result = await adapter.extract({
      url: 'https://zhuanlan.zhihu.com/p/1',
      canonicalUrl: 'https://zhuanlan.zhihu.com/p/1',
      html: '<html></html>',
      rawData: JSON.stringify({}),
    } as any);

    expect(result.warnings).toContain('Used HTML fallback parsing');
  });

  it('wraps non-Zhihu errors as PARSE_FAILED', async () => {
    const adapter = new ZhihuAdapter();
    const parser = (adapter as any).parser;

    parser.parseFromRawState.mockReturnValue(null);
    parser.parseFromCheerio.mockImplementation(() => {
      throw new Error('boom');
    });

    await expect(adapter.extract({
      url: 'https://www.zhihu.com/question/1/answer/2',
      canonicalUrl: 'https://www.zhihu.com/question/1/answer/2',
      html: '<html></html>',
      rawData: undefined,
    } as any)).rejects.toMatchObject({ code: 'PARSE_FAILED' });
  });

  it('deduplicates repeated question titles for answers', async () => {
    const adapter = new ZhihuAdapter();
    const parser = (adapter as any).parser;
    const htmlConverter = (adapter as any).htmlConverter;

    parser.parseFromRawState.mockReturnValue({
      type: 'answer',
      question: { title: 'abcabc' },
      content: '<p>answer</p>',
      author: { name: 'Author', url: '' },
      publishedAt: '2026-01-19T00:00:00Z',
      images: [],
    });
    htmlConverter.convert.mockReturnValue([]);

    const result = await adapter.extract({
      url: 'https://www.zhihu.com/question/1/answer/2',
      canonicalUrl: 'https://www.zhihu.com/question/1/answer/2',
      html: '<html></html>',
      rawData: JSON.stringify({}),
    } as any);

    expect(result.doc.title).toBe('abc - Author的回答');
  });
});
