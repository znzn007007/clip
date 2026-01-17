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
