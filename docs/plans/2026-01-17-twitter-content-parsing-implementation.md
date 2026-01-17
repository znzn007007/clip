# Twitter Content Parsing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Twitter/X content parsing supporting single tweets and basic threads with dual-path parsing (raw data + Cheerio fallback).

**Architecture:** Hybrid parsing approach - primary path extracts Twitter's internal `__STATE__` data via `page.evaluate`, fallback path uses Cheerio for HTML parsing. TwitterParser converts raw data to TweetData[], TwitterBlockBuilder converts to Block[], ClipDoc assembles final output.

**Tech Stack:** TypeScript, Cheerio 1.0.0, Playwright (existing), Jest (existing)

---

## Task 1: Install Cheerio Dependency

**Files:**
- Modify: `package.json`

**Step 1: Add cheerio to dependencies**

Open `package.json`, add to `dependencies` section:

```json
{
  "dependencies": {
    "playwright": "^1.48.0",
    "commander": "^12.0.0",
    "cheerio": "^1.0.0"
  }
}
```

**Step 2: Install dependency**

Run: `npm install`

**Step 3: Verify installation**

Run: `npm list cheerio`
Expected: `cheerio@1.0.0`

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add cheerio for HTML parsing"
```

---

## Task 2: Add New Block Types to Core Types

**Files:**
- Modify: `src/core/types/index.ts`

**Step 1: Add new block type definitions**

Open `src/core/types/index.ts`, add after existing block types:

```typescript
export interface TweetMetaBlock {
  type: 'tweet_meta';
  likes: number;
  retweets: number;
  replies: number;
  views: number;
}

export interface HashtagBlock {
  type: 'hashtag';
  tag: string;
  url: string;
}
```

**Step 2: Update Block union type**

Find the `Block` type definition and add new types:

```typescript
export type Block =
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | CodeBlock
  | ListBlock
  | ImageBlock
  | LinkBlock
  | VideoBlock
  | TweetMetaBlock
  | HashtagBlock;
```

**Step 3: Build to verify types**

Run: `npm run build`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/core/types/index.ts
git commit -m "feat(types): add TweetMetaBlock and HashtagBlock types"
```

---

## Task 3: Create Twitter Parser Module

**Files:**
- Create: `src/core/extract/adapters/twitter/parser.ts`

**Step 1: Create TweetData interface and parser class**

Create `src/core/extract/adapters/twitter/parser.ts`:

```typescript
import * as cheerio from 'cheerio';

export interface TweetData {
  id: string;
  text: string;
  author: {
    screenName: string;
    displayName: string;
    avatarUrl?: string;
  };
  createdAt: string;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    views: number;
  };
  media: Array<{
    type: 'image' | 'video';
    url: string;
    thumbnailUrl?: string;
    alt?: string;
  }>;
  quotedTweet?: TweetData;
  hashtags: string[];
  urls: Array<{ url: string; displayUrl: string }>;
}

export class TwitterParser {
  /**
   * Parse from Twitter's raw state data
   */
  parseFromRawState(_rawState: unknown): TweetData[] {
    // For now, return empty - will be enhanced later
    return [];
  }

  /**
   * Parse from Cheerio element
   */
  parseFromCheerio($: cheerio.CheerioAPI, element: cheerio.Element): TweetData {
    const $el = $(element);

    return {
      id: this.extractId($, $el),
      text: this.extractText($, $el),
      author: this.extractAuthor($, $el),
      createdAt: this.extractTimestamp($, $el),
      metrics: this.extractMetrics($, $el),
      media: this.extractMedia($, $el),
      hashtags: this.extractHashtags($, $el),
      urls: this.extractUrls($, $el),
    };
  }

  private extractId($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): string {
    const permalink = $el.find('a[href*="/status/"]').first().attr('href');
    const match = permalink?.match(/\/status\/(\d+)/);
    return match?.[1] || '';
  }

  private extractText($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): string {
    const $textDiv = $el.find('[data-testid="tweetText"]');
    let text = $textDiv.text() || '';
    return text.replace(/\s+/g, ' ').trim();
  }

  private extractAuthor($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): TweetData['author'] {
    const $name = $el.find('[data-testid="User-Name"]').first();
    const displayName = $name.find('span').first().text().trim();
    const screenName = $name.find('a[href^="/"]').attr('href')?.slice(1) || '';
    const avatarUrl = $el.find('img[src*="profile_images"]').attr('src');
    return { screenName, displayName, avatarUrl };
  }

  private extractTimestamp($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): string {
    const $time = $el.find('time');
    const datetime = $time.attr('datetime');
    return datetime || new Date().toISOString();
  }

  private extractMetrics($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): TweetData['metrics'] {
    const parseCount = (selector: string): number => {
      const text = $el.find(selector).attr('aria-label') || '';
      const match = text.match(/(\d+)/);
      return match ? parseInt(match[1].replace(/,/g, '')) : 0;
    };

    return {
      replies: parseCount('[data-testid="reply"]'),
      retweets: parseCount('[data-testid="retweet"]'),
      likes: parseCount('[data-testid="like"]'),
      views: parseCount('[data-testid="views"]'),
    };
  }

  private extractMedia($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): TweetData['media'] {
    const media: TweetData['media'] = [];

    $el.find('img[src*="media"]').each((_, img) => {
      const $img = $(img);
      const url = $img.attr('src');
      if (url && !url.includes('profile_images')) {
        const highResUrl = url.replace(/&name=\w+/, '&name=orig');
        media.push({
          type: 'image',
          url: highResUrl,
          alt: $img.attr('alt') || '',
        });
      }
    });

    $el.find('video').each((_, video) => {
      const $video = $(video);
      const poster = $video.attr('poster');
      media.push({
        type: 'video',
        url: $video.find('source').attr('src') || '',
        thumbnailUrl: poster,
      });
    });

    return media;
  }

  private extractHashtags($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): string[] {
    const hashtags: string[] = [];
    $el.find('a[href^="/hashtag/"]').each((_, a) => {
      const tag = $(a).text().trim();
      if (tag.startsWith('#')) {
        hashtags.push(tag);
      }
    });
    return hashtags;
  }

  private extractUrls($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): TweetData['urls'] {
    const urls: TweetData['urls'] = [];
    $el.find('a[href^="http"]').not('[href*="/"]').each((_, a) => {
      urls.push({
        url: $(a).attr('href') || '',
        displayUrl: $(a).text().trim(),
      });
    });
    return urls;
  }
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/core/extract/adapters/twitter/parser.ts
git commit -m "feat(twitter): add TwitterParser with Cheerio extraction"
```

