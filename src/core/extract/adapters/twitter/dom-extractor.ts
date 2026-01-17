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
