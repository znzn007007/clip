# 图片位置修复实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 Twitter adapter 的图片位置问题，使图片在导出的 Markdown 文件中出现在正确的段落级位置。

**架构:** 采用 Buffer Token Array + DFS 遍历方式，从 article 根节点开始按 DOM 顺序生成 blocks。行内元素（text、link、hashtag）累积到 buffer，块级元素（img、video）触发 flush。

**Tech Stack:** TypeScript, Cheerio, Jest

---

## Task 1: 编写 TwitterHtmlToBlocks 单元测试（TDD）

**Files:**
- Create: `src/core/extract/adapters/twitter/__tests__/html-to-blocks.test.ts`

**Step 1: 创建测试文件**

```typescript
import { TwitterHtmlToBlocks } from '../html-to-blocks.js';

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
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[0].content).toBe('Text before');
      expect(blocks[1].type).toBe('image');
      expect(blocks[1].url).toBe('https://pbs.twimg.com/media/1.jpg?name=orig');
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
    it('hashtag 应该转换为 markdown 链接', () => {
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
});
```

**Step 2: 运行测试确认失败（预期）**

```bash
npm test -- html-to-blocks
```

Expected: FAIL - "TwitterHtmlToBlocks is not defined" 或类似错误

**Step 3: 提交测试文件**

```bash
git add src/core/extract/adapters/twitter/__tests__/html-to-blocks.test.ts
git commit -m "test: add TwitterHtmlToBlocks unit tests (TDD - failing first)"
```

---

## Task 2: 实现 TwitterHtmlToBlocks 类

**Files:**
- Create: `src/core/extract/adapters/twitter/html-to-blocks.ts`

**Step 1: 创建实现文件**

```typescript
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

    const $articles = $('article[data-testid="tweet"]');

    $articles.each((_, article) => {
      if (blocks.length > 0) {
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
      const text = (node as any).data?.replace(/\s+/g, ' ').trim();
      if (text) {
        buffer.push({ type: 'text', content: text });
      }
      return;
    }

    if (node.type !== 'tag') return;

    const $node = $(node);
    const tagName = (node as Element).tagName?.toLowerCase();

    switch (tagName) {
      case 'a':
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
        merged[merged.length - 1].content += token.content;
      } else {
        merged.push(token);
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

    if (markdown.trim()) {
      blocks.push({ type: 'paragraph', content: markdown.trim() });
    }

    buffer.length = 0;
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

**Step 2: 运行测试**

```bash
npm test -- html-to-blocks
```

Expected: PASS（或部分失败，根据实际情况调整）

**Step 3: 修复任何失败的测试**

**Step 4: 再次运行测试确认通过**

```bash
npm test -- html-to-blocks
```

**Step 5: 提交**

```bash
git add src/core/extract/adapters/twitter/html-to-blocks.ts
git commit -m "feat: implement TwitterHtmlToBlocks with DFS and buffer mechanism"
```

---

## Task 3: 修改 TwitterAdapter 使用新的 TwitterHtmlToBlocks

**Files:**
- Modify: `src/core/extract/adapters/twitter.ts`

**Step 1: 添加 TweetMetadata 接口**

在 import 语句之后添加：

```typescript
interface TweetMetadata {
  author: string;
  publishedAt?: string;
  tweetData: TweetData | null;
}
```

**Step 2: 重写 extract 方法**

```typescript
export class TwitterAdapter extends BaseAdapter {
  // ... 现有属性保持不变

