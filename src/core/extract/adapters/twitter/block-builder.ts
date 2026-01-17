import type { Block } from '../../../types/index.js';
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
