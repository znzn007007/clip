import * as cheerio from 'cheerio';
import type { AnyNode, Element, Text } from 'domhandler';
import type { Block } from '../../../types/index.js';

export class ZhihuHtmlToBlocks {
  /**
   * Convert Zhihu HTML content to Block array
   */
  convert(html: string): Block[] {
    const $ = cheerio.load(html);
    const blocks: Block[] = [];

    // Process top-level elements
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
        const text = (node as Text).data?.trim();
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
      case 'p':
        blocks.push({ type: 'paragraph', content: $(node).text().trim() });
        break;

      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        const level = parseInt(tagName[1], 10);
        blocks.push({ type: 'heading', level, content: $(node).text().trim() });
        break;

      case 'blockquote':
        blocks.push({ type: 'quote', content: $(node).text().trim() });
        break;

      case 'pre':
        const code = $(node).find('code').text();
        const lang = $(node).find('code').attr('class')?.replace('language-', '') || '';
        blocks.push({ type: 'code', content: code, language: lang });
        break;

      case 'ul':
      case 'ol':
        const items: string[] = [];
        $(node).find('li').each((_, li) => {
          items.push($(li).text().trim());
        });
        blocks.push({ type: 'list', items, ordered: tagName === 'ol' });
        break;

      case 'img':
        const src = $(node).attr('src');
        if (src) {
          blocks.push({ type: 'image', url: src, alt: $(node).attr('alt') || '' });
        }
        break;

      case 'a':
        const href = $(node).attr('href');
        const text = $(node).text().trim();
        if (href && text) {
          blocks.push({ type: 'link', url: href, title: text });
        }
        break;

      default:
        // Recursively process other tags
        this.processChildren($, node, blocks);
    }
  }
}
