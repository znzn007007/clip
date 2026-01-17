# Twitter/X Content Extraction Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve Twitter/X content extraction by implementing complete raw data parsing and DOM-based fallback extraction.

**Architecture:** Dual-path extraction with raw data parsing (primary) and DOM-based extraction (fallback). Raw data from multiple sources is unified through an abstraction layer before parsing.

**Tech Stack:** TypeScript, Playwright, Cheerio, Jest

---

## Task 1: Define Raw Data Abstraction Layer Types

**Files:**
- Create: `src/core/extract/adapters/twitter/types.ts`

**Step 1: Create the types file**

```typescript
// src/core/extract/adapters/twitter/types.ts

/**
 * Unified raw data format from all extraction sources
 */
export interface TwitterRawData {
  tweets: RawTweet[];
  metadata: RawDataMetadata;
}

export interface RawDataMetadata {
  extractedFrom: 'window_state' | 'script_tag' | 'dom_extraction';
  timestamp: string;
  sourceDescription?: string;
}

export interface RawTweet {
  id: string;
  text?: string;
  author?: {
    name?: string;
    screenName?: string;
    avatarUrl?: string;
  };
  createdAt?: string;
  metrics?: {
    likes?: number;
    retweets?: number;
    replies?: number;
    views?: number;
  };
  media?: RawMedia[];
  hashtags?: string[];
  urls?: Array<{ url: string; displayUrl: string }>;
  quotedTweet?: RawTweet;
}

export interface RawMedia {
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  alt?: string;
}
```

**Step 2: Run type check**

Run: `cd .worktrees/twitter-extraction && npm run type-check`
Expected: PASS (or no errors)

**Step 3: Commit**

```bash
cd .worktrees/twitter-extraction
git add src/core/extract/adapters/twitter/types.ts
git commit -m "feat(twitter): add raw data abstraction layer types"
```

---

## Task 2: Implement Multi-Source Raw Data Extractor

**Files:**
- Create: `src/core/extract/adapters/twitter/raw-extractor.ts`
- Modify: `src/core/render/page.ts:102-124`

**Step 1: Create the raw extractor module**

