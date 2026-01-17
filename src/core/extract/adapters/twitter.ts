// src/core/extract/adapters/twitter.ts
import { BaseAdapter } from './base.js';
import type { ExtractResult } from '../types.js';
import type { RenderedPage } from '../../render/types.js';
import type { ClipDoc, Block } from '../../types/index.js';
import { TwitterParser, type TweetData } from './twitter/parser.js';
import { TwitterBlockBuilder } from './twitter/block-builder.js';
import { TwitterExtractError } from './twitter/errors.js';
import { TwitterDomExtractor } from './twitter/dom-extractor.js';
import * as cheerio from 'cheerio';

export class TwitterAdapter extends BaseAdapter {
  readonly platform = 'twitter';
  readonly domains = ['x.com', 'twitter.com'];

  private parser = new TwitterParser();
  private blockBuilder = new TwitterBlockBuilder();
  private domExtractor = new TwitterDomExtractor();

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

    // Fallback path: parse from HTML
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

  private extractFromRawData(page: RenderedPage, rawData: string): ExtractResult {
    const parsedData = JSON.parse(rawData);
    const tweets = this.parser.parseFromRawState(parsedData);

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

    // Check what elements exist in HTML
    const articleCount = $('article').length;
    const dataTestIdCount = $('[data-testid]').length;

    // List all data-testid values found
    const testIds: string[] = [];
    $('[data-testid]').each((_, el) => {
      const id = $(el).attr('data-testid');
      if (id && !testIds.includes(id)) {
        testIds.push(id);
      }
    });

    const tweetTestIdCount = $('[data-testid="tweet"]').length;
    const bodyText = $('body').text().slice(0, 500);

    console.error(`[DEBUG] article elements: ${articleCount}`);
    console.error(`[DEBUG] [data-testid] elements: ${dataTestIdCount}`);
    console.error(`[DEBUG] data-testid values found: ${testIds.join(', ')}`);
    console.error(`[DEBUG] [data-testid="tweet"] elements: ${tweetTestIdCount}`);
    console.error(`[DEBUG] HTML length: ${page.html.length}`);
    console.error(`[DEBUG] Body text preview: ${bodyText}`);

    // Check for common Twitter patterns
    const hasSignin = $('body').text().toLowerCase().includes('sign in') || $('body').text().toLowerCase().includes('log in');
    const hasAuth = $('body').text().toLowerCase().includes('verify') || $('body').text().toLowerCase().includes('authorized') || $('body').text().toLowerCase().includes('suspended');
    console.error(`[DEBUG] Has sign-in wall: ${hasSignin}, auth required: ${hasAuth}`);

    // Extract all tweets from same author
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
        .filter((m: typeof tweet.media[number]) => m.type === 'image')
        .map((m: typeof tweet.media[number]) => ({
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
