import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { Block } from '../../../types/index.js';

// Buffer token types
// 注意：hashtag 只存 tag（不含 #），url 可以从 tag 推导
type BufferToken =
  | { type: 'text'; content: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'hashtag'; tag: string };  // url: `https://x.com/hashtag/${tag}` 可推导

// Skip selectors - 移除 [role="group"] 避免误杀媒体容器
const SKIP_SELECTORS = [
  '[data-testid="User-Name"]',
  '[data-testid="UserActions"]',
  'time',
  'svg',
  'header',
  'footer',
  'nav',
  'aside',
];

export class TwitterHtmlToBlocks {
  convert(html: string): Block[] {
    const $ = cheerio.load(html);
    const blocks: Block[] = [];
    const buffer: BufferToken[] = [];

    // Only select tweets in the main thread area, not sidebar recommendations
    // Primary column contains the main thread, sidebar has "Who to follow" etc
    const $articles = $('div[data-testid="primaryColumn"] article[data-testid="tweet"]');

    console.error(`[DEBUG] TwitterHtmlToBlocks: found ${$articles.length} tweets in primary column`);

    $articles.each((index, article) => {
      // If this is not the first article, flush buffer and add separator
      if (index > 0) {
        this.flushBuffer(buffer, blocks);
        blocks.push({ type: 'paragraph', content: '---' });
      }
      this.dfsTraverse($, $(article)[0], blocks, buffer);
    });

    this.flushBuffer(buffer, blocks);
    return blocks;
  }

  private dfsTraverse(
    $: cheerio.CheerioAPI,
    node: AnyNode,
    blocks: Block[],
    buffer: BufferToken[]
  ): void {
    if (this.shouldSkipNode($, node)) return;

    if (node.type === 'text') {
      const text = (node as any).data;
      if (text) {
        // Normalize whitespace: replace newlines and multiple spaces with single space
        const normalized = text.replace(/\s+/g, ' ');
        buffer.push({ type: 'text', content: normalized });
      }
      return;
    }

    if (node.type !== 'tag') return;

    const $node = $(node);
    const tagName = (node as Element).tagName?.toLowerCase();

    switch (tagName) {
      case 'a':
        // Check if <a> contains block-level content (images, videos)
        // Twitter long-form articles wrap images in <a> tags
        if (this.hasBlockLevelContent($node)) {
          // Flush buffer before handling block content
          this.flushBuffer(buffer, blocks);
          // Recurse into children to extract images/videos
          $node.contents().each((_, child) => {
            this.dfsTraverse($, child, blocks, buffer);
          });
          return;
        }
        // Otherwise treat as inline link
        this.handleLinkInline($node, buffer);
        return;
      case 'br':
        this.flushBuffer(buffer, blocks);
        return;
      case 'p':
        // p 是段落边界，处理完子元素后 flush
        $node.contents().each((_, child) => {
          this.dfsTraverse($, child, blocks, buffer);
        });
        this.flushBuffer(buffer, blocks);
        return;
      case 'div':
        // div 不是段落边界，继续递归（避免过度 flush）
        $node.contents().each((_, child) => {
          this.dfsTraverse($, child, blocks, buffer);
        });
        return;
      case 'span':
        // span 是透明的，继续递归
        break;
      case 'img':
        this.flushBuffer(buffer, blocks);
        this.handleImage($node, blocks);
        return;
      case 'video':
        this.flushBuffer(buffer, blocks);
        this.handleVideo($node, blocks);
        return;
      default:
        break;
    }

    // 默认：递归处理子节点
    $node.contents().each((_, child) => {
      this.dfsTraverse($, child, blocks, buffer);
    });
  }