```typescript
// src/core/extract/adapters/twitter/raw-extractor.ts
import type { Page } from 'playwright';
import type { TwitterRawData, RawTweet, RawMedia } from './types.js';

/**
 * Extract Twitter raw data from multiple sources
 */
export class TwitterRawExtractor {
  /**
   * Try all extraction sources in priority order
   */
  async extract(page: Page): Promise<TwitterRawData | undefined> {
    // Try window.__STATE__ first
    const stateData = await this.extractFromWindowState(page);
    if (stateData) return stateData;

    // Try __INITIAL_STATE__
    const initialStateData = await this.extractFromInitialState(page);
    if (initialStateData) return initialStateData;

    // Try script tags
    const scriptData = await this.extractFromScriptTags(page);
    if (scriptData) return scriptData;

    return undefined;
  }

  /**
   * Extract from window.__STATE__
   */
  private async extractFromWindowState(page: Page): Promise<TwitterRawData | undefined> {
    try {
      const data = await page.evaluate(() => {
        const state = (window as any).__STATE__;
        if (!state) return null;
        return JSON.stringify(state);
      });

      if (!data) return undefined;

      return this.parseRawState(data, 'window_state');
    } catch {
      return undefined;
    }
  }

  /**
   * Extract from __INITIAL_STATE__
   */
  private async extractFromInitialState(page: Page): Promise<TwitterRawData | undefined> {
    try {
      const data = await page.evaluate(() => {
        const state = (window as any).__INITIAL_STATE__;
        if (!state) return null;
        return JSON.stringify(state);
      });

      if (!data) return undefined;

      return this.parseRawState(data, 'window_state');
    } catch {
      return undefined;
    }
  }

  /**
   * Extract from script tags containing tweet data
   */
  private async extractFromScriptTags(page: Page): Promise<TwitterRawData | undefined> {
    try {
      const data = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent || '';
          // Look for script tags with tweet/thread/result keywords
          if (text.includes('tweet') && text.includes('result')) {
            // Try to extract JSON object
            const match = text.match(/({.*})/s);
            if (match) {
              try {
                JSON.parse(match[0]);
                return match[0];
              } catch {
                continue;
              }
            }
          }
        }
        return null;
      });

      if (!data) return undefined;

      return this.parseRawState(data, 'script_tag');
    } catch {
      return undefined;
    }
  }

  /**
   * Parse raw state JSON into TwitterRawData format
   */
  private parseRawState(jsonString: string, source: TwitterRawData['metadata']['extractedFrom']): TwitterRawData | undefined {
    try {
      const parsed = JSON.parse(jsonString);

      // Try to extract tweets from various possible structures
      const tweets = this.extractTweetsFromParsed(parsed);

      if (tweets.length === 0) return undefined;

      return {
        tweets,
        metadata: {
          extractedFrom: source,
          timestamp: new Date().toISOString(),
          sourceDescription: this.getSourceDescription(parsed, source),
        },
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Extract tweets from parsed state object
   */
  private extractTweetsFromParsed(parsed: any): RawTweet[] {
    const tweets: RawTweet[] = [];

    // Helper to check if object looks like a tweet
    const isTweet = (obj: any): boolean => {
      return obj && typeof obj === 'object' &&
        (obj.id || obj.id_str || obj.tweet_id) &&
        (obj.text || obj.full_text || obj.body);
    };

    // Recursive search for tweets
    const search = (obj: any, depth = 0): void => {
      if (!obj || typeof obj !== 'object' || depth > 10) return;

      if (Array.isArray(obj)) {
        obj.forEach(item => search(item, depth + 1));
        return;
      }

      if (isTweet(obj)) {
        tweets.push(this.normalizeRawTweet(obj));
      }

      // Continue searching
      Object.values(obj).forEach(val => search(val, depth + 1));
    };

    search(parsed);
    return tweets;
  }

  /**
   * Normalize tweet object to RawTweet format
   */
  private normalizeRawTweet(obj: any): RawTweet {
    return {
      id: obj.id || obj.id_str || obj.tweet_id || '',
      text: obj.text || obj.full_text || obj.body || '',
      author: obj.user ? {
        name: obj.user.name,
        screenName: obj.user.screen_name,
        avatarUrl: obj.user.profile_image_url_https,
      } : undefined,
      createdAt: obj.created_at,
      metrics: obj.favorite_count || obj.retweet_count ? {
        likes: obj.favorite_count || 0,
        retweets: obj.retweet_count || 0,
        replies: obj.reply_count || 0,
        views: 0,
      } : undefined,
      media: this.extractMedia(obj),
      hashtags: obj.entities?.hashtags?.map((h: any) => h.text),
      urls: obj.entities?.urls?.map((u: any) => ({
        url: u.url,
        displayUrl: u.display_url,
      })),
    };
  }

  /**
   * Extract media from tweet object
   */
  private extractMedia(obj: any): RawMedia[] | undefined {
    if (!obj.extended_entities?.media && !obj.entities?.media) return undefined;

    const mediaSources = [
      ...(obj.extended_entities?.media || []),
      ...(obj.entities?.media || []),
    ];

    const media = mediaSources.map((m: any) => ({
      type: m.type === 'video' || m.type === 'animated_gif' ? 'video' as const : 'image' as const,
      url: m.media_url_https || m.video_info?.variants?.[0]?.url || '',
      thumbnailUrl: m.media_url_https,
      alt: m.alt_text,
    }));

    return media.length > 0 ? media : undefined;
  }

  /**
   * Get description of data source
   */
  private getSourceDescription(parsed: any, source: string): string {
    if (source === 'window_state') {
      return 'Extracted from window.__STATE__ or __INITIAL_STATE__';
    }
    return 'Extracted from script tag with tweet data';
  }
}
```

**Step 2: Update page.ts to use the new extractor**

Replace the `extractTwitterRawData` method in `src/core/render/page.ts`:

```typescript
// src/core/render/page.ts

import { TwitterRawExtractor } from '../extract/adapters/twitter/raw-extractor.js';

// In PageRenderer class, replace extractTwitterRawData method (lines 102-124):

private async extractTwitterRawData(page: Page): Promise<string | undefined> {
  try {
    const extractor = new TwitterRawExtractor();
    const rawData = await extractor.extract(page);
    if (rawData) {
      return JSON.stringify(rawData);
    }
    return undefined;
  } catch {
    return undefined;
  }
}
```