---

## Task 4: Create Twitter Block Builder

**Files:**
- Create: `src/core/extract/adapters/twitter/block-builder.ts`

**Step 1: Create block builder class**

Create `src/core/extract/adapters/twitter/block-builder.ts`:

```typescript
import type { Block } from '../../types/index.js';
import type { TweetData } from './parser.js';

export class TwitterBlockBuilder {
  /**
   * Convert TweetData to Block array
   */
  tweetToBlocks(tweet: TweetData): Block[] {
    const blocks: Block[] = [];

    // Tweet text content
    if (tweet.text) {
      blocks.push({
        type: 'paragraph',
        content: this.formatTweetText(tweet),
      });
    }

    // Hashtags
    for (const hashtag of tweet.hashtags) {
      blocks.push({
        type: 'hashtag',
        tag: hashtag,
        url: `https://x.com/hashtag/${hashtag.slice(1)}`,
      });
    }

    // Images
    for (const media of tweet.media) {
      if (media.type === 'image') {
        blocks.push({
          type: 'image',
          url: media.url,
          alt: media.alt || '',
        });
      } else if (media.type === 'video') {
        blocks.push({
          type: 'video',
          url: media.url,
          thumbnail: media.thumbnailUrl,
        });
      }
    }

    // External links
    for (const urlData of tweet.urls) {
      blocks.push({
        type: 'link',
        url: urlData.url,
        title: urlData.displayUrl,
      });
    }

    // Quoted tweet
    if (tweet.quotedTweet) {
      blocks.push({
        type: 'quote',
        content: tweet.quotedTweet.text,
        author: `@${tweet.quotedTweet.author.screenName}`,
        sourceUrl: `https://x.com/i/status/${tweet.quotedTweet.id}`,
        publishedAt: tweet.quotedTweet.createdAt,
      });
    }

    // Metadata
    blocks.push({
      type: 'tweet_meta',
      likes: tweet.metrics.likes,
      retweets: tweet.metrics.retweets,
      replies: tweet.metrics.replies,
      views: tweet.metrics.views,
    });

    return blocks;
  }

  private formatTweetText(tweet: TweetData): string {
    let text = tweet.text;
    // Replace short URLs with markdown links
    for (const urlData of tweet.urls) {
      text = text.replace(urlData.url, `[${urlData.displayUrl}](${urlData.url})`);
    }
    return text;
  }
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/core/extract/adapters/twitter/block-builder.ts
git commit -m "feat(twitter): add TwitterBlockBuilder for Block conversion"
```

---

## Task 5: Create Error Classes

**Files:**
- Create: `src/core/extract/adapters/twitter/errors.ts`

**Step 1: Create error class**

Create `src/core/extract/adapters/twitter/errors.ts`:

```typescript
export class TwitterExtractError extends Error {
  constructor(
    message: string,
    public readonly code: 'NO_TWEETS' | 'PARSE_FAILED' | 'INCOMPLETE_DATA',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TwitterExtractError';
  }
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/core/extract/adapters/twitter/errors.ts
git commit -m "feat(twitter): add TwitterExtractError class"
```

---

## Task 6: Rewrite TwitterAdapter with Dual-Path Parsing

**Files:**
- Modify: `src/core/extract/adapters/twitter.ts`

**Step 1: Replace entire TwitterAdapter implementation**

Open `src/core/extract/adapters/twitter.ts`, replace with:

```typescript
import { BaseAdapter } from './base.js';
import type { ExtractResult } from '../types.js';
import type { RenderedPage } from '../../render/types.js';
import type { ClipDoc, Block } from '../../types/index.js';
import { TwitterParser, type TweetData } from './parser.js';
import { TwitterBlockBuilder } from './block-builder.js';
import { TwitterExtractError } from './errors.js';
import * as cheerio from 'cheerio';

export class TwitterAdapter extends BaseAdapter {
  readonly platform = 'twitter';
  readonly domains = ['x.com', 'twitter.com'];