  private handleLinkInline($a: cheerio.Cheerio<any>, buffer: BufferToken[]): void {
    const href = $a.attr('href');
    const text = $a.text().trim();

    if (!href) {
      if (text) buffer.push({ type: 'text', content: text });
      return;
    }

    // Skip "Show more" and similar links
    const lowerText = text.toLowerCase();
    if (lowerText === 'show more' || lowerText === '显示更多') {
      return; // Skip this link entirely
    }

    if (href.startsWith('/hashtag/')) {
      // hashtag 只存 tag（不含 #），url 可推导
      const tag = text.startsWith('#') ? text.slice(1) : text;
      buffer.push({ type: 'hashtag', tag });
    } else if (href.startsWith('http')) {
      buffer.push({ type: 'link', text, url: href });
    } else {
      // 相对链接退化为 text
      if (text) buffer.push({ type: 'text', content: text });
    }
  }

  private flushBuffer(buffer: BufferToken[], blocks: Block[]): void {
    if (buffer.length === 0) return;

    // 合并相邻的 text token
    const merged: BufferToken[] = [];
    for (const token of buffer) {
      if (token.type === 'text' && merged.length > 0 && merged[merged.length - 1].type === 'text') {
        (merged[merged.length - 1] as { type: 'text'; content: string }).content += token.content;
      } else {
        merged.push(token);
      }
    }

    // Normalize whitespace in merged text tokens
    for (const token of merged) {
      if (token.type === 'text') {
        token.content = token.content.replace(/\s+/g, ' ').trim();
      }
    }

    // 转换为 markdown
    let markdown = '';
    for (const token of merged) {
      switch (token.type) {
        case 'text':
          markdown += token.content;
          break;
        case 'link':
          markdown += `[${token.text}](${token.url})`;
          break;
        case 'hashtag':
          // 从 tag 推导 url
          markdown += `[#${token.tag}](https://x.com/hashtag/${token.tag})`;
          break;
      }
    }

    // Trim final result to remove leading/trailing whitespace
    markdown = markdown.trim();

    if (markdown) {
      blocks.push({ type: 'paragraph', content: markdown });
    }

    buffer.length = 0;
  }

  private handleImage($img: cheerio.Cheerio<any>, blocks: Block[]): void {
    const url = $img.attr('src');
    if (!url || url.includes('profile_images')) return;

    // Replace name parameter with orig for highest quality
    // Handle both ?name= and &name= formats
    let processedUrl = url;
    if (url.includes('?name=')) {
      processedUrl = url.replace(/\?name=\w+/, '?name=orig');
    } else if (url.includes('&name=')) {
      processedUrl = url.replace(/&name=\w+/, '&name=orig');
    }

    blocks.push({
      type: 'image',
      url: processedUrl,
      alt: $img.attr('alt') || '',
    });
  }

  private handleVideo($video: cheerio.Cheerio<any>, blocks: Block[]): void {
    const src = $video.find('source').attr('src');
    if (!src) return;

    blocks.push({
      type: 'video',
      url: src,
      thumbnail: $video.attr('poster'),
    });
  }

  private shouldSkipNode($: cheerio.CheerioAPI, node: AnyNode): boolean {
    if (node.type !== 'tag') return false;

    const $node = $(node);
    for (const selector of SKIP_SELECTORS) {
      if ($node.is(selector)) return true;
    }

    return false;
  }

  /**
   * Check if an element contains block-level content like images or videos.
   * Used to distinguish between inline links and wrapper links.
   */
  private hasBlockLevelContent($elem: cheerio.Cheerio<any>): boolean {
    // Check for direct child images (excluding profile images)
    if ($elem.find('> img[src*="pbs.twimg.com"]').not('[src*="profile_images"]').length > 0) {
      return true;
    }
    // Check for nested images in div containers (Twitter's structure)
    if ($elem.find('div img[src*="pbs.twimg.com"]').not('[src*="profile_images"]').length > 0) {
      return true;
    }
    // Check for videos
    if ($elem.find('> video').length > 0) {
      return true;
    }
    // Check for nested videos
    if ($elem.find('div video').length > 0) {
      return true;
    }
    return false;
  }
}
