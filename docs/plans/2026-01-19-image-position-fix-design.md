# 图片位置修复设计文档

**日期**: 2026-01-19
**状态**: 设计完成，待实现

## 概述

修复 Twitter、WeChat、Zhihu 三个平台的图片位置问题，确保图片在导出的 Markdown 文件中出现在正确的段落级位置。

## 问题分析

### 当前状态

| 平台 | 当前实现 | 图片位置是否正确 |
|------|---------|-----------------|
| WeChat | `WeChatHtmlToBlocks` 按 DOM 顺序遍历 | ✅ 正确 |
| Zhihu | `ZhihuHtmlToBlocks` 按 DOM 顺序遍历 | ✅ 正确 |
| Twitter | `TwitterBlockBuilder` 先文字后批量添加图片 | ❌ 图片全部在末尾 |

### 问题根源

Twitter adapter 当前的提取路径：

```
rawData/DOM → TweetData → TwitterBlockBuilder.tweetToBlocks()
```

`TweetData.media` 数组只包含图片 URL，**没有位置信息**，导致 `TwitterBlockBuilder` 只能把所有图片 block 批量添加到文字后面。

## 架构设计

### 整体架构

采用**主路径 + Fallback** 的三路径设计：

```
┌─────────────────────────────────────────────────────────────┐
│                     TwitterAdapter                           │
│                                                              │
│  Path 1 (Primary - HTML):                                    │
│    RenderedPage.html → TwitterHtmlToBlocks → Block[]         │
│    ✅ 图片在正确位置                                         │
│                                                              │
│  Path 2 (Metadata Extraction):                               │
│    rawData/DOM → TweetData → 提取 author/publishedAt        │
│    (仅用于元数据，不用于 blocks)                             │
│                                                              │
│  Path 3 (Last Resort):                                       │
│    rawData → TweetData → TwitterBlockBuilder → Block[]       │
│    ⚠️ 图片在末尾，保证基本可用                              │
└─────────────────────────────────────────────────────────────┘
```

### 设计原则

1. **DOM 顺序为中心**：一次 DFS 遍历，遇到元素立即生成 block
2. **Buffer 机制**：行内元素累积到 buffer，块级元素触发 flush
3. **优先正确性**：默认使用 HTML 路径保证图片位置正确
4. **保持可用性**：rawData 路径作为 fallback，确保即使 HTML 解析失败也能工作
5. **多 tweet 支持**：处理所有 `article[data-testid="tweet"]`，插入 `---` 分隔符

## 实现细节

### 新增文件：`src/core/extract/adapters/twitter/html-to-blocks.ts`