  private parser = new TwitterParser();
  private blockBuilder = new TwitterBlockBuilder();

  async extract(page: RenderedPage): Promise<ExtractResult> {
    const warnings: string[] = [];

    // Primary path: parse from raw data
    if (page.rawData) {
      try {
        return this.extractFromRawData(page);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Raw data parsing failed: ${message}`);
      }
    }

    // Fallback path: parse from HTML
    try {
      return this.extractFromHtml(page);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`HTML parsing failed: ${message}`);
      throw new TwitterExtractError(
        'All parsing methods failed',
        'PARSE_FAILED',
        error as Error
      );
    }
  }

  private extractFromRawData(page: RenderedPage): ExtractResult {
    const rawData = JSON.parse(page.rawData!);
    const tweets = this.parser.parseFromRawState(rawData);

    if (tweets.length === 0) {
      throw new TwitterExtractError(
        'No tweets found in page data',
        'NO_TWEETS'
      );
    }

    return {
      doc: this.buildDocFromTweets(tweets, page),
      warnings: [],
    };
  }

  private extractFromHtml(page: RenderedPage): ExtractResult {
    const $ = cheerio.load(page.html);
    const tweets: TweetData[] = [];

    // Extract all tweets from same author
    $('article[data-testid="tweet"]').each((_, el) => {
      tweets.push(this.parser.parseFromCheerio($, el));
    });

    if (tweets.length === 0) {
      throw new TwitterExtractError(
        'No tweets found in HTML',
        'NO_TWEETS'
      );
    }

    return {
      doc: this.buildDocFromTweets(tweets, page),
      warnings: ['Used HTML fallback parsing'],
    };
  }

  private buildDocFromTweets(tweets: TweetData[], page: RenderedPage): ClipDoc {
    const mainTweet = tweets[0];
    const blocks: Block[] = [];

    // Build blocks from all tweets
    tweets.forEach((tweet, index) => {
      // Add separator between tweets
      if (index > 0) {
        blocks.push({
          type: 'paragraph',
          content: '---',
        });
      }
      blocks.push(...this.blockBuilder.tweetToBlocks(tweet));
    });

    // Extract all images from all tweets
    const allImages = tweets.flatMap(tweet =>
      tweet.media
        .filter(m => m.type === 'image')
        .map(m => ({
          url: m.url,
          alt: m.alt || '',
        }))
    );

    return {
      platform: 'twitter',
      sourceUrl: page.url,
      canonicalUrl: page.canonicalUrl,
      title: this.generateTitle(mainTweet),
      author: `@${mainTweet.author.screenName}`,
      publishedAt: mainTweet.createdAt,
      fetchedAt: new Date().toISOString(),
      blocks,
      assets: {
        images: allImages,
      },
    };
  }

  private generateTitle(tweet: TweetData): string {
    const text = tweet.text.slice(0, 50);
    return text.length < tweet.text.length ? text + '...' : text;
  }
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/core/extract/adapters/twitter.ts
git commit -m "feat(twitter): implement dual-path parsing with Cheerio fallback"
```

---

## Task 7: Update PageRenderer for Raw Data Extraction

**Files:**
- Modify: `src/core/render/page.ts`
- Modify: `src/core/render/types.ts`

**Step 1: Add rawData to RenderedPage type**

Open `src/core/render/types.ts`, add `rawData` field:

```typescript
export interface RenderedPage {
  url: string;
  canonicalUrl?: string;
  title?: string;
  html: string;
  platform: Platform;
  rawData?: string;  // Add this line
  screenshotPath?: string;
  debugHtmlPath?: string;
}
```

**Step 2: Add extractTwitterRawData method to PageRenderer**

Open `src/core/render/page.ts`, add method before `extractCanonicalUrl`:

```typescript
private async extractTwitterRawData(page: Page): Promise<string | undefined> {
  try {
    const data = await page.evaluate(() => {
      // Try window.__STATE__
      const state = (window as any).__STATE__;
      if (state) return JSON.stringify(state);

      // Fallback: extract from script tags
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.includes('tweet') && text.includes('result')) {
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

**Step 3: Call extractTwitterRawData in render method**

Find the render method in `PageRenderer`, after detecting platform, add:

```typescript
// Platform-specific handling
const platform = detectPlatform(new URL(url));

let rawData: string | undefined;
if (platform === 'twitter') {
  rawData = await this.extractTwitterRawData(page);
}

if (platform === 'twitter') {
  await this.handleTwitter(page, maxScrolls);
}

// ... extract page info ...

return {
  url,
  canonicalUrl,
  title,
  html,
  platform,
  rawData,  // Add this line
  screenshotPath,
  debugHtmlPath,
};
```

**Step 4: Build to verify**

Run: `npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add src/core/render/page.ts src/core/render/types.ts
git commit -m "feat(render): add Twitter raw data extraction"
```

---

## Task 8: Update MarkdownGenerator for New Block Types

**Files:**
- Modify: `src/core/export/markdown.ts`

**Step 1: Add handler for hashtag block**

Find the `blockToMarkdown` method, add case for `hashtag`:

```typescript
case 'hashtag':
  return `[${block.tag}](${block.url})`;
```

**Step 2: Add handler for tweet_meta block**

Add case for `tweet_meta`:

```typescript
case 'tweet_meta':
  return this.formatTweetMeta(block);
```

**Step 3: Add formatTweetMeta method**

Add new method at the end of MarkdownGenerator class:

```typescript
private formatTweetMeta(meta: TweetMetaBlock): string {
  const parts: string[] = [];
  if (meta.likes > 0) parts.push(`❤️ ${meta.likes}`);
  if (meta.retweets > 0) parts.push(`🔁 ${meta.retweets}`);
  if (meta.replies > 0) parts.push(`💬 ${meta.replies}`);
  if (meta.views > 0) parts.push(`👁️ ${meta.views}`);

  return parts.length > 0
    ? `\n\n---\n\n**互动数据**: ${parts.join(' | ')}\n`
    : '';
}
```

**Step 4: Build to verify**

Run: `npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add src/core/export/markdown.ts
git commit -m "feat(export): add hashtag and tweet_meta block handlers"
```

---

## Task 9: End-to-End Testing

**Files:**
- (No new files, use existing CLI)

**Step 1: Build the project**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Test with a real Twitter URL**

Run: `node dist/cli/index.js once "https://x.com/elonmusk/status/1234567890" --debug`

Expected output:
```
Archiving: https://x.com/elonmusk/status/1234567890
✓ Exported to: clips/twitter/.../content.md
✓ Images: 0
```

**Step 3: Verify output file**

Run: `cat clips/twitter/*/latest/content.md`

Expected: Markdown with front matter, tweet content, metadata

**Step 4: Test with HTML fallback (if rawData fails)**

The adapter should automatically fall back to Cheerio parsing if rawData is not available.

**Step 5: Commit implementation plan completion**

```bash
git add docs/plans/2026-01-17-twitter-content-parsing-implementation.md
git commit -m "docs: complete Twitter content parsing implementation plan"
```

---

## Summary

This implementation adds:

1. **Cheerio dependency** for HTML parsing
2. **New block types**: TweetMetaBlock, HashtagBlock
3. **TwitterParser**: Extracts TweetData from HTML (raw data parsing stub for future)
4. **TwitterBlockBuilder**: Converts TweetData to Block[]
5. **TwitterAdapter**: Dual-path parsing with fallback
6. **PageRenderer enhancement**: Extracts Twitter raw data
7. **MarkdownGenerator enhancement**: Handles new block types

**Next Steps** (beyond M1):
- Implement actual raw state parsing in `parseFromRawState`
- Add unit tests for parser and block builder
- Handle quoted tweet detection in Cheerio parsing
- Add thread expansion logic for deeper threads
