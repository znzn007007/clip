import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PageRenderer } from '../page.js';
import { TwitterRawExtractor } from '../../extract/adapters/twitter/raw-extractor.js';
import { detectPlatform, isValidUrl } from '../utils.js';
import { promises as fs } from 'fs';

jest.mock('../../extract/adapters/twitter/raw-extractor.js');
jest.mock('../utils.js', () => ({
  detectPlatform: jest.fn(),
  isValidUrl: jest.fn(),
}));
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
  },
}));

describe('PageRenderer', () => {
  const ExtractorMock = TwitterRawExtractor as jest.MockedClass<typeof TwitterRawExtractor>;
  const detectPlatformMock = detectPlatform as jest.MockedFunction<typeof detectPlatform>;
  const isValidUrlMock = isValidUrl as jest.MockedFunction<typeof isValidUrl>;
  const mkdirMock = fs.mkdir as unknown as jest.Mock;
  const writeFileMock = fs.writeFile as unknown as jest.Mock;

  const mockResolved = <T>(value: T) => {
    return jest.fn(() => Promise.resolve(value)) as jest.Mock;
  };
  const mockRejected = (error: unknown) => {
    return jest.fn(() => Promise.reject(error)) as jest.Mock;
  };

  let consoleSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    isValidUrlMock.mockReturnValue(true);
    mkdirMock.mockImplementation(() => Promise.resolve());
    writeFileMock.mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('throws for invalid URL', async () => {
    isValidUrlMock.mockReturnValue(false);
    const context = { newPage: jest.fn() } as any;
    const renderer = new PageRenderer(context);

    await expect(renderer.render('not-a-url')).rejects.toThrow('Invalid URL');
  });

  it('renders twitter page with debug outputs', async () => {
    detectPlatformMock.mockReturnValue('twitter' as any);

    const evaluate = jest.fn() as jest.Mock;
    evaluate
      .mockImplementationOnce(() => Promise.resolve(undefined)) // expandShowMoreButtons (initial)
      .mockImplementationOnce(() => Promise.resolve(undefined)) // scroll 1
      .mockImplementationOnce(() => Promise.resolve(undefined)) // expandShowMoreButtons
      .mockImplementationOnce(() => Promise.resolve(undefined)) // scroll 2
      .mockImplementationOnce(() => Promise.resolve(undefined)) // expandShowMoreButtons
      .mockImplementationOnce(() => Promise.resolve(undefined)); // scrollTo top

    const locator = {
      count: jest.fn().mockImplementation(() => Promise.resolve(0)) as jest.Mock,
    };

    const page = {
      goto: mockResolved(undefined),
      waitForTimeout: mockResolved(undefined),
      waitForSelector: mockRejected(new Error('no selector')),
      title: mockResolved('Test Title'),
      content: mockResolved('<html></html>'),
      $eval: mockResolved('https://x.com/status/1'),
      evaluate,
      locator: jest.fn(() => locator) as jest.Mock,
    };

    const context = { newPage: jest.fn(() => Promise.resolve(page)) } as any;

    ExtractorMock.mockImplementation(() => ({
      extract: mockResolved({
        metadata: { extractedFrom: 'state' },
        tweets: [{ id: '1' }, { id: '2' }],
      }),
    }) as any);

    const renderer = new PageRenderer(context);
    const result = await renderer.render('https://x.com/status/1', {
      debug: true,
      maxScrolls: 2,
    });

    expect(result.platform).toBe('twitter');
    // Twitter no longer extracts rawData (changed behavior)
    expect(result.rawData).toBeUndefined();
    expect(result.debugHtmlPath).toBeDefined();
    // debugDataPath is only set if rawData exists
    expect(result.debugDataPath).toBeUndefined();
    expect(mkdirMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalled();
    expect(page.goto).toHaveBeenCalledWith('https://x.com/status/1', expect.any(Object));
  });

  it('extracts zhihu raw data when platform is zhihu', async () => {
    detectPlatformMock.mockReturnValue('zhihu' as any);

    const page = {
      goto: mockResolved(undefined),
      waitForTimeout: mockResolved(undefined),
      waitForSelector: mockResolved(undefined),
      title: mockResolved('Zhihu Title'),
      content: mockResolved('<html></html>'),
      $eval: mockResolved('https://zhihu.com/question/1'),
      evaluate: mockResolved('{"question":1,"answer":2}'),
    };

    const context = { newPage: jest.fn(() => Promise.resolve(page)) } as any;
    const renderer = new PageRenderer(context);

    const result = await renderer.render('https://zhihu.com/question/1');

    expect(result.platform).toBe('zhihu');
    expect(result.rawData).toContain('question');
    expect(page.evaluate).toHaveBeenCalled();
  });

  it('handles twitter scrolling with evaluate callbacks and missing canonical URL', async () => {
    detectPlatformMock.mockReturnValue('twitter' as any);

    const evaluate = jest.fn().mockImplementation(() => Promise.resolve(undefined)) as jest.Mock;

    const locator = {
      count: jest.fn().mockImplementation(() => Promise.resolve(0)) as jest.Mock,
    };

    const page = {
      goto: mockResolved(undefined),
      waitForTimeout: mockResolved(undefined),
      waitForSelector: mockResolved(undefined),
      title: mockResolved('Twitter Title'),
      content: mockResolved('<html></html>'),
      $eval: mockRejected(new Error('no canonical')),
      evaluate,
      locator: jest.fn(() => locator) as jest.Mock,
    };

    const context = { newPage: jest.fn(() => Promise.resolve(page)) } as any;

    ExtractorMock.mockImplementation(() => ({
      extract: mockResolved(undefined),
    }) as any);

    const renderer = new PageRenderer(context);
    const result = await renderer.render('https://x.com/status/1', { maxScrolls: 1 });

    expect(result.canonicalUrl).toBeUndefined();
    // The new implementation uses page.evaluate directly for scrolling
    expect(evaluate).toHaveBeenCalled();
  });

  it('returns undefined rawData when twitter extractor throws', async () => {
    detectPlatformMock.mockReturnValue('twitter' as any);

    const locator = {
      count: jest.fn().mockImplementation(() => Promise.resolve(0)) as jest.Mock,
    };

    const page = {
      goto: mockResolved(undefined),
      waitForTimeout: mockResolved(undefined),
      waitForSelector: mockResolved(undefined),
      title: mockResolved('Twitter Title'),
      content: mockResolved('<html></html>'),
      $eval: mockResolved('https://x.com/status/1'),
      evaluate: mockResolved(undefined),
      locator: jest.fn(() => locator) as jest.Mock,
    };

    const context = { newPage: jest.fn(() => Promise.resolve(page)) } as any;

    ExtractorMock.mockImplementation(() => ({
      extract: mockRejected(new Error('boom')),
    }) as any);

    const renderer = new PageRenderer(context);
    const result = await renderer.render('https://x.com/status/1', { maxScrolls: 0 });

    expect(result.rawData).toBeUndefined();
  });

  it('extracts zhihu raw data from window state', async () => {
    detectPlatformMock.mockReturnValue('zhihu' as any);

    const originalWindow = (globalThis as any).window;
    const originalDocument = (globalThis as any).document;
    (globalThis as any).window = { __INITIAL_STATE__: { question: 1 } };
    (globalThis as any).document = { querySelectorAll: jest.fn() };

    const page = {
      goto: mockResolved(undefined),
      waitForTimeout: mockResolved(undefined),
      waitForSelector: mockResolved(undefined),
      title: mockResolved('Zhihu Title'),
      content: mockResolved('<html></html>'),
      $eval: mockResolved('https://zhihu.com/question/1'),
      evaluate: jest.fn((fn: () => unknown) => Promise.resolve(fn())),
    };

    const context = { newPage: jest.fn(() => Promise.resolve(page)) } as any;
    const renderer = new PageRenderer(context);

    const result = await renderer.render('https://zhihu.com/question/1');

    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;

    expect(result.rawData).toContain('question');
  });

  it('extracts zhihu raw data from script fallback and handles evaluate errors', async () => {
    detectPlatformMock.mockReturnValue('zhihu' as any);

    const originalWindow = (globalThis as any).window;
    const originalDocument = (globalThis as any).document;
    const script = { textContent: 'var data = {\"question\":1,\"answer\":2};' };
    (globalThis as any).window = {};
    (globalThis as any).document = {
      querySelectorAll: jest.fn(() => [script]),
    };

    const page = {
      goto: mockResolved(undefined),
      waitForTimeout: mockResolved(undefined),
      waitForSelector: mockResolved(undefined),
      title: mockResolved('Zhihu Title'),
      content: mockResolved('<html></html>'),
      $eval: mockResolved('https://zhihu.com/question/1'),
      evaluate: jest.fn((fn: () => unknown) => Promise.resolve(fn())),
    };

    const context = { newPage: jest.fn(() => Promise.resolve(page)) } as any;
    const renderer = new PageRenderer(context);

    const result = await renderer.render('https://zhihu.com/question/1');

    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;

    expect(result.rawData).toContain('answer');

    const failingPage = {
      ...page,
      evaluate: mockRejected(new Error('boom')),
    };
    const failingContext = { newPage: jest.fn(() => Promise.resolve(failingPage)) } as any;
    const failingRenderer = new PageRenderer(failingContext);
    const fallbackResult = await failingRenderer.render('https://zhihu.com/question/1');
    expect(fallbackResult.rawData).toBeUndefined();
  });

  describe('handleTwitter', () => {
    it('should stop when reaching maxTweets', async () => {
      const evaluate = jest.fn() as jest.Mock;
      const locator = {
        count: jest.fn() as jest.Mock,
      };
      const page = {
        evaluate,
        locator: jest.fn(() => locator) as jest.Mock,
        waitForTimeout: mockResolved(undefined),
      } as any;

      const context = { newPage: jest.fn(() => Promise.resolve(page)) } as any;
      const renderer = new PageRenderer(context);

      // Spy on expandShowMoreButtons to avoid actual implementation
      const expandSpy = jest.spyOn(renderer as any, 'expandShowMoreButtons').mockResolvedValue(undefined);

      // Simulate tweet counts: starts at 5, then increments by 1 each scroll until reaching 7
      const tweetCounts = [5, 6, 7];
      let countIndex = 0;
      locator.count.mockImplementation(() => Promise.resolve(tweetCounts[countIndex++]));

      // maxScrolls=10, maxTweets=7, should stop when reaching 7 tweets
      await (renderer as any).handleTwitter(page, 10, 7);

      // Should have called count 3 times (5 -> 6 -> 7, then stop)
      expect(locator.count).toHaveBeenCalledTimes(3);
      // Should have called evaluate 4 times: 3 scrolls + 1 scroll to top
      expect(evaluate).toHaveBeenCalledTimes(4);

      expandSpy.mockRestore();
    });

    it('should stop after 3 unchanged scrolls', async () => {
      const evaluate = jest.fn() as jest.Mock;
      const locator = {
        count: jest.fn() as jest.Mock,
      };
      const page = {
        evaluate,
        locator: jest.fn(() => locator) as jest.Mock,
        waitForTimeout: mockResolved(undefined),
      } as any;

      const context = { newPage: jest.fn(() => Promise.resolve(page)) } as any;
      const renderer = new PageRenderer(context);

      // Spy on expandShowMoreButtons to avoid actual implementation
      const expandSpy = jest.spyOn(renderer as any, 'expandShowMoreButtons').mockResolvedValue(undefined);

      // Simulate tweet count staying at 1 (no new tweets loading)
      locator.count.mockImplementation(() => Promise.resolve(1));

      // maxScrolls=10, maxTweets=100, should stop after 3 unchanged scrolls
      await (renderer as any).handleTwitter(page, 10, 100);

      // Should have called count 4 times (initial + 3 unchanged checks)
      expect(locator.count).toHaveBeenCalledTimes(4);
      // Should have called evaluate 5 times: 4 scrolls (3 unchanged + 1 to check condition) + 1 scroll to top
      expect(evaluate).toHaveBeenCalledTimes(5);

      expandSpy.mockRestore();
    });

    it('should reset unchangedCount when new tweets load', async () => {
      const evaluate = jest.fn() as jest.Mock;
      const locator = {
        count: jest.fn() as jest.Mock,
      };
      const page = {
        evaluate,
        locator: jest.fn(() => locator) as jest.Mock,
        waitForTimeout: mockResolved(undefined),
      } as any;

      const context = { newPage: jest.fn(() => Promise.resolve(page)) } as any;
      const renderer = new PageRenderer(context);

      // Spy on expandShowMoreButtons to avoid actual implementation
      const expandSpy = jest.spyOn(renderer as any, 'expandShowMoreButtons').mockResolvedValue(undefined);

      // Simulate: 5 -> 5 (unchanged) -> 6 (new) -> 6 (unchanged) -> 6 (unchanged) -> 6 (unchanged, stop)
      const tweetCounts = [5, 5, 6, 6, 6, 6];
      let countIndex = 0;
      locator.count.mockImplementation(() => Promise.resolve(tweetCounts[countIndex++]));

      // maxScrolls=10, maxTweets=100
      await (renderer as any).handleTwitter(page, 10, 100);

      // Should scroll 5 times before stopping (3 consecutive unchanged at the end)
      // Evaluate calls: 6 scrolls + 1 scroll to top = 7
      expect(evaluate).toHaveBeenCalledTimes(7);
      expect(locator.count).toHaveBeenCalledTimes(6);

      expandSpy.mockRestore();
    });
  });
});
