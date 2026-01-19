import { describe, it, expect, jest } from '@jest/globals';
import * as cheerio from 'cheerio';
import { TwitterParser } from '../parser.js';

describe('TwitterParser', () => {
  it('returns empty array for invalid raw state', () => {
    const parser = new TwitterParser();

    expect(parser.parseFromRawState(null)).toEqual([]);
    expect(parser.parseFromRawState('{invalid json')).toEqual([]);
    expect(parser.parseFromRawState({})).toEqual([]);
  });

  it('parses raw state with quoted tweet', () => {
    const parser = new TwitterParser();
    const result = parser.parseFromRawState({
      tweets: [
        {
          id: '1',
          text: 'main',
          author: { name: 'User', screenName: 'user' },
          createdAt: '2026-01-01T00:00:00Z',
          metrics: { likes: 1, retweets: 2, replies: 3, views: 4 },
          quotedTweet: {
            id: '2',
            text: 'quoted',
            author: { name: 'Other', screenName: 'other' },
            createdAt: '2026-01-01T00:00:00Z',
            metrics: { likes: 0, retweets: 0, replies: 0, views: 0 },
          },
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].quotedTweet?.id).toBe('2');
    expect(result[0].quotedTweet?.author.screenName).toBe('other');
  });

  it('parses tweet content from cheerio element', () => {
    const parser = new TwitterParser();
    const html = `
      <article data-testid="tweet">
        <a href="/user/status/123"></a>
        <div data-testid="tweetText">Hello   world</div>
        <div data-testid="User-Name">
          <a href="/user"><span>Display Name</span></a>
        </div>
        <time datetime="2026-01-01T00:00:00Z"></time>
        <div data-testid="reply" aria-label="1 replies"></div>
        <div data-testid="retweet" aria-label="2 reposts"></div>
        <div data-testid="like" aria-label="3 likes"></div>
        <div data-testid="views" aria-label="4 views"></div>
        <img src="https://pbs.twimg.com/media/photo.jpg?format=jpg&name=small" alt="Photo">
        <img src="https://media.example.com/other.jpg?format=jpg&name=small" alt="Other">
        <video poster="https://video.example.com/poster.jpg">
          <source src="https://video.example.com/video.mp4" />
        </video>
        <a href="/hashtag/test">#test</a>
        <a href="http:example.com">example.com</a>
      </article>
    `;
    const $ = cheerio.load(html);
    const element = $('article')[0];

    const data = parser.parseFromCheerio($, element);

    expect(data.id).toBe('123');
    expect(data.text).toBe('Hello world');
    expect(data.author.screenName).toBe('user');
    expect(data.author.displayName).toBe('Display Name');
    expect(data.metrics).toEqual({ replies: 1, retweets: 2, likes: 3, views: 4 });
    expect(data.hashtags).toEqual(['#test']);
    expect(data.urls).toEqual([{ url: 'http:example.com', displayUrl: 'example.com' }]);
    expect(data.media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'image', url: 'https://pbs.twimg.com/media/photo.jpg?format=jpg&name=orig' }),
        expect.objectContaining({ type: 'image', url: 'https://media.example.com/other.jpg?format=jpg&name=orig' }),
        expect.objectContaining({ type: 'video', url: 'https://video.example.com/video.mp4', thumbnailUrl: 'https://video.example.com/poster.jpg' }),
      ])
    );
  });

  it('returns empty tweet data on parsing error', () => {
    const parser = new TwitterParser();
    const html = `<article data-testid="tweet"></article>`;
    const $ = cheerio.load(html);
    const element = $('article')[0];

    const extractSpy = jest.spyOn(parser as any, 'extractId').mockImplementation(() => {
      throw new Error('boom');
    });

    const data = parser.parseFromCheerio($, element);

    extractSpy.mockRestore();

    expect(data.id).toBe('');
    expect(data.text).toBe('');
    expect(data.media).toEqual([]);
    expect(data.urls).toEqual([]);
  });
});
