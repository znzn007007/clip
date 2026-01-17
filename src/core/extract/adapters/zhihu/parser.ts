import * as cheerio from 'cheerio';
import { ZhihuExtractError } from './errors.js';

export interface ZhihuData {
  type: 'article' | 'answer';
  title?: string;
  question?: {
    title: string;
    detail?: string;
  };
  content: string;
  author: {
    name: string;
    url: string;
  };
  publishedAt: string;
  images: string[];
  upvotes?: number;
}

export class ZhihuParser {
  /**
   * Parse from Zhihu's raw state data (stub for now)
   */
  parseFromRawState(_state: unknown): ZhihuData | null {
    return null; // TODO: Implement in future
  }

  /**
   * Parse from Cheerio
   */
  parseFromCheerio($: cheerio.CheerioAPI, url: string): ZhihuData {
    // Check for Zhihu rate limit / anti-bot error
    const html = $.html();
    const errorMatch = html.match(/\{"error":\{"message":"([^"]+)","code":(\d+)\}\}/);
    if (errorMatch) {
      const [, message, code] = errorMatch;
      if (code === '40362') {
        throw new ZhihuExtractError(
          'Zhihu is blocking automated access. The request was flagged as unusual.',
          'RATE_LIMITED'
        );
      }
      throw new ZhihuExtractError(
        `Zhihu returned an error: ${message}`,
        'CONTENT_NOT_FOUND'
      );
    }

    try {
      const isAnswer = /\/question\/\d+\/answer\/\d+/.test(url);
      return isAnswer ? this.parseAnswer($, url) : this.parseArticle($, url);
    } catch (error) {
      // Return basic fallback with error info
      return {
        type: 'article',
        content: '',
        author: { name: 'Unknown', url: '' },
        publishedAt: new Date().toISOString(),
        images: [],
      };
    }
  }

  private parseAnswer($: cheerio.CheerioAPI, _url: string): ZhihuData {
    // Extract question title
    const questionTitle = $('h1.QuestionHeader-title').text().trim();

    // Extract answer content
    const answerContent = $('.RichContent-inner').html() || '';

    // Extract author
    const authorName = $('.AuthorInfo-name').text().trim();
    const authorUrl = $('.AuthorInfo-name a').attr('href') || '';

    // Extract upvotes
    const upvotesText = $('.VoteButton--up .VoteCount').text().trim();
    const upvotes = this.parseNumber(upvotesText);

    // Extract images
    const images: string[] = [];
    $('.RichContent-inner img').each((_, img) => {
      const src = $(img).attr('src');
      if (src && !src.includes('avatar')) {
        images.push(this.toHighRes(src));
      }
    });

    return {
      type: 'answer',
      question: { title: questionTitle },
      content: answerContent,
      author: { name: authorName, url: authorUrl || '' },
      publishedAt: new Date().toISOString(),
      images,
      upvotes,
    };
  }

  private parseArticle($: cheerio.CheerioAPI, _url: string): ZhihuData {
    // Extract title
    const title = $('.Post-Title').text().trim();

    // Extract content
    const content = $('.Post-RichText').html() || '';

    // Extract author
    const authorName = $('.AuthorInfo-name').text().trim();
    const authorUrl = $('.AuthorInfo-name a').attr('href') || '';

    // Extract images
    const images: string[] = [];
    $('.Post-RichText img, .RichContent img').each((_, img) => {
      const src = $(img).attr('src');
      if (src && !src.includes('avatar')) {
        images.push(this.toHighRes(src));
      }
    });

    return {
      type: 'article',
      title,
      content,
      author: { name: authorName, url: authorUrl || '' },
      publishedAt: new Date().toISOString(),
      images,
    };
  }

  private parseNumber(text: string): number {
    const match = text.match(/[\d,]+/);
    if (!match) return 0;
    return parseInt(match[0].replace(/,/g, ''), 10);
  }

  private toHighRes(url: string): string {
    return url
      .replace(/_b\.(jpg|png|webp)/, '_r.$1')
      .replace(/\/\d+_\d+_\//, '/2000_2000/');
  }
}
