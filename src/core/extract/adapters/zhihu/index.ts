import { BaseAdapter } from '../base.js';
import type { ExtractResult } from '../../../types.js';
import type { RenderedPage } from '../../../render/types.js';
import type { ClipDoc, Block } from '../../../types/index.js';
import { ZhihuParser, type ZhihuData } from './parser.js';
import { ZhihuHtmlToBlocks } from './html-to-blocks.js';
import { ZhihuExtractError } from './errors.js';
import * as cheerio from 'cheerio';

export class ZhihuAdapter extends BaseAdapter {
  readonly platform = 'zhihu';
  readonly domains = ['zhihu.com', 'www.zhihu.com', 'zhuanlan.zhihu.com'];

  private parser = new ZhihuParser();
  private htmlConverter = new ZhihuHtmlToBlocks();

  async extract(page: RenderedPage): Promise<ExtractResult> {
    const warnings: string[] = [];

    // Primary path: parse raw data
    if (page.rawData) {
      try {
        const data = this.parser.parseFromRawState(JSON.parse(page.rawData));
        if (data) {
          return { doc: this.buildDoc(data, page), warnings: [] };
        }
      } catch (error) {
        warnings.push(`Raw data parsing failed: ${error}`);
      }
    }

    // Fallback path: parse HTML
    try {
      const data = this.parser.parseFromCheerio(cheerio.load(page.html), page.url);
      return { doc: this.buildDoc(data, page), warnings: ['Used HTML fallback parsing'] };
    } catch (error) {
      // Re-throw ZhihuExtractError as-is to preserve error code
      if (error instanceof ZhihuExtractError) {
        throw error;
      }
      throw new ZhihuExtractError(
        'Zhihu parsing failed',
        'PARSE_FAILED',
        error as Error
      );
    }
  }

  private buildDoc(data: ZhihuData, page: RenderedPage): ClipDoc {
    const blocks: Block[] = [];

    // Title (only for articles, answers use question title but without displaying it)
    if (data.type === 'article' && data.title) {
      blocks.push({ type: 'heading', level: 1, content: data.title });
    }

    // Content (HTML to Blocks)
    const contentBlocks = this.htmlConverter.convert(data.content);
    blocks.push(...contentBlocks);

    // Metadata (upvotes for answers)
    if (data.upvotes !== undefined) {
      blocks.push({
        type: 'paragraph',
        content: `**赞同数**: ${data.upvotes}`,
      });
    }

    // Images
    const images = data.images.map(url => ({
      url,
      alt: '',
    }));

    return {
      platform: 'zhihu',
      sourceUrl: page.url,
      canonicalUrl: page.canonicalUrl,
      // Use article title, or generate from question (not showing question in content)
      // Remove duplicate question titles if present
      title: data.title || (data.type === 'answer'
        ? this.deduplicateTitle(data.question?.title || '知乎内容') + ` - ${data.author.name}的回答`
        : '知乎内容'),
      author: data.author.name,
      publishedAt: data.publishedAt,
      fetchedAt: new Date().toISOString(),
      blocks,
      assets: { images },
    };
  }

  private deduplicateTitle(title: string): string {
    // Remove only full-string repetitions like "如何评价前端已死？如何评价前端已死？"
    // Preserve legitimate character repetitions like "哈哈哈哈是什么"
    const mid = Math.floor(title.length / 2);
    for (let i = mid; i > 0; i--) {
      if (title.length % i === 0) {
        const candidate = title.slice(0, i);
        const repeatCount = title.length / i;
        if (candidate.repeat(repeatCount) === title) {
          return candidate;
        }
      }
    }
    return title;
  }
}
