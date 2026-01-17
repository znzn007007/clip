# Twitter Content Parsing Design

> **For Claude:** Use this design as the specification for implementing Twitter content parsing in M1.

**Date:** 2026-01-17
**Status:** Ready for Implementation
**Related:** M1 Implementation Plan (2026-01-17-clip-client-m1-implementation.md)

---

## Overview

This document defines the design for parsing Twitter/X content, including single tweets and basic threads (same author's continuous replies). The implementation uses a hybrid approach: primary path via Twitter's internal data, with Cheerio HTML parsing as fallback.

---

## Requirements

### M1 Scope

- **Single tweet**: Parse and export a single tweet
- **Basic thread**: Detect and parse all tweets from the same author on the page
- **Quote tweets**: Handle as separate QuoteBlock
- **Media**: Download images, save video URLs only
- **Metadata**: Extract interaction data (likes, retweets, replies, views) and hashtags

### Out of Scope (Future)

- Cross-author retweets
- Thread expansion beyond loaded content
- Video download
- Poll results
- Translation

---

## Architecture

### Data Flow Diagram

```
Twitter Page (https://x.com/user/status/123)
        |
        v
PageRenderer.render()
  - page.evaluate(() => window.__STATE__)
  - or page.content()
        |
        v
RenderedPage
  - url, html, rawData?, canonicalUrl?, title?, platform
        |
        v
TwitterAdapter.extract()
  - if (rawData exists): parseFromRawState()
  - else: parseFromCheerio()
        |
        v
TweetData[] (Array of parsed tweets)
  - id, text, author, createdAt, metrics, media, hashtags, urls, quotedTweet?
        |
        v
buildDocFromTweets() + TwitterBlockBuilder.tweetToBlocks()
        |
        v
Block[] (Converted content blocks)
  - paragraph, hashtag, image, video, link, quote, tweet_meta
        |
        v
ClipDoc (Final document structure)
  - platform, sourceUrl, title, author, publishedAt, blocks, assets
        |
        +-------+-------+
        |               |
        v               v
AssetDownloader  MarkdownGenerator
        |               |
        v               v
Map<url, filename>  content.md
        |               |
        +-------+-------+
                |
                v
Final Output:
  clips/twitter/2026/0117/slug-hash/
  ├── content.md
  └── assets/
      ├── 001.jpg
      └── 002.png
```

---

## Data Structures

### Extended Block Types

```typescript
// New block types for Twitter
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

// Extended QuoteBlock for tweets
export interface QuoteBlock {
  type: 'quote';
  content: string;
  author: string;
  authorUrl: string;
  sourceUrl: string;
  publishedAt?: string;
}
```

### TweetData (Internal)

```typescript
interface TweetData {
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
```

### Extended RenderedPage

```typescript
export interface RenderedPage {
  url: string;
  canonicalUrl?: string;
  title?: string;
  html: string;
  platform: Platform;
  rawData?: string;  // Twitter internal JSON data
  screenshotPath?: string;
  debugHtmlPath?: string;
}
```

---

## Components

### 1. PageRenderer (Enhanced)

**File:** `src/core/render/page.ts`

**Changes:**
- Add `extractTwitterRawData()` method
- Call it after page load for twitter platform
- Attach result to `RenderedPage.rawData`

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

### 2. TwitterParser

**File:** `src/core/extract/adapters/twitter/parser.ts`

**Responsibilities:**
- Parse Twitter internal state into TweetData[]
- Parse Cheerio elements into TweetData

**Key Methods:**
- `parseFromRawState(rawState: any): TweetData[]`
- `parseFromCheerio($: CheerioAPI, element: Element): TweetData`

### 3. TwitterBlockBuilder

**File:** `src/core/extract/adapters/twitter/block-builder.ts`

**Responsibilities:**
- Convert TweetData to Block[]
- Format tweet text with links
- Build metadata blocks

**Key Methods:**
- `tweetToBlocks(tweet: TweetData): Block[]`
- `formatTweetText(tweet: TweetData): string`

### 4. TwitterAdapter (Enhanced)

**File:** `src/core/extract/adapters/twitter.ts`

**Changes:**
- Implement dual-path parsing (raw data + Cheerio fallback)
- Use TwitterParser and TwitterBlockBuilder

```typescript
async extract(page: RenderedPage): Promise<ExtractResult> {
  const warnings: string[] = [];

  // Primary path
  if (page.rawData) {
    try {
      return this.extractFromRawData(page);
    } catch (error) {
      warnings.push(`Raw data parsing failed: ${error.message}`);
    }
  }

  // Fallback path
  return this.extractFromHtml(page);
}
```

### 5. MarkdownGenerator (Enhanced)

**File:** `src/core/export/markdown.ts`

**Changes:**
- Add handler for `hashtag` block type
- Add handler for `tweet_meta` block type
- Add `formatTweetMeta()` method

```typescript
case 'hashtag':
  return `[${block.tag}](${block.url})`;

case 'tweet_meta':
  return this.formatTweetMeta(block);
```

---

## Error Handling

### Error Types

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

### Fallback Strategy

1. **Try raw data parsing** → If fails, add warning, continue
2. **Try HTML parsing** → If fails, add warning, throw error
3. **Final failure** → Return failed ExportResult with diagnostics

---

## Dependencies

**Add to package.json:**

```json
{
  "dependencies": {
    "cheerio": "^1.0.0"
  }
}
```

---

## Output Example

**Input:** `https://x.com/elonmusk/status/1234567890`

**Output Markdown:**

```markdown
---
title: "This is a revolutionary announcement..."
source_url: "https://x.com/elonmusk/status/1234567890"
canonical_url: "https://x.com/elonmusk/status/1234567890"
platform: "twitter"
author: "@elonmusk"
published_at: "2026-01-17T10:00:00Z"
fetched_at: "2026-01-17T12:00:00Z"
tags: []
---

This is a revolutionary announcement that will change everything. [example.com](https://example.com)

[#AI](https://x.com/hashtag/AI) [#Tech](https://x.com/hashtag/Tech)

![alt text](./assets/001.jpg)

---

**互动数据**: ❤️ 10000 | 🔁 2000 | 💬 500 | 👁️ 1000000

---

This is a follow-up tweet with more details.

---

**互动数据**: ❤️ 5000 | 🔁 1000 | 💬 200 | 👁️ 500000
```

---

## Files to Create/Modify

### New Files
- `src/core/extract/adapters/twitter/parser.ts`
- `src/core/extract/adapters/twitter/block-builder.ts`
- `src/core/extract/adapters/twitter/errors.ts`

### Modified Files
- `src/core/render/page.ts` - Add rawData extraction
- `src/core/extract/adapters/twitter.ts` - Implement dual-path parsing
- `src/core/export/markdown.ts` - Add hashtag/tweet_meta handlers
- `src/core/types/index.ts` - Add new block types
- `package.json` - Add cheerio dependency

---

## Testing Strategy

### Unit Tests
- TwitterParser.parseFromRawState() with mock data
- TwitterParser.parseFromCheerio() with sample HTML
- TwitterBlockBuilder.tweetToBlocks() with various tweet types

### Integration Tests
- Full flow with real Twitter URL (using saved HTML snapshots)
- Fallback behavior when rawData is missing
- Error handling for malformed data

---

## Implementation Order

1. Install cheerio dependency
2. Add new block types to core/types
3. Implement TwitterParser (Cheerio path first for testing)
4. Implement TwitterBlockBuilder
5. Update TwitterAdapter with dual-path logic
6. Update PageRenderer for rawData extraction
7. Update MarkdownGenerator for new block types
8. Write tests
9. End-to-end testing with real URLs

---

## Open Questions

- How often does Twitter change `__STATE__` structure? (Monitor and adapt)
- Should we add `hr` block type for visual separation? (Proposed: yes)
- Image filename format: `001.jpg` or include tweet ID? (Current: sequential)