**Step 3: Run type check**

Run: `cd .worktrees/twitter-extraction && npm run type-check`
Expected: PASS

**Step 4: Commit**

```bash
cd .worktrees/twitter-extraction
git add src/core/extract/adapters/twitter/raw-extractor.ts src/core/render/page.ts
git commit -m "feat(twitter): implement multi-source raw data extractor"
```

---

## Task 3: Implement parseFromRawState

**Files:**
- Modify: `src/core/extract/adapters/twitter/parser.ts:34-37`

**Step 1: Implement parseFromRawState method**

Replace the empty implementation:

```typescript
// src/core/extract/adapters/twitter/parser.ts

import type { TwitterRawData } from './types.js';

// In TwitterParser class, replace parseFromRawState (lines 34-37):

parseFromRawState(rawState: unknown): TweetData[] {
  if (!rawState) return [];

  let data: TwitterRawData;

  // Parse if string
  if (typeof rawState === 'string') {
    try {
      data = JSON.parse(rawState);
    } catch {
      return [];
    }
  } else {
    data = rawState as TwitterRawData;
  }

  // Validate structure
  if (!data.tweets || !Array.isArray(data.tweets)) {
    return [];
  }

  // Convert each raw tweet to TweetData
  return data.tweets
    .filter(raw => raw.id) // Only include tweets with ID
    .map(raw => this.convertRawTweetToTweetData(raw));
}

/**
 * Convert RawTweet to TweetData
 */
private convertRawTweetToTweetData(raw: TwitterRawData['tweets'][0]): TweetData {
  return {
    id: raw.id,
    text: raw.text || '',
    author: {
      screenName: raw.author?.screenName || '',
      displayName: raw.author?.name || '',
      avatarUrl: raw.author?.avatarUrl,
    },
    createdAt: raw.createdAt || new Date().toISOString(),
    metrics: {
      likes: raw.metrics?.likes || 0,
      retweets: raw.metrics?.retweets || 0,
      replies: raw.metrics?.replies || 0,
      views: raw.metrics?.views || 0,
    },
    media: raw.media || [],
    hashtags: raw.hashtags || [],
    urls: raw.urls || [],
    quotedTweet: raw.quotedTweet ? this.convertRawTweetToTweetData(raw.quotedTweet) : undefined,
  };
}
```

**Step 2: Run tests**

