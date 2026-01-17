# Zhihu Content Parsing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Zhihu content parsing supporting articles and answers with dual-path parsing (raw data + Cheerio fallback).

**Architecture:** Hybrid parsing approach - primary path extracts Zhihu's internal data via `page.evaluate`, fallback path uses Cheerio for HTML parsing. ZhihuParser converts to ZhihuData, ZhihuHtmlToBlocks converts HTML to Block[], ZhihuAdapter assembles final output.

**Tech Stack:** TypeScript, Cheerio 1.0.0 (already installed), Playwright (existing), Jest (existing)

---

## Task 1: Create Zhihu Directory Structure ✅

**Files:**
- Create: `src/core/extract/adapters/zhihu/`
- Create: `src/core/extract/adapters/zhihu/index.ts` (empty export)
- Create: `src/core/extract/adapters/zhihu/parser.ts` (empty)
- Create: `src/core/extract/adapters/zhihu/html-to-blocks.ts` (empty)
- Create: `src/core/extract/adapters/zhihu/errors.ts` (empty)

**Step 1: Create directory and empty files**

Run: `mkdir -p src/core/extract/adapters/zhihu`

Create placeholder files:
```bash
touch src/core/extract/adapters/zhihu/index.ts
touch src/core/extract/adapters/zhihu/parser.ts
touch src/core/extract/adapters/zhihu/html-to-blocks.ts
touch src/core/extract/adapters/zhihu/errors.ts
```

**Step 2: Verify directory created**

Run: `ls -la src/core/extract/adapters/zhihu/`
Expected: List of 4 empty files

**Step 3: Commit**

```bash
git add src/core/extract/adapters/zhihu/
git commit -m "feat(zhihu): create directory structure for Zhihu adapter"
```

---

## Task 2: Create ZhihuExtractError ✅

**Files:**
- Modify: `src/core/extract/adapters/zhihu/errors.ts`

**Step 1: Implement ZhihuExtractError class**

Open `src/core/extract/adapters/zhihu/errors.ts`, add:

```typescript
export class ZhihuExtractError extends Error {
  constructor(
    message: string,
    public readonly code: 'CONTENT_NOT_FOUND' | 'PARSE_FAILED' | 'LOGIN_REQUIRED',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ZhihuExtractError';
    Object.setPrototypeOf(this, ZhihuExtractError.prototype);
  }
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/core/extract/adapters/zhihu/errors.ts
git commit -m "feat(zhihu): add ZhihuExtractError class"
```

---

## Task 3: Create ZhihuHtmlToBlocks ✅

**Files:**
- Modify: `src/core/extract/adapters/zhihu/html-to-blocks.ts`

**Step 1: Implement ZhihuHtmlToBlocks class**

Open `src/core/extract/adapters/zhihu/html-to-blocks.ts`, add:

```typescript
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { Block } from '../../types/index.js';

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
        const text = (node as cheerio.TextElement).data?.trim();
        if (text) {
          blocks.push({ type: 'paragraph', content: text });
        }
      } else if (node.type === 'tag') {
        this.convertTag($, node as cheerio.Element, blocks);
      }
    });
  }

  private convertTag(
    $: cheerio.CheerioAPI,
    node: cheerio.Element,
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
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/core/extract/adapters/zhihu/html-to-blocks.ts
git commit -m "feat(zhihu): add ZhihuHtmlToBlocks for HTML to Block conversion"
```

---

## Task 4: Create ZhihuParser ✅

**Files:**
- Modify: `src/core/extract/adapters/zhihu/parser.ts`

**Step 1: Implement ZhihuParser class**

Open `src/core/extract/adapters/zhihu/parser.ts`, add:

```typescript
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

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
    const isAnswer = /\/question\/\d+\/answer\/\d+/.test(url);

    if (isAnswer) {
      return this.parseAnswer($, url);
    }
    return this.parseArticle($, url);
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
      if (src) images.push(this.toHighRes(src));
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

  private parseArticle($: cheerio.CheerieAPI, _url: string): ZhihuData {
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
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/core/extract/adapters/zhihu/parser.ts
git commit -m "feat(zhihu): add ZhihuParser with Cheerio extraction"
```