```typescript
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { Block } from '../../../types/index.js';

// Buffer token types - hashtag stores tag WITHOUT #
type BufferToken =
  | { type: 'text'; content: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'hashtag'; tag: string }; // tag: "Tech" not "#Tech"

// Skip selectors - precise list to avoid false positives
const SKIP_SELECTORS = [
  '[data-testid="User-Name"]',
  '[data-testid="UserActions"]',
  '[role="group"]',
  'time',
  'svg',
  'header',
  'footer',
  'nav',
  'aside',
  '[data-testid="card.layoutLarge.media"]',
  '[data-testid="reply"]',
  '[data-testid="retweet"]',
  '[data-testid="like"]',
  '[data-testid="views"]',
];

export class TwitterHtmlToBlocks {
  /**
   * Convert Twitter HTML to Block array using DFS traversal
   */
  convert(html: string): Block[] {
    const $ = cheerio.load(html);
    const blocks: Block[] = [];
    const buffer: BufferToken[] = [];

    // Process all tweets on page
    const $articles = $('article[data-testid="tweet"]');

    $articles.each((_, article) => {
      // Add separator between tweets
      if (blocks.length > 0) {
        this.flushBuffer(buffer, blocks);
        blocks.push({ type: 'paragraph', content: '---' });
      }

      // DFS from article root
      this.dfsTraverse($, $(article)[0], blocks, buffer);
    });

    // Final flush
    this.flushBuffer(buffer, blocks);

    return blocks;
  }

  /**
   * Core DFS: traverse DOM in order, use buffer for inline elements
   */
  private dfsTraverse(
    $: cheerio.CheerioAPI,
    node: AnyNode,
    blocks: Block[],
    buffer: BufferToken[]
  ): void {
    // Skip non-content nodes
    if (this.shouldSkipNode($, node)) return;

    if (node.type === 'text') {
      const text = (node as any).data?.replace(/\s+/g, ' ').trim();
      if (text) {
        buffer.push({ type: 'text', content: text });
      }
      return;
    }

    if (node.type !== 'tag') return;

    const $node = $(node);
    const tagName = (node as Element).tagName?.toLowerCase();

    // Handle inline elements - add to buffer
    switch (tagName) {
      case 'a':
        this.handleLinkInline($node, buffer);
        return; // Don't recurse into links

      case 'br':
        // <br> triggers flush to create paragraph break
        this.flushBuffer(buffer, blocks);
        return;

      case 'p':
      case 'div':
        // Paragraph boundary - flush after processing children
        $node.contents().each((_, child) => {
          this.dfsTraverse($, child, blocks, buffer);
        });
        this.flushBuffer(buffer, blocks);
        return;

      case 'span':
        // Transparent, continue to children
        break;

      // Handle block elements - flush buffer first
      case 'img':
        this.flushBuffer(buffer, blocks);
        this.handleImage($node, blocks);
        return;

      case 'video':
        this.flushBuffer(buffer, blocks);
        this.handleVideo($node, blocks);
        return;

      case 'blockquote':
        // Check if this is a quoted tweet card
        if (this.isQuotedTweetCard($, $node)) {
          this.flushBuffer(buffer, blocks);
          this.handleQuotedTweet($, $node, blocks);
          return;
        }
        break;

      default:
        break;
    }

    // Default: recurse into children
    $node.contents().each((_, child) => {
      this.dfsTraverse($, child, blocks, buffer);
    });
  }

  private handleLinkInline($a: cheerio.Cheerio<any>, buffer: BufferToken[]): void {
    const href = $a.attr('href');
    const text = $a.text().trim();

    if (!href) {
      // No href - keep as plain text
      if (text) buffer.push({ type: 'text', content: text });
      return;
    }

    if (href.startsWith('/hashtag/')) {
      // Hashtag - store WITHOUT #
      const tag = text.startsWith('#') ? text.slice(1) : text;
      buffer.push({
        type: 'hashtag',
        tag,
        url: `https://x.com${href}`,
      });
    } else if (href.startsWith('http')) {
      // External link
      buffer.push({ type: 'link', text, url: href });
    } else {
      // Relative link - keep as plain text
      if (text) buffer.push({ type: 'text', content: text });
    }
  }

  private flushBuffer(buffer: BufferToken[], blocks: Block[]): void {
    if (buffer.length === 0) return;

    // Merge adjacent text tokens first
    const merged: BufferToken[] = [];
    for (const token of buffer) {
      if (token.type === 'text' && merged.length > 0 && merged[merged.length - 1].type === 'text') {
        merged[merged.length - 1].content += token.content;
      } else {
        merged.push(token);
      }
    }

    // Convert to markdown
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
          // Add # during rendering, tag doesn't have it
          markdown += `[#${token.tag}](https://x.com/hashtag/${token.tag})`;
          break;
      }
    }

    if (markdown.trim()) {
      blocks.push({ type: 'paragraph', content: markdown.trim() });
    }

    buffer.length = 0; // Clear buffer
  }

  private handleImage($img: cheerio.Cheerio<any>, blocks: Block[]): void {
    const url = $img.attr('src');
    if (!url || url.includes('profile_images')) return;

    blocks.push({
      type: 'image',
      url: url.replace(/&name=\w+/, '&name=orig'),
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

  private handleQuotedTweet(
    $: cheerio.CheerioAPI,
    $node: cheerio.Cheerio<any>,
    blocks: Block[]
  ): void {
    // Extract text from the quoted tweet, excluding UI elements
    const $clone = $node.clone();
    $clone.find('[data-testid="UserActions"], [role="group"], time, svg').remove();

    const text = $clone.text().trim();
    const $link = $clone.find('a[href*="/status/"]').first();
    const url = $link.attr('href');

    blocks.push({
      type: 'quote',
      content: text,
      sourceUrl: url ? `https://x.com${url}` : undefined,
    });
  }

  private isQuotedTweetCard($: cheerio.CheerioAPI, $node: cheerio.Cheerio<any>): boolean {
    // Check if this blockquote contains a nested tweet
    // but is NOT the main tweet's text container
    const hasNestedTweet = $node.find('article[data-testid="tweet"]').length > 0;
    const isMainTweetText = $node.is('[data-testid="tweetText"]') ||
                           $node.parent().is('[data-testid="tweetText"]');

    return hasNestedTweet && !isMainTweetText;
  }

  private shouldSkipNode($: cheerio.CheerioAPI, node: AnyNode): boolean {
    if (node.type !== 'tag') return false;

    const $node = $(node);

    for (const selector of SKIP_SELECTORS) {
      if ($node.is(selector)) return true;
    }

    return false;
  }
}
```

### 修改文件：`src/core/extract/adapters/twitter.ts`

```typescript
export class TwitterAdapter extends BaseAdapter {
  async extract(page: RenderedPage): Promise<ExtractResult> {
    const warnings: string[] = [];

    // Step 1: Extract metadata first (async)
    const metadata = await this.extractMetadata(page, warnings);

    // Step 2: Generate blocks from HTML (primary path, correct positions)
    if (page.html) {
      try {
        const htmlToBlocks = new TwitterHtmlToBlocks();
        const blocks = htmlToBlocks.convert(page.html);

        if (blocks.length > 0) {
          return {
            doc: {
              platform: 'twitter',
              sourceUrl: page.url,
              canonicalUrl: page.canonicalUrl,
              title: this.generateTitle(blocks, metadata.tweetData),
              author: metadata.author,
              publishedAt: metadata.publishedAt,
              fetchedAt: new Date().toISOString(),
              blocks,
              assets: this.extractAssets(blocks),
            },
            warnings,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`HTML parsing failed: ${message}`);
      }
    }

    // Step 3: Fallback to rawData → BlockBuilder (images at end)
    if (metadata.tweetData) {
      const blocks = this.blockBuilder.tweetToBlocks(metadata.tweetData);
      return {
        doc: {
          platform: 'twitter',
          sourceUrl: page.url,
          canonicalUrl: page.canonicalUrl,
          title: this.generateTitle(blocks, metadata.tweetData),
          author: metadata.author,
          publishedAt: metadata.publishedAt,
          fetchedAt: new Date().toISOString(),
          blocks,
          assets: this.extractAssets(blocks),
        },
        warnings: [...warnings, 'Used fallback (images at end)'],
      };
    }

    // Step 4: Complete failure
    throw new TwitterExtractError('All extraction methods failed', 'PARSE_FAILED');
  }

  private async extractMetadata(
    page: RenderedPage,
    warnings: string[]
  ): Promise<TweetMetadata> {
    // Try rawData first
    if (page.rawData) {
      try {
        const parsed = JSON.parse(page.rawData);
        const tweets = this.parser.parseFromRawState(parsed);
        if (tweets.length > 0) {
          return {
            author: `@${tweets[0].author.screenName}`,
            publishedAt: tweets[0].createdAt,
            tweetData: tweets[0],
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`rawData parsing failed: ${message}`);
      }
    }

    // Try DOM extraction
    if (page.page) {
      try {
        const rawData = await this.domExtractor.extract(page.page);
        const tweets = this.parser.parseFromRawState(rawData);
        if (tweets.length > 0) {
          return {
            author: `@${tweets[0].author.screenName}`,
            publishedAt: tweets[0].createdAt,
            tweetData: tweets[0],
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`DOM extraction failed: ${message}`);
      }
    }

    // Fallback to HTML parsing for metadata only
    if (page.html) {
      try {
        const $ = cheerio.load(page.html);
        // Get @handle from href, not display name
        const href = $('[data-testid="User-Name"] a[href^="/"]').first().attr('href');
        const handle = href ? `@${href.slice(1)}` : '@unknown';

        const $time = $('time').first();
        const datetime = $time.attr('datetime');

        return {
          author: handle,
          publishedAt: datetime || undefined,
          tweetData: null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`HTML metadata extraction failed: ${message}`);
      }
    }

    // Complete fallback
    return {
      author: '@unknown',
      publishedAt: undefined,
      tweetData: null,
    };
  }

  private generateTitle(blocks: Block[], tweetData: TweetData | null): string {
    // Find first paragraph block
    const firstParagraph = blocks.find(b => b.type === 'paragraph');
    if (firstParagraph) {
      const text = (firstParagraph as any).content.slice(0, 50);
      return text.length < (firstParagraph as any).content.length ? text + '...' : text;
    }

    // Fallback to tweetData text
    if (tweetData?.text) {
      const text = tweetData.text.slice(0, 50);
      return text.length < tweetData.text.length ? text + '...' : text;
    }

    return 'Unknown Tweet';
  }

  private extractAssets(blocks: Block[]): { images: AssetImage[] } {
    const images = blocks
      .filter(b => b.type === 'image')
      .map(b => ({
        url: (b as any).url,
        alt: (b as any).alt || '',
      }));
    return { images };
  }
}

interface TweetMetadata {
  author: string;
  publishedAt?: string;
  tweetData: TweetData | null;
}
```

## 降级策略

| rawData/DOM | HTML blocks | 结果 |
|-------------|-------------|------|
| ✅ 成功 | ✅ 成功 | 正常返回（HTML blocks + rawData metadata） |
| ✅ 成功 | ❌ 失败 | rawData fallback（BlockBuilder，图片在末尾） |
| ❌ 失败 | ✅ 成功 | 返回（HTML blocks + HTML fallback metadata，可能 @unknown） |
| ❌ 失败 | ❌ 失败 | 抛 PARSE_FAILED |

## 测试策略

### 单元测试

**文件**: `src/core/extract/adapters/twitter/__tests__/html-to-blocks.test.ts`

```typescript
describe('TwitterHtmlToBlocks', () => {
  describe('Buffer 机制', () => {
    it('应该合并相邻的 text token', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">
            <span>Hello</span>
            <span> World</span>
          </div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual({
        type: 'paragraph',
        content: 'Hello World',
      });
    });

    it('应该在块级元素前 flush buffer', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">Text before</div>
          <img src="https://pbs.twimg.com/media/1.jpg?name=small">
          <div data-testid="tweetText">Text after</div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks).toEqual([
        { type: 'paragraph', content: 'Text before' },
        { type: 'image', url: 'https://pbs.twimg.com/media/1.jpg?name=orig', alt: '' },
        { type: 'paragraph', content: 'Text after' },
      ]);
    });

    it('应该在 <br> 时 flush buffer', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">Line 1<br>Line 2</div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks).toEqual([
        { type: 'paragraph', content: 'Line 1' },
        { type: 'paragraph', content: 'Line 2' },
      ]);
    });
  });

  describe('Link 和 Hashtag', () => {
    it('hashtag 应该存储不带 # 的 tag', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">
            <a href="/hashtag/Tech">#Tech</a>
          </div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks[0].content).toContain('[#Tech](https://x.com/hashtag/Tech)');
    });

    it('相对链接应该退化为 text', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">
            <a href="/user">@user</a>
          </div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks[0].content).toBe('@user');
      expect(blocks[0].content).not.toContain('[');
    });
  });

  describe('多 tweet 处理', () => {
    it('应该在多个 tweet 之间插入分隔符', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">First tweet</div>
        </article>
        <article data-testid="tweet">
          <div data-testid="tweetText">Second tweet</div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks).toEqual([
        { type: 'paragraph', content: 'First tweet' },
        { type: 'paragraph', content: '---' },
        { type: 'paragraph', content: 'Second tweet' },
      ]);
    });
  });

  describe('Skip 逻辑', () => {
    it('应该跳过 profile_images', () => {
      const html = `
        <article data-testid="tweet">
          <img src="https://pbs.twimg.com/profile_images/avatar.jpg">
          <img src="https://pbs.twimg.com/media/1.jpg">
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      const images = blocks.filter(b => b.type === 'image');
      expect(images).toHaveLength(1);
      expect(images[0].url).toContain('1.jpg');
    });

    it('应该跳过 UserActions', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">Hello</div>
          <div data-testid="UserActions">
            <a href="/like">Like</a>
          </div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].content).toBe('Hello');
    });
  });

  describe('引用推文', () => {
    it('应该正确识别并处理引用推文', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">Main tweet</div>
          <blockquote>
            <article data-testid="tweet">
              <div data-testid="tweetText">Quoted tweet</div>
            </article>
          </blockquote>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[0].content).toBe('Main tweet');
      expect(blocks[1].type).toBe('quote');
    });
  });
});
```

### 集成测试

**文件**: `src/core/extract/adapters/__tests__/twitter.adapter.test.ts`

```typescript
describe('TwitterAdapter - 图片位置', () => {
  it('HTML 路径应该保持图片在正确位置', async () => {
    const page = {
      url: 'https://x.com/user/status/123',
      html: mockHtmlWithImagesInOrder,
      rawData: undefined,
    };

    const result = await adapter.extract(page);
    const textBlockIndex = result.doc.blocks.findIndex(b => b.type === 'paragraph');
    const imageBlockIndex = result.doc.blocks.findIndex(b => b.type === 'image');

    expect(imageBlockIndex).toBeGreaterThan(textBlockIndex);
  });

  it('HTML 失败时应该 fallback 到 rawData', async () => {
    const page = {
      url: 'https://x.com/user/status/123',
      html: '<div>invalid</div>',
      rawData: JSON.stringify({
        tweets: [{ id: '123', text: 'Test', author: { screenName: 'user' } }]
      }),
    };

    const result = await adapter.extract(page);
    expect(result.doc.blocks.length).toBeGreaterThan(0);
    expect(result.warnings).toContain('Used fallback (images at end)');
  });

  it('应该正确降级 metadata', async () => {
    const page = {
      url: 'https://x.com/user/status/123',
      html: '<article data-testid="tweet"><div>Text</div></article>',
      rawData: null,
    };

    const result = await adapter.extract(page);
    expect(result.doc.author).toBe('@unknown');
  });
});
```

## 文件清单

### 新增文件

- `src/core/extract/adapters/twitter/html-to-blocks.ts`
- `src/core/extract/adapters/twitter/__tests__/html-to-blocks.test.ts`

### 修改文件

- `src/core/extract/adapters/twitter.ts`
- `src/core/extract/adapters/__tests__/twitter.adapter.test.ts`

## 关键设计决策

### 为什么使用 Buffer Token Array 而不是 String？

- **类型安全**：每个 token 有明确类型，避免 markdown 格式错误
- **灵活性**：可以在 flush 前修改、合并、重排 tokens
- **可测试性**：更容易验证中间状态

### 为什么从 article 根开始 DFS 而不是从 tweetText 开始？

- **完整性**：确保不会漏掉作为 tweetText sibling 的媒体元素
- **正确顺序**：真实反映 DOM 中的元素顺序

### 为什么 <br> 要触发 flush 而不是插入 \n？

- **语义正确**：<br> 表示段落分隔，不是行内换行
- **避免歧义**：单段多行 vs 多段，flush 行为更明确

## 后续工作

实现完成后，更新以下文档：

- `CLAUDE.md`：移除 "Image position" 已知问题
- `README.md`：添加图片位置修复说明
- `docs/dailyReport/2026-01-19-summary.md`：记录实现进度