// src/core/extract/adapters/twitter.ts
import { BaseAdapter } from './base.js';
import type { ExtractResult } from '../types.js';
import type { RenderedPage } from '../../render/types.js';
import type { ClipDoc, Block, AssetImage } from '../../types/index.js';
import { TwitterParser, type TweetData } from './twitter/parser.js';
import { TwitterBlockBuilder } from './twitter/block-builder.js';
import { TwitterExtractError } from './twitter/errors.js';
import { TwitterDomExtractor } from './twitter/dom-extractor.js';
import * as cheerio from 'cheerio';

interface TweetMetadata {
  author: string;
  publishedAt?: string;
  tweetData: TweetData | null;
  allTweets?: TweetData[];  // All tweets in thread (for fallback path)
}

export class TwitterAdapter extends BaseAdapter {
  readonly platform = 'twitter';
  readonly domains = ['x.com', 'twitter.com'];

  private parser = new TwitterParser();
  private blockBuilder = new TwitterBlockBuilder();
  private domExtractor = new TwitterDomExtractor();

  async extract(page: RenderedPage): Promise<ExtractResult> {
    const warnings: string[] = [];

    // Step 1: Extract metadata first (async)
    const metadata = await this.extractMetadata(page, warnings);

    // Step 2: Prefer rawData for threads (multiple tweets), use HTML for single tweets
    // If we have allTweets from rawData and it's a thread (more than 1 tweet), use rawData
    if (metadata.allTweets && metadata.allTweets.length > 1) {
      const blocks = metadata.allTweets.flatMap((tweet, index) => {
        const tweetBlocks = this.blockBuilder.tweetToBlocks(tweet);
        // Add separator between tweets
        if (index > 0) {
          return [{ type: 'paragraph' as const, content: '---' }, ...tweetBlocks];
        }
        return tweetBlocks;
      });

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
        warnings: [...warnings, 'Used rawData for thread extraction'],
      };
    }

    // Step 3: Generate blocks from HTML (for single tweets or when rawData unavailable)
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

    // Step 4: Final fallback to rawData → BlockBuilder (for single tweet when HTML parsing fails)
    if (metadata.tweetData) {
      let blocks: Block[];

      // Use allTweets if available (thread mode)
      if (metadata.allTweets && metadata.allTweets.length > 1) {
        blocks = metadata.allTweets.flatMap((tweet, index) => {
          const tweetBlocks = this.blockBuilder.tweetToBlocks(tweet);
          // Add separator between tweets
          if (index > 0) {
            return [{ type: 'paragraph' as const, content: '---' }, ...tweetBlocks];
          }
          return tweetBlocks;
        });
      } else {
        blocks = this.blockBuilder.tweetToBlocks(metadata.tweetData);
      }

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
            allTweets: tweets,  // Return all tweets for thread support
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
            allTweets: tweets,  // Return all tweets for thread support
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
