import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { WeChatExtractError } from './errors.js';

export interface WeChatData {
  title: string;
  author?: string;
  publishedAt?: string;
  content: string;
  images: string[];
}

export class WeChatParser {
  parseFromCheerio($: cheerio.CheerioAPI, url: string): WeChatData {
    const html = $.html();
    const bodyText = $('body').text();

    if (this.isRateLimited(bodyText)) {
      throw new WeChatExtractError(
        'WeChat is rate limiting requests.',
        'RATE_LIMITED'
      );
    }

    if (this.isLoginRequired(bodyText)) {
      throw new WeChatExtractError(
        'WeChat requires login or app access to view this content.',
        'LOGIN_REQUIRED'
      );
    }

    const title = this.extractTitle($, html);
    const content = $('#js_content').html() || '';

    if (!content.trim()) {
      throw new WeChatExtractError(
        'WeChat content not found',
        'CONTENT_NOT_FOUND'
      );
    }

    const author = this.extractAuthor($, html);
    const publishedAt = this.extractPublishedAt($, html);
    const images = this.extractImages($);

    return {
      title: title || '微信公众号内容',
      author,
      publishedAt,
      content,
      images,
    };
  }

  private extractTitle($: cheerio.CheerioAPI, html: string): string {
    const candidates = [
      $('.rich_media_title').text(),
      $('#activity-name').text(),
      $('meta[property="og:title"]').attr('content') || '',
      $('meta[name="title"]').attr('content') || '',
      this.extractScriptValue(html, 'msg_title') || '',
    ];

    return this.pickText(candidates);
  }

  private extractAuthor($: cheerio.CheerioAPI, html: string): string | undefined {
    const candidates = [
      $('#js_name').text(),
      $('.profile_nickname').text(),
      this.extractScriptValue(html, 'nickname') || '',
      $('meta[name="author"]').attr('content') || '',
      $('meta[property="og:site_name"]').attr('content') || '',
    ];

    const name = this.pickText(candidates);
    return name || undefined;
  }

  private extractPublishedAt($: cheerio.CheerioAPI, html: string): string | undefined {
    const metaValue =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="publish_date"]').attr('content') ||
      '';

    const candidates = [
      metaValue,
      $('#publish_time').text(),
      $('.rich_media_meta_text').first().text(),
      this.extractScriptValue(html, 'publish_time') || '',
    ];

    for (const candidate of candidates) {
      const parsed = this.parsePublishedAt(candidate);
      if (parsed) {
        return parsed;
      }
    }

    return undefined;
  }

  private extractImages($: cheerio.CheerioAPI): string[] {
    const images: string[] = [];
    const seen = new Set<string>();

    $('#js_content img').each((_, img) => {
      const src = this.extractImageUrl($(img));
      if (!src) return;
      const normalized = this.normalizeUrl(src);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      images.push(normalized);
    });

    return images;
  }

  private extractImageUrl(node: cheerio.Cheerio<Element>): string | undefined {
    const dataSrc = node.attr('data-src') || node.attr('data-original');
    const src = dataSrc || node.attr('src') || '';
    if (!src || src.startsWith('data:image')) return undefined;
    return src;
  }

  private normalizeUrl(url: string): string {
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    return url;
  }

  private extractScriptValue(html: string, key: string): string | undefined {
    const pattern = new RegExp(`${key}\\s*=\\s*['"]([^'"]+)['"]`);
    const match = html.match(pattern);
    return match ? match[1].trim() : undefined;
  }

  private pickText(candidates: string[]): string {
    for (const candidate of candidates) {
      const value = candidate.replace(/\s+/g, ' ').trim();
      if (value) return value;
    }
    return '';
  }

  private parsePublishedAt(value: string): string | undefined {
    const raw = value.replace(/\s+/g, ' ').trim();
    if (!raw) return undefined;

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
      return raw;
    }

    const cnMatch = raw.match(
      /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2}):(\d{2}))?/
    );
    if (cnMatch) {
      const [, year, month, day, hour, minute] = cnMatch;
      return this.formatDateParts(
        Number(year),
        Number(month),
        Number(day),
        hour ? Number(hour) : undefined,
        minute ? Number(minute) : undefined
      );
    }

    const simpleMatch = raw.match(
      /(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
    );
    if (simpleMatch) {
      const [, year, month, day, hour, minute, second] = simpleMatch;
      return this.formatDateParts(
        Number(year),
        Number(month),
        Number(day),
        hour ? Number(hour) : undefined,
        minute ? Number(minute) : undefined,
        second ? Number(second) : undefined
      );
    }

    return undefined;
  }

  private formatDateParts(
    year: number,
    month: number,
    day: number,
    hour?: number,
    minute?: number,
    second?: number
  ): string {
    const date = `${year}-${this.pad(month)}-${this.pad(day)}`;
    if (hour === undefined || minute === undefined) {
      return date;
    }
    const time = `${this.pad(hour)}:${this.pad(minute)}${second !== undefined ? `:${this.pad(second)}` : ''}`;
    return `${date}T${time}`;
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  private isRateLimited(text: string): boolean {
    return text.includes('访问过于频繁') || text.includes('操作频繁');
  }

  private isLoginRequired(text: string): boolean {
    return text.includes('请在微信客户端打开') || text.includes('请先登录');
  }
}
