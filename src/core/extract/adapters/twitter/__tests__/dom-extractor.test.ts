import { describe, it, expect, jest } from '@jest/globals';
import { TwitterDomExtractor } from '../dom-extractor.js';

type FakeElement = {
  textContent?: string;
  getAttribute: (name: string) => string | null;
  querySelector: (selector: string) => FakeElement | null;
  querySelectorAll: (selector: string) => FakeElement[];
  cloneNode: (deep?: boolean) => FakeElement;
  remove?: () => void;
};

const makeElement = (options: {
  textContent?: string;
  attributes?: Record<string, string>;
  queryMap?: Record<string, FakeElement | null>;
  queryAllMap?: Record<string, FakeElement[]>;
  cloneTextContent?: string;
  cloneQueryAllMap?: Record<string, FakeElement[]>;
} = {}): FakeElement => {
  const {
    textContent = '',
    attributes = {},
    queryMap = {},
    queryAllMap = {},
    cloneTextContent,
    cloneQueryAllMap,
  } = options;

  return {
    textContent,
    getAttribute: (name: string) => attributes[name] ?? null,
    querySelector: (selector: string) => queryMap[selector] ?? null,
    querySelectorAll: (selector: string) => queryAllMap[selector] ?? [],
    cloneNode: () =>
      makeElement({
        textContent: cloneTextContent ?? textContent,
        queryAllMap: cloneQueryAllMap ?? queryAllMap,
      }),
  };
};

const makeRemovable = (): FakeElement => ({
  textContent: '',
  getAttribute: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  cloneNode: () => makeRemovable(),
  remove: jest.fn(),
});

describe('TwitterDomExtractor', () => {
  it('extracts tweets by executing DOM evaluate logic', async () => {
    const authorEl = makeElement({
      queryMap: {
        span: makeElement({ textContent: 'Author Name' }),
        'a[href^="/"]': makeElement({ attributes: { href: '/author' } }),
      },
    });

    const tweetTextEl = makeElement({ textContent: 'Hello from tweet text' });
    const avatarEl = makeElement({ attributes: { src: 'https://pbs.twimg.com/profile_images/avatar.jpg' } });
    const timeEl = makeElement({ attributes: { datetime: '2026-01-19T12:00:00Z' } });

    const metrics = {
      '[data-testid="reply"]': makeElement({ attributes: { 'aria-label': '1 Reply' } }),
      '[data-testid="retweet"]': makeElement({ attributes: { 'aria-label': '2 Retweets' } }),
      '[data-testid="like"]': makeElement({ attributes: { 'aria-label': '3 Likes' } }),
      '[data-testid="views"]': makeElement({ attributes: { 'aria-label': '1234 Views' } }),
    };

    const imageMain = makeElement({
      attributes: { src: 'https://pbs.twimg.com/media/photo1.jpg?format=jpg&name=small', alt: 'Photo 1' },
    });
    const imageProfile = makeElement({
      attributes: { src: 'https://pbs.twimg.com/profile_images/ignored.jpg', alt: 'Avatar' },
    });

    const videoSource = makeElement({ attributes: { src: 'https://video.twimg.com/video.mp4' } });
    const videoEl = makeElement({
      attributes: { poster: 'https://video.twimg.com/poster.jpg' },
      queryMap: { source: videoSource },
    });

    const hashtagGood = makeElement({ textContent: '#tag' });
    const hashtagBad = makeElement({ textContent: 'tag' });
    const urlLink = makeElement({ textContent: 'Example', attributes: { href: 'https://example.com' } });
    const permalink = makeElement({ attributes: { href: '/author/status/123' } });

    const articleWithTweetText = makeElement({
      queryMap: {
        '[data-testid="tweetText"]': tweetTextEl,
        '[data-testid="User-Name"]': authorEl,
        'img[src*="profile_images"]': avatarEl,
        time: timeEl,
        'a[href*="/status/"]': permalink,
        ...metrics,
      },
      queryAllMap: {
        'img[src*="pbs.twimg.com"]': [imageMain, imageProfile],
        video: [videoEl],
        'a[href^="/hashtag/"]': [hashtagGood, hashtagBad],
        'a[href^="http"]': [urlLink],
      },
    });

    const longformSpan1 = makeElement({ textContent: 'Longform ' });
    const longformSpan2 = makeElement({ textContent: 'content' });
    const longformEl = makeElement({
      queryAllMap: { 'span[data-text="true"]': [longformSpan1, longformSpan2] },
    });

    const articleLongform = makeElement({
      queryMap: {
        '[data-testid="longformRichTextComponent"]': longformEl,
      },
    });

    const articleFallback = makeElement({
      textContent: '',
      cloneTextContent: 'Fallback content',
      cloneQueryAllMap: {
        '[data-testid="User-Name"], [data-testid="UserActions"], [role="group"], time, svg': [makeRemovable()],
      },
    });

    const originalDocument = (globalThis as any).document;
    (globalThis as any).document = {
      querySelectorAll: (selector: string) =>
        selector === 'article[data-testid="tweet"]'
          ? [articleWithTweetText, articleLongform, articleFallback]
          : [],
    };

    const page = {
      evaluate: jest.fn((fn: () => unknown) => Promise.resolve(fn())),
    } as any;

    const extractor = new TwitterDomExtractor();
    const result = await extractor.extract(page);

    (globalThis as any).document = originalDocument;

    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(result.tweets).toHaveLength(3);
    expect(result.tweets[0]).toMatchObject({
      id: '123',
      text: 'Hello from tweet text',
      author: { name: 'Author Name', screenName: 'author', avatarUrl: 'https://pbs.twimg.com/profile_images/avatar.jpg' },
      createdAt: '2026-01-19T12:00:00Z',
      metrics: { replies: 1, retweets: 2, likes: 3, views: 1234 },
    });
    expect(result.tweets[0].media).toMatchObject([
      { type: 'image', url: 'https://pbs.twimg.com/media/photo1.jpg?format=jpg&name=orig', alt: 'Photo 1' },
      { type: 'video', url: 'https://video.twimg.com/video.mp4', thumbnailUrl: 'https://video.twimg.com/poster.jpg' },
    ]);
    expect(result.tweets[0].hashtags).toEqual(['#tag']);
    expect(result.tweets[0].urls).toEqual([{ url: 'https://example.com', displayUrl: 'Example' }]);

    expect(result.tweets[1].text).toBe('Longform content');
    expect(result.tweets[2].text).toBe('Fallback content');
    expect(result.metadata.extractedFrom).toBe('dom_extraction');
  });
});
