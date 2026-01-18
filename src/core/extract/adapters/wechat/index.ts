import { BaseAdapter } from '../base.js';
import type { ExtractResult } from '../../../types.js';
import type { RenderedPage } from '../../../render/types.js';
import type { ClipDoc, Block } from '../../../types/index.js';
import { WeChatParser, type WeChatData } from './parser.js';
import { WeChatHtmlToBlocks } from './html-to-blocks.js';
import { WeChatExtractError } from './errors.js';
import * as cheerio from 'cheerio';

export class WeChatAdapter extends BaseAdapter {
  readonly platform = 'wechat';
  readonly domains = ['mp.weixin.qq.com'];

  private parser = new WeChatParser();
  private htmlConverter = new WeChatHtmlToBlocks();

  async extract(page: RenderedPage): Promise<ExtractResult> {
    try {
      const data = this.parser.parseFromCheerio(cheerio.load(page.html), page.url);
      return { doc: this.buildDoc(data, page), warnings: [] };
    } catch (error) {
      if (error instanceof WeChatExtractError) {
        throw error;
      }
      throw new WeChatExtractError(
        'WeChat parsing failed',
        'PARSE_FAILED',
        error as Error
      );
    }
  }

  private buildDoc(data: WeChatData, page: RenderedPage): ClipDoc {
    const blocks: Block[] = [];

    if (data.title) {
      blocks.push({ type: 'heading', level: 1, content: data.title });
    }

    const contentBlocks = this.htmlConverter.convert(data.content);
    blocks.push(...contentBlocks);

    const images = data.images.map(url => ({
      url,
      alt: '',
    }));

    return {
      platform: 'wechat',
      sourceUrl: page.url,
      canonicalUrl: page.canonicalUrl,
      title: data.title || page.title || '微信公众号内容',
      author: data.author,
      publishedAt: data.publishedAt,
      fetchedAt: new Date().toISOString(),
      blocks,
      assets: { images },
    };
  }
}
