import * as cheerio from 'cheerio';
import type { AnyNode, Element, Text } from 'domhandler';
import type { Block } from '../../../types/index.js';

export class WeChatHtmlToBlocks {
  /**
   * Convert WeChat HTML content to Block array
   */
  convert(html: string): Block[] {
    const $ = cheerio.load(html);
    const blocks: Block[] = [];

    this.processChildren($, $.root()[0] || $.root(), blocks);

    return blocks;
  }

  private processChildren(
    $: cheerio.CheerioAPI,
    element: AnyNode,
    blocks: Block[]
  ): void {
    $(element).contents().each((_, node) => {
      if (node.type === 'text') {
        const text = (node as Text).data?.replace(/\s+/g, ' ').trim();
        if (text) {
          blocks.push({ type: 'paragraph', content: text });
        }
      } else if (node.type === 'tag') {
        this.convertTag($, node as Element, blocks);
      }
    });
  }

  private convertTag(
    $: cheerio.CheerioAPI,
    node: Element,
    blocks: Block[]
  ): void {
    const tagName = node.tagName?.toLowerCase();

    switch (tagName) {
      case 'p': {
        const text = this.extractTextWithoutMedia($, node);
        if (text) {
          blocks.push({ type: 'paragraph', content: text });
        }
        this.pushImages($, node, blocks);
        this.pushVideos($, node, blocks);
        break;
      }

      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const level = parseInt(tagName[1], 10);
        blocks.push({ type: 'heading', level, content: $(node).text().trim() });
        break;
      }

      case 'blockquote':
        blocks.push({ type: 'quote', content: $(node).text().trim() });
        break;

      case 'pre': {
        const code = $(node).find('code').text() || $(node).text();
        const lang = $(node).find('code').attr('class')?.replace('language-', '') || '';
        blocks.push({ type: 'code', content: code, language: lang });
        break;
      }

      case 'ul':
      case 'ol': {
        const items: string[] = [];
        $(node).find('li').each((_, li) => {
          const text = $(li).text().trim();
          if (text) items.push(text);
        });
        if (items.length > 0) {
          blocks.push({ type: 'list', items, ordered: tagName === 'ol' });
        }
        break;
      }

      case 'img': {
        const src = this.extractImageUrl($(node));
        if (src) {
          blocks.push({ type: 'image', url: this.normalizeUrl(src), alt: $(node).attr('alt') || '' });
        }
        break;
      }

      case 'a': {
        const href = $(node).attr('href');
        const text = $(node).text().trim();
        if (href && text) {
          blocks.push({ type: 'link', url: href, title: text });
        }
        break;
      }

      case 'iframe':
      case 'video':
      case 'mp-video': {
        const videoUrl = this.extractMediaUrl($(node));
        if (videoUrl) {
          const thumbnail = $(node).attr('data-cover') || $(node).attr('poster') || undefined;
          blocks.push({
            type: 'video',
            url: this.normalizeUrl(videoUrl),
            thumbnail: thumbnail ? this.normalizeUrl(thumbnail) : undefined,
          });
        }
        break;
      }

      case 'section':
      case 'figure':
      case 'span':
      case 'div':
        this.processChildren($, node, blocks);
        break;

      default:
        this.processChildren($, node, blocks);
    }
  }

  private extractTextWithoutMedia($: cheerio.CheerioAPI, node: Element): string {
    const clone = $(node).clone();
    clone.find('img, iframe, video, mp-video').remove();
    return clone.text().replace(/\s+/g, ' ').trim();
  }

  private pushImages(
    $: cheerio.CheerioAPI,
    node: Element,
    blocks: Block[]
  ): void {
    $(node).find('img').each((_, img) => {
      const src = this.extractImageUrl($(img));
      if (!src) return;
      blocks.push({
        type: 'image',
        url: this.normalizeUrl(src),
        alt: $(img).attr('alt') || '',
      });
    });
  }

  private pushVideos(
    $: cheerio.CheerioAPI,
    node: Element,
    blocks: Block[]
  ): void {
    $(node).find('iframe, video, mp-video').each((_, media) => {
      const mediaNode = $(media);
      const videoUrl = this.extractMediaUrl(mediaNode);
      if (!videoUrl) return;
      const thumbnail = mediaNode.attr('data-cover') || mediaNode.attr('poster') || undefined;
      blocks.push({
        type: 'video',
        url: this.normalizeUrl(videoUrl),
        thumbnail: thumbnail ? this.normalizeUrl(thumbnail) : undefined,
      });
    });
  }

  private extractImageUrl(node: cheerio.Cheerio<Element>): string | undefined {
    const dataSrc = node.attr('data-src') || node.attr('data-original');
    const src = dataSrc || node.attr('src') || '';
    if (!src || src.startsWith('data:image')) return undefined;
    return src;
  }

  private extractMediaUrl(node: cheerio.Cheerio<Element>): string | undefined {
    return (
      node.attr('data-src') ||
      node.attr('src') ||
      node.attr('data-url') ||
      node.find('source').attr('src') ||
      node.attr('srcdoc') ||
      ''
    ) || undefined;
  }

  private normalizeUrl(url: string): string {
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    return url;
  }
}
