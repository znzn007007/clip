import { describe, it, expect } from '@jest/globals';
import { TwitterBlockBuilder } from '../block-builder.js';

describe('TwitterBlockBuilder', () => {
  it('builds blocks for full tweet content', () => {
    const builder = new TwitterBlockBuilder();
    const blocks = builder.tweetToBlocks({
      id: '1',
      text: 'Check http:example.com',
      author: { screenName: 'user', displayName: 'User' },
      createdAt: '2026-01-01T00:00:00Z',
      metrics: { likes: 1, retweets: 2, replies: 3, views: 4 },
      media: [
        { type: 'image', url: 'https://img.example/1.jpg', alt: 'Alt' },
        { type: 'video', url: 'https://video.example/1.mp4', thumbnailUrl: 'https://video.example/1.jpg' },
      ],
      hashtags: ['#tag'],
      urls: [{ url: 'http:example.com', displayUrl: 'example.com' }],
      quotedTweet: {
        id: '2',
        text: 'quoted',
        author: { screenName: 'other', displayName: 'Other' },
        createdAt: '2026-01-01T00:00:00Z',
        metrics: { likes: 0, retweets: 0, replies: 0, views: 0 },
        media: [],
        hashtags: [],
        urls: [],
      },
    });

    const paragraph = blocks.find((b) => b.type === 'paragraph');
    expect(paragraph).toMatchObject({
      type: 'paragraph',
      content: 'Check [example.com](http:example.com)',
    });

    expect(blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'hashtag', tag: '#tag' }),
        expect.objectContaining({ type: 'image', url: 'https://img.example/1.jpg' }),
        expect.objectContaining({ type: 'video', url: 'https://video.example/1.mp4' }),
        expect.objectContaining({ type: 'link', url: 'http:example.com' }),
        expect.objectContaining({ type: 'quote', content: 'quoted', author: '@other' }),
      ])
    );

    expect(blocks[blocks.length - 1]).toMatchObject({
      type: 'tweet_meta',
      likes: 1,
      retweets: 2,
      replies: 3,
      views: 4,
    });
  });

  it('skips paragraph when text is empty', () => {
    const builder = new TwitterBlockBuilder();
    const blocks = builder.tweetToBlocks({
      id: '1',
      text: '',
      author: { screenName: 'user', displayName: 'User' },
      createdAt: '2026-01-01T00:00:00Z',
      metrics: { likes: 0, retweets: 0, replies: 0, views: 0 },
      media: [],
      hashtags: [],
      urls: [],
    });

    expect(blocks.find((b) => b.type === 'paragraph')).toBeUndefined();
  });
});
