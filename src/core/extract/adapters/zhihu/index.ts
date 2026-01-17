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
      throw new ZhihuExtractError(
        'Zhihu parsing failed',
        'PARSE_FAILED',
        error as Error
      );
    }
  }

  private buildDoc(data: ZhihuData, page: RenderedPage): ClipDoc {
    const blocks: Block[] = [];

    // Title
    if (data.title) {
      blocks.push({ type: 'heading', level: 1, content: data.title });
    }

    // Question title (for answers)
    if (data.question) {
      blocks.push({ type: 'heading', level: 2, content: data.question.title });
      if (data.question.detail) {
        blocks.push({ type: 'paragraph', content: data.question.detail });
      }
    }

    // Content (HTML to Blocks)
    const contentBlocks = this.htmlConverter.convert(data.content);
    blocks.push(...contentBlocks);

    // Metadata
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
      title: data.title || data.question?.title || '知乎内容',
      author: data.author.name,
      publishedAt: data.publishedAt,
      fetchedAt: new Date().toISOString(),
      blocks,
      assets: { images },
    };
  }
}