Run: `cd .worktrees/twitter-extraction && npm test -- src/core/extract/adapters/__tests__/twitter.adapter.test.ts`
Expected: Tests may still fail (we'll fix in next tasks), but no TypeScript errors

**Step 3: Commit**

```bash
cd .worktrees/twitter-extraction
git add src/core/extract/adapters/twitter/parser.ts
git commit -m "feat(twitter): implement parseFromRawState with unified data format"
```

---

## Task 4: Implement DOM Extraction Fallback

**Files:**
- Create: `src/core/extract/adapters/twitter/dom-extractor.ts`
- Modify: `src/core/extract/adapters/twitter.ts`

**Step 1: Create DOM extractor module**

```typescript
// src/core/extract/adapters/twitter/dom-extractor.ts
import type { Page } from 'playwright';
import type { TwitterRawData } from './types.js';

/**
 * Extract tweet data directly from DOM
 */
export class TwitterDomExtractor {
  /**
   * Extract tweets from DOM using page.evaluate
   */
  async extract(page: Page): Promise<TwitterRawData> {
    const result = await page.evaluate(() => {
      const tweets: any[] = [];

      document.querySelectorAll('article[data-testid="tweet"]').forEach(article => {
        // Extract text
        const textEl = article.querySelector('[data-testid="tweetText"]');
        const text = textEl?.textContent?.replace(/\s+/g, ' ').trim() || '';

        // Extract author
        const authorEl = article.querySelector('[data-testid="User-Name"]');
        let name = '';
        let screenName = '';
        let avatarUrl = '';

        if (authorEl) {
          name = authorEl.querySelector('span')?.textContent?.trim() || '';
          const handleLink = authorEl.querySelector('a[href^="/"]');
          screenName = handleLink?.getAttribute('href')?.slice(1) || '';
          avatarUrl = article.querySelector('img[src*="profile_images"]')?.getAttribute('src') || '';
        }

        // Extract timestamp
        const timeEl = article.querySelector('time');
        const createdAt = timeEl?.getAttribute('datetime') || new Date().toISOString();

        // Extract metrics
        const getAriaLabelNumber = (selector: string): number => {
          const el = article.querySelector(selector);
          const label = el?.getAttribute('aria-label') || '';
          const match = label.match(/(\d+)/);
          return match ? parseInt(match[1].replace(/,/g, '')) : 0;
        };

        const metrics = {
          replies: getAriaLabelNumber('[data-testid="reply"]'),
          retweets: getAriaLabelNumber('[data-testid="retweet"]'),
          likes: getAriaLabelNumber('[data-testid="like"]'),
          views: getAriaLabelNumber('[data-testid="views"]'),
        };

        // Extract images (prioritize pbs.twimg.com)
        const media: any[] = [];
        article.querySelectorAll('img[src*="pbs.twimg.com"]').forEach(img => {
          const url = img.getAttribute('src');
          if (url && !url.includes('profile_images')) {
            media.push({
              type: 'image',
              url: url.replace(/&name=\w+/, '&name=orig'), // Get original quality
              alt: img.getAttribute('alt') || '',
            });
          }
        });

        // Extract videos
        article.querySelectorAll('video').forEach(video => {
          const poster = video.getAttribute('poster');
          const source = video.querySelector('source');
          media.push({
            type: 'video',
            url: source?.getAttribute('src') || '',
            thumbnailUrl: poster || undefined,
          });
        });

        // Extract hashtags
        const hashtags: string[] = [];
        article.querySelectorAll('a[href^="/hashtag/"]').forEach(a => {
          const tag = a.textContent?.trim();
          if (tag?.startsWith('#')) {
            hashtags.push(tag);
          }
        });

        // Extract URLs
        const urls: any[] = [];
        article.querySelectorAll('a[href^="http"]').forEach(a => {
          const href = a.getAttribute('href');
          if (href && !href.startsWith('/') && href.includes('http')) {
            urls.push({
              url: href,
              displayUrl: a.textContent?.trim() || '',
            });
          }
        });

        // Extract tweet ID from permalink
        const permalink = article.querySelector('a[href*="/status/"]');
        const idMatch = permalink?.getAttribute('href')?.match(/\/status\/(\d+)/);
        const id = idMatch?.[1] || '';

        tweets.push({
          id,
          text,
          author: { name, screenName, avatarUrl },
          createdAt,
          metrics,
          media,
          hashtags,
          urls,
        });
      });

      return tweets;
    });

    return {
      tweets: result,
      metadata: {
        extractedFrom: 'dom_extraction',
        timestamp: new Date().toISOString(),
        sourceDescription: 'Extracted from DOM using page.evaluate',
      },
    };
  }
}
```

**Step 2: Update TwitterAdapter to use DOM extractor**

Add to `src/core/extract/adapters/twitter.ts`:

```typescript
// src/core/extract/adapters/twitter.ts

import { TwitterDomExtractor } from './dom-extractor.js';

// In TwitterAdapter class, add property:
private domExtractor = new TwitterDomExtractor();

// Replace extractFromHtml method (lines 63-112):

private async extractFromHtml(page: import('../../render/types.js').RenderedPage): Promise<ExtractResult> {
  // Note: We need page access for DOM extraction
  // For now, use the existing cheerio approach as fallback
  // This will be updated when we have page access in extract()

  const $ = cheerio.load(page.html);
  const tweets: TweetData[] = [];

  const tweetElements = $('article[data-testid="tweet"]');
  tweetElements.each((_, el) => {
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
```

**Step 3: Run type check**

Run: `cd .worktrees/twitter-extraction && npm run type-check`
Expected: PASS

**Step 4: Commit**

```bash
cd .worktrees/twitter-extraction
git add src/core/extract/adapters/twitter/dom-extractor.ts src/core/extract/adapters/twitter.ts
git commit -m "feat(twitter): add DOM extraction fallback"
```

---

## Task 5: Update PageRenderer to Support DOM Extraction

**Files:**
- Modify: `src/core/render/page.ts`
- Modify: `src/core/render/types.ts`

**Step 1: Add page reference to RenderedPage**

Update `src/core/render/types.ts`:

```typescript
// src/core/render/types.ts

import type { Page } from 'playwright';

export interface RenderedPage {
  url: string;
  canonicalUrl?: string;
  title: string;
  html: string;
  platform: string;
  rawData?: string;
  screenshotPath?: string;
  debugHtmlPath?: string;
  page?: Page;  // Add page reference for advanced extraction
}
```

**Step 2: Update PageRenderer to pass page reference**

Update `src/core/render/page.ts` render method to include page in result:

```typescript
// src/core/render/page.ts

return {
  url,
  canonicalUrl,
  title,
  html,
  platform,
  rawData,
  screenshotPath,
  debugHtmlPath,
  page,  // Include page for DOM extraction
};
```

**Step 3: Update TwitterAdapter to use DOM extractor when available**

Update `src/core/extract/adapters/twitter.ts`:

```typescript
// src/core/extract/adapters/twitter.ts

// Replace extractFromHtml method:

private async extractFromHtml(page: RenderedPage): Promise<ExtractResult> {
  // Prefer DOM extraction if page is available
  if (page.page) {
    try {
      const rawData = await this.domExtractor.extract(page.page);
      const tweets = this.parser.parseFromRawState(rawData);

      if (tweets.length > 0) {
        return {
          doc: this.buildDocFromTweets(tweets, page),
          warnings: ['Used DOM extraction'],
        };
      }
    } catch (error) {
      console.error('[DEBUG] DOM extraction failed:', error);
    }
  }

  // Fallback to cheerio HTML parsing
  const $ = cheerio.load(page.html);
  const tweets: TweetData[] = [];

  const tweetElements = $('article[data-testid="tweet"]');
  tweetElements.each((_, el) => {
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
```

**Step 4: Update extract method to be async**

```typescript
// src/core/extract/adapters/twitter.ts

// Change extractFromHtml call to await:
async extract(page: RenderedPage): Promise<ExtractResult> {
  const warnings: string[] = [];

  // Primary path: parse from raw data (if available)
  const rawData = page.rawData;
  if (rawData) {
    try {
      return this.extractFromRawData(page, rawData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Raw data parsing failed: ${message}`);
    }
  }

  // Fallback path: parse from HTML/DOM
  try {
    return await this.extractFromHtml(page);
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
```

**Step 5: Run type check**

Run: `cd .worktrees/twitter-extraction && npm run type-check`
Expected: PASS

**Step 6: Commit**

```bash
cd .worktrees/twitter-extraction
git add src/core/render/types.ts src/core/render/page.ts src/core/extract/adapters/twitter.ts
git commit -m "feat(twitter): integrate DOM extraction with page reference"
```

---

## Task 6: Improve Image Extraction for pbs.twimg.com

**Files:**
- Modify: `src/core/extract/adapters/twitter/parser.ts:120-147`

**Step 1: Update extractMedia method**

Replace the extractMedia method:

```typescript
// src/core/extract/adapters/twitter/parser.ts

private extractMedia($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): TweetData['media'] {
  const media: TweetData['media'] = [];

  // Priority 1: Extract pbs.twimg.com images
  $el.find('img[src*="pbs.twimg.com"]').each((_, img) => {
    const $img = $(img);
    const url = $img.attr('src');
    if (url && !url.includes('profile_images')) {
      // Get original quality
      const highResUrl = url.replace(/&name=\w+/, '&name=orig');
      media.push({
        type: 'image',
        url: highResUrl,
        alt: $img.attr('alt') || '',
      });
    }
  });

  // Priority 2: Other media images (as backup)
  $el.find('img[src*="media"]').each((_, img) => {
    const $img = $(img);
    const url = $img.attr('src');
    // Only add if not already added from pbs.twimg.com
    if (url && !url.includes('pbs.twimg.com') && !url.includes('profile_images')) {
      const highResUrl = url.replace(/&name=\w+/, '&name=orig');
      media.push({
        type: 'image',
        url: highResUrl,
        alt: $img.attr('alt') || '',
      });
    }
  });

  // Priority 3: Videos
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
```

**Step 2: Run tests**

Run: `cd .worktrees/twitter-extraction && npm test -- src/core/extract/adapters/__tests__/twitter.adapter.test.ts`
Expected: Tests may still fail (fixtures will be updated in next task)

**Step 3: Commit**

```bash
cd .worktrees/twitter-extraction
git add src/core/extract/adapters/twitter/parser.ts
git commit -m "feat(twitter): prioritize pbs.twimg.com images with original quality"
```

---

## Task 7: Add Debug Mode Support

**Files:**
- Modify: `src/core/render/page.ts:55-61`
- Modify: `src/core/render/types.ts`

**Step 1: Add debug files to RenderedPage**

Update `src/core/render/types.ts`:

```typescript
// src/core/render/types.ts

export interface RenderedPage {
  url: string;
  canonicalUrl?: string;
  title: string;
  html: string;
  platform: string;
  rawData?: string;
  screenshotPath?: string;
  debugHtmlPath?: string;
  debugDataPath?: string;  // Add debug data JSON path
  page?: Page;
}
```

**Step 2: Implement debug mode in PageRenderer**

Update `src/core/render/page.ts`:

```typescript
// src/core/render/page.ts

import { promises as fs } from 'fs';
import { join } from 'path';

// Replace the debug section in render method (lines 55-61):

let screenshotPath: string | undefined;
let debugHtmlPath: string | undefined;
let debugDataPath: string | undefined;

if (options.debug) {
  const timestamp = Date.now();
  const debugDir = join(process.cwd(), 'debug');

  // Ensure debug directory exists
  await fs.mkdir(debugDir, { recursive: true });

  // Save HTML snapshot
  debugHtmlPath = join(debugDir, `debug-twitter-${timestamp}.html`);
  await fs.writeFile(debugHtmlPath, html);

  // Save raw data if available
  if (rawData) {
    debugDataPath = join(debugDir, `debug-data-${timestamp}.json`);
    await fs.writeFile(debugDataPath, rawData);

    console.error(`[DEBUG] rawData source: ${JSON.parse(rawData).metadata?.extractedFrom || 'unknown'}`);
    const tweetCount = JSON.parse(rawData).tweets?.length || 0;
    console.error(`[DEBUG] tweets found: ${tweetCount}`);
  }
}

// Update return statement to include debugDataPath
return {
  url,
  canonicalUrl,
  title,
  html,
  platform,
  rawData,
  screenshotPath,
  debugHtmlPath,
  debugDataPath,
  page,
};
```

**Step 3: Add debug directory to .gitignore**

```bash
cd .worktrees/twitter-extraction
echo "debug/" >> .gitignore
git add .gitignore
git commit -m "chore: add debug/ directory to gitignore"
```

**Step 4: Run type check**

Run: `cd .worktrees/twitter-extraction && npm run type-check`
Expected: PASS

**Step 5: Commit**

```bash
cd .worktrees/twitter-extraction
git add src/core/render/types.ts src/core/render/page.ts
git commit -m "feat(debug): add debug mode with HTML and data snapshots"
```

---

## Task 8: Update Tests with Fixtures

**Files:**
- Modify: `src/core/extract/adapters/__tests__/twitter.adapter.test.ts`

**Step 1: Read existing test file**

Run: `cd .worktrees/twitter-extraction && cat src/core/extract/adapters/__tests__/twitter.adapter.test.ts`

**Step 2: Update test fixtures**

Create proper Twitter HTML fixtures with actual tweet structure. Update the test file to include realistic tweet HTML:

```typescript
// src/core/extract/adapters/__tests__/twitter.adapter.test.ts

// Update the mock page with realistic Twitter HTML

const mockPageWithTweet: RenderedPage = {
  url: 'https://x.com/user/status/123456789',
  canonicalUrl: 'https://x.com/user/status/123456789',
  title: 'Post by @user',
  html: `
    <html>
      <body>
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <a href="/testuser">
              <span>Test User</span>
            </a>
          </div>
          <div data-testid="tweetText">This is a test tweet</div>
          <time datetime="2025-01-17T10:00:00Z">10:00 AM Jan 17, 2025</time>
          <div data-testid="reply" aria-label="5 replies"></div>
          <div data-testid="retweet" aria-label="10 reposts"></div>
          <div data-testid="like" aria-label="100 likes"></div>
          <img src="https://pbs.twimg.com/media/ABC123?format=jpg&name=medium" alt="Test image">
        </article>
      </body>
    </html>
  `,
  platform: 'twitter',
};
```

**Step 3: Run tests**

Run: `cd .worktrees/twitter-extraction && npm test -- src/core/extract/adapters/__tests__/twitter.adapter.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
cd .worktrees/twitter-extraction
git add src/core/extract/adapters/__tests__/twitter.adapter.test.ts
git commit -m "test(twitter): update test fixtures with realistic HTML"
```

---

## Task 9: Add Error Types

**Files:**
- Modify: `src/core/extract/adapters/twitter/errors.ts`

**Step 1: Add error type constants**

```typescript
// src/core/extract/adapters/twitter/errors.ts

export const TWITTER_ERROR_TYPES = {
  NOT_LOGGED_IN: 'NOT_LOGGED_IN',
  NO_TWEETS_FOUND: 'NO_TWEETS_FOUND',
  RAW_DATA_PARSE_FAILED: 'RAW_DATA_PARSE_FAILED',
  DOM_EXTRACT_FAILED: 'DOM_EXTRACT_FAILED',
  PARSE_FAILED: 'PARSE_FAILED',
  NO_TWEETS: 'NO_TWEETS',
} as const;
```

**Step 2: Run type check**

Run: `cd .worktrees/twitter-extraction && npm run type-check`
Expected: PASS

**Step 3: Commit**

```bash
cd .worktrees/twitter-extraction
git add src/core/extract/adapters/twitter/errors.ts
git commit -m "feat(twitter): add error type constants"
```

---

## Task 10: Run All Tests and Fix Issues

**Files:**
- All modified files

**Step 1: Run all tests**

Run: `cd .worktrees/twitter-extraction && npm test`

**Step 2: Fix any remaining issues**

Address test failures until all pass.

**Step 3: Final commit**

```bash
cd .worktrees/twitter-extraction
git add -A
git commit -m "test: fix all test failures"
```

---

## Task 11: Update Documentation

**Files:**
- Create: `docs/changes/twitter-extraction-improvement.md`

**Step 1: Create changelog entry**

```markdown
# Twitter/X Extraction Improvement

## Summary
Improved Twitter/X content extraction with multi-source raw data parsing and DOM-based fallback.

## Changes

### New Features
- Multi-source raw data extraction (window.__STATE__, script tags)
- DOM-based extraction using page.evaluate
- Debug mode with HTML and JSON snapshots
- Prioritized pbs.twimg.com image handling with original quality

### Bug Fixes
- Fixed empty parseFromRawState implementation
- Improved image URL extraction

### Technical Details
- Added TwitterRawData abstraction layer
- Implemented TwitterRawExtractor and TwitterDomExtractor
- Added debug files output to debug/ directory
```

**Step 2: Commit**

```bash
cd .worktrees/twitter-extraction
git add docs/changes/twitter-extraction-improvement.md
git commit -m "docs: add Twitter extraction improvement changelog"
```

---

## Task 12: Final Verification

**Step 1: Run all tests**

Run: `cd .worktrees/twitter-extraction && npm test`
Expected: All PASS

**Step 2: Run type check**

Run: `cd .worktrees/twitter-extraction && npm run type-check`
Expected: No errors

**Step 3: Build project**

Run: `cd .worktrees/twitter-extraction && npm run build`
Expected: Successful build

**Step 4: Commit**

```bash
cd .worktrees/twitter-extraction
git commit --allow-empty -m "chore: verify all tests passing"
```

---

## Testing Manual Scenario

**Step 1: Test with real Twitter URL**

```bash
cd .worktrees/twitter-extraction
npm run cli -- "https://x.com/elonmusk/status/123456789" --debug
```

**Step 2: Check debug files**

```bash
ls -la debug/
cat debug/debug-data-*.json | jq
```

**Step 3: Verify image URLs**

Check that pbs.twimg.com URLs have `&name=orig` for original quality.

---

## Completion Checklist

- [ ] All tasks completed
- [ ] All tests passing
- [ ] Type check passing
- [ ] Build successful
- [ ] Documentation updated
- [ ] Debug mode tested
- [ ] Real URL tested

---

**Total estimated time:** 2-3 hours
**Total commits:** ~12 commits