  async extract(page: RenderedPage): Promise<ExtractResult> {
    const warnings: string[] = [];

    // Step 1: Extract metadata first (async)
    const metadata = await this.extractMetadata(page, warnings);

    // Step 2: Generate blocks from HTML (primary path, correct positions)
    if (page.html) {
      try {
        const { TwitterHtmlToBlocks } = await import('./twitter/html-to-blocks.js');
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
```

**Step 3: 添加 extractMetadata 方法**

```typescript
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
```

**Step 4: 修改 generateTitle 方法**

```typescript
  private generateTitle(blocks: Block[], tweetData: TweetData | null): string {
    const firstParagraph = blocks.find(b => b.type === 'paragraph');
    if (firstParagraph) {
      const text = (firstParagraph as any).content.slice(0, 50);
      return text.length < (firstParagraph as any).content.length ? text + '...' : text;
    }

    if (tweetData?.text) {
      const text = tweetData.text.slice(0, 50);
      return text.length < tweetData.text.length ? text + '...' : text;
    }

    return 'Unknown Tweet';
  }
```

**Step 5: 添加 extractAssets 方法**

```typescript
  private extractAssets(blocks: Block[]): { images: AssetImage[] } {
    const images = blocks
      .filter(b => b.type === 'image')
      .map(b => ({
        url: (b as any).url,
        alt: (b as any).alt || '',
      }));
    return { images };
  }
```

**Step 6: 删除旧方法**

删除 `extractFromRawData`、`extractFromHtml` 和 `buildDocFromTweets` 方法。

**Step 7: 运行测试**

```bash
npm test -- twitter.adapter
```

**Step 8: 提交**

```bash
git add src/core/extract/adapters/twitter.ts
git commit -m "feat: integrate TwitterHtmlToBlocks into TwitterAdapter"
```

---

## Task 4: 更新集成测试

**Files:**
- Modify: `src/core/extract/adapters/__tests__/twitter.adapter.test.ts`

**Step 1: 添加图片位置测试**

```typescript
describe('TwitterAdapter - 图片位置', () => {
  it('HTML 路径应该保持图片在正确位置', async () => {
    const mockHtmlWithImagesInOrder = `
      <article data-testid="tweet">
        <div data-testid="tweetText">Text before image</div>
        <img src="https://pbs.twimg.com/media/test1.jpg?name=small" alt="First">
        <div data-testid="tweetText">Text between images</div>
        <img src="https://pbs.twimg.com/media/test2.jpg?name=small" alt="Second">
      </article>
    `;

    const page = {
      url: 'https://x.com/user/status/123',
      html: mockHtmlWithImagesInOrder,
      rawData: undefined,
      page: undefined,
      canonicalUrl: 'https://x.com/user/status/123',
    };

    const result = await adapter.extract(page);
    const firstImageIndex = result.doc.blocks.findIndex(b => b.type === 'image');
    const firstParagraphIndex = result.doc.blocks.findIndex(b => b.type === 'paragraph');

    expect(firstImageIndex).toBeGreaterThan(firstParagraphIndex);
    expect(result.doc.blocks.filter(b => b.type === 'image').length).toBe(2);
  });

  it('HTML 失败时应该 fallback 到 rawData', async () => {
    const page = {
      url: 'https://x.com/user/status/123',
      html: '<div>invalid</div>',
      rawData: JSON.stringify({
        tweets: [{
          id: '123',
          text: 'Test tweet',
          author: { screenName: 'testuser', name: 'Test User' },
          createdAt: '2025-01-01T00:00:00Z',
          metrics: { likes: 0, retweets: 0, replies: 0, views: 0 },
          media: [],
          hashtags: [],
          urls: []
        }]
      }),
      page: undefined,
      canonicalUrl: 'https://x.com/user/status/123',
    };

    const result = await adapter.extract(page);
    expect(result.doc.blocks.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('Used fallback'))).toBe(true);
  });

  it('应该正确降级 metadata 到 @unknown', async () => {
    const page = {
      url: 'https://x.com/user/status/123',
      html: '<article data-testid="tweet"><div>Text</div></article>',
      rawData: null,
      page: undefined,
      canonicalUrl: 'https://x.com/user/status/123',
    };

    const result = await adapter.extract(page);
    expect(result.doc.author).toBe('@unknown');
  });
});
```

**Step 2: 运行测试**

```bash
npm test -- twitter.adapter
```

**Step 3: 修复任何失败**

**Step 4: 提交**

```bash
git add src/core/extract/adapters/__tests__/twitter.adapter.test.ts
git commit -m "test: add image position integration tests"
```

---

## Task 5: 构建验证

**Step 1: 运行构建**

```bash
npm run build
```

Expected: 构建成功，无 TypeScript 错误

**Step 2: 运行所有测试**

```bash
npm test
```

Expected: 所有测试通过

**Step 3: 如有需要，修复并提交**

```bash
git commit -am "fix: resolve build and test issues"
```

---

## Task 6: 更新文档

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/pending-tasks.md`

**Step 1: 更新 CLAUDE.md**

在 `## Known Issues` 部分删除：
```markdown
- **Image position** - Twitter images appear at end of document instead of inline (2026-01-19)
```

**Step 2: 更新 pending-tasks.md**

标记 P1 任务 "Image Position Fix" 为已完成。

**Step 3: 提交文档更新**

```bash
git add CLAUDE.md docs/pending-tasks.md
git commit -m "docs: remove image position from known issues"
```

---

## Task 7: 创建每日报告

**Files:**
- Create: `docs/dailyReport/2026-01-19-summary.md`

**Step 1: 创建报告文件**

```markdown
# 2026-01-19 每日报告

## 完成任务

### 图片位置修复 (P1)

- ✅ 设计完成：DFS + Buffer Token Array 架构
- ✅ 实现 TwitterHtmlToBlocks 类
- ✅ 集成到 TwitterAdapter
- ✅ 单元测试和集成测试
- ✅ 降级策略：HTML 主路径 → rawData fallback

### 技术细节

**核心改进：**
- 从 article 根节点做 DFS 遍历，保证 DOM 顺序
- Buffer Token Array 处理行内元素（text、link、hashtag）
- 块级元素（img、video）触发 buffer flush
- hashtag 只存 tag（不含 #），url 从 tag 推导
- @handle 从 href 提取，而非显示名
- div 不作为段落边界，避免过度 flush

**降级策略：**
| rawData/DOM | HTML blocks | 结果 |
|-------------|-------------|------|
| ✅ 成功 | ✅ 成功 | 正常返回 |
| ✅ 成功 | ❌ 失败 | rawData fallback |
| ❌ 失败 | ✅ 成功 | HTML blocks + @unknown |
| ❌ 失败 | ❌ 失败 | 抛 PARSE_FAILED |

## 测试

- 单元测试：TwitterHtmlToBlocks
- 集成测试：TwitterAdapter
- 测试覆盖：Buffer 机制、Link/Hashtag、多 tweet、Skip 逻辑

## 文档

- 设计文档：`docs/plans/2026-01-19-image-position-fix-design.md`
- 实现计划：`docs/plans/2026-01-19-image-position-fix.md`

## 待办事项

- [ ] 浏览器策略重构
- [ ] CDP 连接测试
- [ ] 配置文件支持
```

**Step 2: 提交**

```bash
git add docs/dailyReport/2026-01-19-summary.md
git commit -m "docs: add daily report for 2026-01-19"
```

---

## 最终验证

**Step 1: 运行完整测试套件**

```bash
npm test
```

**Step 2: 确认构建**

```bash
npm run build
```

**Step 3: 检查 git 状态**

```bash
git status
git log --oneline -10
```

---

## 相关文档

- 设计文档：`docs/plans/2026-01-19-image-position-fix-design.md`
- 项目指引：`CLAUDE.md`
- 类型定义：`src/core/types/index.ts`
- BaseAdapter：`src/core/extract/adapters/base.ts`