---

## Task 5: Create ZhihuAdapter ✅

**Files:**
- Modify: `src/core/extract/adapters/zhihu/index.ts`

**Step 1: Implement ZhihuAdapter class**

Open `src/core/extract/adapters/zhihu/index.ts`, add:

```typescript
import { BaseAdapter } from '../base.js';
import type { ExtractResult } from '../../types.js';
import type { RenderedPage } from '../../render/types.js';
import type { ClipDoc, Block } from '../../types/index.js';
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
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/core/extract/adapters/zhihu/index.ts
git commit -m "feat(zhihu): implement ZhihuAdapter with dual-path parsing"
```

---

## Task 6: Register ZhihuAdapter ✅

**Files:**
- Modify: `src/core/extract/registry.ts`

**Step 1: Import and register ZhihuAdapter**

Open `src/core/extract/registry.ts`, add import:

```typescript
import { ZhihuAdapter } from './adapters/zhihu/index.js';
```

Add to adapters array in AdapterRegistry constructor:

```typescript
export class AdapterRegistry {
  private adapters: Adapter[] = [
    new TwitterAdapter(),
    new ZhihuAdapter(),  // Add this line
  ];
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/core/extract/registry.ts
git commit -m "feat(zhihu): register ZhihuAdapter in registry"
```

---

## Task 7: Update PageRenderer for Zhihu ✅

**Files:**
- Modify: `src/core/render/page.ts`

**Step 1: Add Zhihu-specific rawData extraction**

Open `src/core/render/page.ts`, find the `extractTwitterRawData` method, add after it:

```typescript
private async extractZhihuRawData(page: Page): Promise<string | undefined> {
  try {
    const data = await page.evaluate(() => {
      // Try to extract from __STATE__ or similar
      const state = (window as any).__INITIAL_STATE__;
      if (state) return JSON.stringify(state);

      // Fallback: extract from script tags
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.includes('question') && text.includes('answer')) {
          const match = text.match(/({.*})/);
          if (match) return match[0];
        }
      }
      return undefined;
    });
    return data;
  } catch {
    return undefined;
  }
}
```

**Step 2: Update render method to call Zhihu extraction**

Find the platform detection section, add:

```typescript
let rawData: string | undefined;
if (platform === 'twitter') {
  rawData = await this.extractTwitterRawData(page);
} else if (platform === 'zhihu') {
  rawData = await this.extractZhihuRawData(page);
}
```

**Step 3: Build to verify**

Run: `npm run build`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/core/render/page.ts
git commit -m "feat(render): add Zhihu raw data extraction"
```

---

## Task 8: End-to-End Testing ✅

**Files:**
- (No new files, use existing CLI)

**Step 1: Build the project**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Test with a Zhihu article URL**

Run: `node dist/cli/index.js once "https://zhuanlan.zhihu.com/p/123456789" --debug`

Expected output (may fail if URL doesn't exist):
```
Archiving: https://zhuanlan.zhihu.com/p/123456789
```

**Step 3: Test with a Zhihu answer URL**

Run: `node dist/cli/index.js once "https://www.zhihu.com/question/12345/answer/67890" --debug`

**Step 4: Verify output file structure**

Run: `ls -R clips/zhihu/` (if content was created)

**Step 5: Commit implementation plan completion**

```bash
git add docs/plans/2026-01-17-zhihu-content-parsing-implementation.md
git commit -m "docs: complete Zhihu content parsing implementation plan"
```

---

## Summary

This implementation adds:

1. **Zhihu directory structure** - Organized adapter files
2. **ZhihuExtractError** - Custom error class with error codes
3. **ZhihuHtmlToBlocks** - Converts Zhihu HTML to Block array
4. **ZhihuParser** - Extracts data from articles and answers
5. **ZhihuAdapter** - Main adapter with dual-path parsing
6. **Registry integration** - ZhihuAdapter registered
7. **PageRenderer enhancement** - Zhihu raw data extraction

**Next Steps** (beyond M1):
- Implement actual raw state parsing in `parseFromRawState`
- Add unit tests for parser and HTML converter
- Handle edge cases (login walls, deleted content, pagination)
