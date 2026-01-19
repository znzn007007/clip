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
      .mockImplementationOnce(() => Promise.resolve(undefined)) // scrollBy
      .mockImplementationOnce(() => Promise.resolve(1000)) // scrollHeight
      .mockImplementationOnce(() => Promise.resolve(undefined)) // scrollBy
      .mockImplementationOnce(() => Promise.resolve(1000)) // scrollHeight (break)
      .mockImplementationOnce(() => Promise.resolve(undefined)); // scrollTo top

    const page = {
      goto: mockResolved(undefined),
      waitForTimeout: mockResolved(undefined),
      waitForSelector: mockRejected(new Error('no selector')),
      title: mockResolved('Test Title'),
      content: mockResolved('<html></html>'),
      $eval: mockResolved('https://x.com/status/1'),
      evaluate,
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
    expect(result.rawData).toContain('extractedFrom');
    expect(result.debugHtmlPath).toBeDefined();
    expect(result.debugDataPath).toBeDefined();
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

    const originalWindow = (globalThis as any).window;
    const originalDocument = (globalThis as any).document;
    const scrollBy = jest.fn();
    const scrollTo = jest.fn();
    (globalThis as any).window = { scrollBy, scrollTo, innerHeight: 800 };
    (globalThis as any).document = { body: { scrollHeight: 1000 } };

    const evaluate = jest.fn((fn: () => unknown) => Promise.resolve(fn()));

    const page = {
      goto: mockResolved(undefined),
      waitForTimeout: mockResolved(undefined),
      waitForSelector: mockResolved(undefined),
      title: mockResolved('Twitter Title'),
      content: mockResolved('<html></html>'),
      $eval: mockRejected(new Error('no canonical')),
      evaluate,
    };

    const context = { newPage: jest.fn(() => Promise.resolve(page)) } as any;

    ExtractorMock.mockImplementation(() => ({
      extract: mockResolved(undefined),
    }) as any);

    const renderer = new PageRenderer(context);
    const result = await renderer.render('https://x.com/status/1', { maxScrolls: 1 });

    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;

    expect(result.canonicalUrl).toBeUndefined();
    expect(scrollBy).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalled();
  });

  it('returns undefined rawData when twitter extractor throws', async () => {
    detectPlatformMock.mockReturnValue('twitter' as any);

    const page = {
      goto: mockResolved(undefined),
      waitForTimeout: mockResolved(undefined),
      waitForSelector: mockResolved(undefined),
      title: mockResolved('Twitter Title'),
      content: mockResolved('<html></html>'),
      $eval: mockResolved('https://x.com/status/1'),
      evaluate: mockResolved(undefined),
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
});
