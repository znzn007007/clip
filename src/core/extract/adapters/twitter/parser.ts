import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

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
  parseFromCheerio($: cheerio.CheerioAPI, element: AnyNode): TweetData {
    try {
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
    } catch (error) {
      // Return empty tweet data on parsing error
      return {
        id: '',
        text: '',
        author: {
          screenName: '',
          displayName: '',
        },
        createdAt: new Date().toISOString(),
        metrics: {
          likes: 0,
          retweets: 0,
          replies: 0,
          views: 0,
        },
        media: [],
        hashtags: [],
        urls: [],
      };
    }
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
