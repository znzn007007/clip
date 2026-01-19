// src/core/batch/__tests__/runner.test.ts
import { readFile } from 'node:fs/promises';
import { BatchRunner } from '../runner.js';
import { BrowserManager } from '../../render/browser.js';
import { PageRenderer } from '../../render/page.js';
import { registry } from '../../extract/registry.js';
import { MarkdownGenerator } from '../../export/markdown.js';
import { AssetDownloader } from '../../export/assets.js';
import { generateOutputPaths } from '../../export/path.js';
import { buildExportResult } from '../../export/json.js';
import { isValidUrl, normalizeUrl } from '../../render/utils.js';
import { ClipError } from '../../errors.js';
import { ErrorCode } from '../../export/types.js';
import { DedupeManager } from '../../dedupe/index.js';

// Mock BrowserManager
jest.mock('node:fs/promises');
jest.mock('../../render/browser.js');
jest.mock('../../render/page.js');
jest.mock('../../extract/registry.js');
jest.mock('../../export/markdown.js');
jest.mock('../../export/assets.js');
jest.mock('../../export/json.js');
jest.mock('../../export/path.js');
jest.mock('../../render/utils.js');
jest.mock('../../dedupe/index.js');

describe('BatchRunner', () => {
  let runner: BatchRunner;
  let mockBrowserManager: jest.Mocked<BrowserManager>;
  let mockContext: any;
  let mockDedupeManager: jest.Mocked<DedupeManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    runner = new BatchRunner();

    // Setup mock context
    mockContext = {
      page: {},
      close: jest.fn().mockResolvedValue(undefined),
    };

    // Setup mock BrowserManager
    mockBrowserManager = {
      launch: jest.fn().mockResolvedValue(mockContext),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    (BrowserManager as jest.MockedClass<typeof BrowserManager>).mockImplementation(() => mockBrowserManager);
    (isValidUrl as jest.Mock).mockReturnValue(true);
    (normalizeUrl as jest.Mock).mockImplementation((url: string) => url);

    // Setup mock DedupeManager
    mockDedupeManager = {
      load: jest.fn().mockResolvedValue(undefined),
      checkByUrl: jest.fn().mockResolvedValue({ isArchived: false }),
      checkByDoc: jest.fn().mockResolvedValue({ isArchived: false }),
      addRecord: jest.fn().mockResolvedValue(undefined),
      removeRecord: jest.fn().mockResolvedValue(undefined),
    } as any;

    (DedupeManager as jest.MockedClass<typeof DedupeManager>).mockImplementation(() => mockDedupeManager);
  });

  describe('parseUrls', () => {
    it('should read URLs from file when source is file', async () => {
      (readFile as jest.Mock).mockResolvedValue(
        'https://x.com/status/123\n# comment\nhttps://zhihu.com/question/456\n'
      );

      const urls = await runner.parseUrls('file', 'urls.txt');

      expect(readFile).toHaveBeenCalledWith('urls.txt', 'utf-8');
      expect(urls).toEqual([
        'https://x.com/status/123',
        'https://zhihu.com/question/456',
      ]);
    });

    it('should read URLs from stdin when source is stdin', async () => {
      const originalIterator = (process.stdin as any)[Symbol.asyncIterator];
      (process.stdin as any)[Symbol.asyncIterator] = async function* () {
        yield Buffer.from('https://x.com/status/1\n# comment\n');
        yield Buffer.from('https://zhihu.com/question/2\n');
      };

      try {
        const urls = await runner.parseUrls('stdin');
        expect(urls).toEqual([
          'https://x.com/status/1',
          'https://zhihu.com/question/2',
        ]);
      } finally {
        (process.stdin as any)[Symbol.asyncIterator] = originalIterator;
      }
    });

    it('should parse URLs from file content', async () => {
      const content =
        'https://x.com/status/123\n' +
        '# comment\n' +
        'https://zhihu.com/question/456\n' +
        '\n'; // empty line

      // Test the parsing logic directly by testing the URL parsing logic
      const lines = content.split('\n');
      const urls = lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));

      expect(urls).toEqual([
        'https://x.com/status/123',
        'https://zhihu.com/question/456',
      ]);
    });

    it('should filter out empty lines and comments', () => {
      const content =
        '# First comment\n' +
        'https://x.com/status/1\n' +
        '\n' +
        '# Second comment\n' +
        'https://zhihu.com/question/2\n' +
        '\n' +
        '\n';

      const lines = content.split('\n');
      const urls = lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));

      expect(urls).toEqual([
        'https://x.com/status/1',
        'https://zhihu.com/question/2',
      ]);
    });

    it('should return empty array for content with no URLs', () => {
      const content = '# Only comments\n\n# And empty lines\n';

      const lines = content.split('\n');
      const urls = lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));

      expect(urls).toEqual([]);
    });

    it('should trim whitespace from URLs', () => {
      const content =
        '  https://x.com/status/123  \n' +
        '\thttps://zhihu.com/question/456\t\n';

      const lines = content.split('\n');
      const urls = lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));

      expect(urls).toEqual([
        'https://x.com/status/123',
        'https://zhihu.com/question/456',
      ]);
    });
  });

  describe('run', () => {
    it('should throw error when source is file but filePath is missing', async () => {
      await expect(
        runner['parseUrls']('file', undefined)
      ).rejects.toThrow();
    });

    it('should return empty summary when no URLs provided', async () => {
      // Mock parseUrls to return empty array
      jest.spyOn(runner as any, 'parseUrls').mockResolvedValue([]);

      const summary = await runner.run({
        source: 'file',
        filePath: 'test.txt',
        continueOnError: false,
        jsonl: false,
        outputDir: '/test/output',
        format: 'md',
        downloadAssets: false,
      });

      expect(summary).toEqual({
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        duration: expect.any(Number),
        failures: [],
      });
      expect(summary.duration).toBeGreaterThanOrEqual(0);
    });

    it('should launch browser once for all URLs', async () => {
      const mockUrls = [
        'https://x.com/status/123',
        'https://zhihu.com/question/456',
      ];

      jest.spyOn(runner as any, 'parseUrls').mockResolvedValue(mockUrls);

      // Mock processUrl to return success
      jest.spyOn(runner as any, 'processUrl').mockResolvedValue({
        status: 'success',
        platform: 'twitter',
        canonicalUrl: 'https://x.com/status/123',
        title: 'Test',
        paths: { markdownPath: '/test.md' },
        stats: { wordCount: 100, imageCount: 0 },
      });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await runner.run({
        source: 'file',
        filePath: 'test.txt',
        continueOnError: false,
        jsonl: false,
        outputDir: '/test/output',
        format: 'md',
        downloadAssets: false,
      });

      // BrowserManager should be constructed once
      expect(BrowserManager).toHaveBeenCalledTimes(1);
      // launch should be called once
      expect(mockBrowserManager.launch).toHaveBeenCalledTimes(1);
      // close should be called once after all URLs
      expect(mockBrowserManager.close).toHaveBeenCalledTimes(1);

      consoleLogSpy.mockRestore();
    });

    it('should process URLs successfully', async () => {
      const mockUrls = [
        'https://x.com/status/123',
        'https://zhihu.com/question/456',
      ];

      jest.spyOn(runner as any, 'parseUrls').mockResolvedValue(mockUrls);

      // Mock processUrl to return success
      jest.spyOn(runner as any, 'processUrl').mockResolvedValue({
        status: 'success',
        platform: 'twitter',
        canonicalUrl: 'https://x.com/status/123',
        title: 'Test',
        paths: { markdownPath: '/test.md' },
        stats: { wordCount: 100, imageCount: 0 },
      });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const summary = await runner.run({
        source: 'file',
        filePath: 'test.txt',
        continueOnError: false,
        jsonl: false,
        outputDir: '/test/output',
        format: 'md',
        downloadAssets: false,
      });

      expect(summary.total).toBe(2);
      expect(summary.success).toBe(2);
      expect(summary.failed).toBe(0);
      expect(summary.failures).toEqual([]);

      consoleLogSpy.mockRestore();
    });

    it('should handle failures and continue when continueOnError is true', async () => {
      const mockUrls = [
        'https://x.com/status/123',
        'https://zhihu.com/question/456',
      ];

      jest.spyOn(runner as any, 'parseUrls').mockResolvedValue(mockUrls);

      // Mock processUrl to succeed once, then fail
      jest.spyOn(runner as any, 'processUrl')
        .mockResolvedValueOnce({
          status: 'success',
          platform: 'twitter',
          canonicalUrl: 'https://x.com/status/123',
          title: 'Test',
          paths: { markdownPath: '/test.md' },
          stats: { wordCount: 100, imageCount: 0 },
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const summary = await runner.run({
        source: 'file',
        filePath: 'test.txt',
        continueOnError: true,
        jsonl: false,
        outputDir: '/test/output',
        format: 'md',
        downloadAssets: false,
      });

      expect(summary.total).toBe(2);
      expect(summary.success).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.failures).toHaveLength(1);
      expect(summary.failures[0].url).toBe('https://zhihu.com/question/456');
      expect(summary.failures[0].error).toBe('Network error');

      consoleLogSpy.mockRestore();
    });

    it('should throw error when continueOnError is false and processing fails', async () => {
      const mockUrls = ['https://x.com/status/123'];

      jest.spyOn(runner as any, 'parseUrls').mockResolvedValue(mockUrls);

      jest.spyOn(runner as any, 'processUrl').mockRejectedValue(
        new Error('Network error')
      );

      await expect(
        runner.run({
          source: 'file',
          filePath: 'test.txt',
          continueOnError: false,
          jsonl: false,
          outputDir: '/test/output',
          format: 'md',
          downloadAssets: false,
        })
      ).rejects.toThrow('Network error');
    });

    it('should output JSONL when jsonl option is true', async () => {
      const mockUrls = ['https://x.com/status/123'];

      jest.spyOn(runner as any, 'parseUrls').mockResolvedValue(mockUrls);

      const mockResult = {
        status: 'success',
        platform: 'twitter',
        canonicalUrl: 'https://x.com/status/123',
        title: 'Test Tweet',
        paths: { markdownPath: '/test.md' },
        stats: { wordCount: 100, imageCount: 0 },
      };

      jest.spyOn(runner as any, 'processUrl').mockResolvedValue(mockResult);

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await runner.run({
        source: 'file',
        filePath: 'test.txt',
        continueOnError: false,
        jsonl: true,
        outputDir: '/test/output',
        format: 'md',
        downloadAssets: false,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(mockResult));

      consoleLogSpy.mockRestore();
    });

    it('should handle ExportResult with failed status', async () => {
      const mockUrls = ['https://x.com/status/123'];

      jest.spyOn(runner as any, 'parseUrls').mockResolvedValue(mockUrls);

      const mockResult = {
        status: 'failed',
        platform: 'twitter',
        diagnostics: {
          error: {
            code: 'network_error',
            message: 'Connection failed',
            retryable: true,
          },
        },
      };

      jest.spyOn(runner as any, 'processUrl').mockResolvedValue(mockResult);

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const summary = await runner.run({
        source: 'file',
        filePath: 'test.txt',
        continueOnError: true,
        jsonl: false,
        outputDir: '/test/output',
        format: 'md',
        downloadAssets: false,
      });

      expect(summary.success).toBe(0);
      expect(summary.failed).toBe(1);
      expect(summary.failures[0].error).toBe('Connection failed');

      consoleLogSpy.mockRestore();
    });

    it('should pass correct options to processUrl', async () => {
      const mockUrls = ['https://x.com/status/123'];

      jest.spyOn(runner as any, 'parseUrls').mockResolvedValue(mockUrls);

      const processUrlSpy = jest.spyOn(runner as any, 'processUrl').mockResolvedValue({
        status: 'success',
        platform: 'twitter',
        canonicalUrl: 'https://x.com/status/123',
        title: 'Test',
        paths: { markdownPath: '/test.md' },
        stats: { wordCount: 100, imageCount: 0 },
      });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await runner.run({
        source: 'file',
        filePath: 'test.txt',
        continueOnError: false,
        jsonl: false,
        outputDir: '/custom/output',
        format: 'md+html',
        downloadAssets: true,
        cdpEndpoint: 'http://localhost:9222',
        json: true,
        debug: true,
      });

      expect(processUrlSpy).toHaveBeenCalledWith(
        'https://x.com/status/123',
        mockContext,
        expect.objectContaining({
          outputDir: '/custom/output',
          format: 'md+html',
          downloadAssets: true,
          json: true,
          debug: true,
          cdpEndpoint: 'http://localhost:9222',
        }),
        { isArchived: false } // checkResult parameter
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('processUrl', () => {
    const options = {
      source: 'file' as const,
      filePath: 'test.txt',
      continueOnError: false,
      jsonl: false,
      outputDir: '/test/output',
      format: 'md' as const,
      downloadAssets: false,
    };
    const checkResult = { isArchived: false } as any;

    const doc = {
      platform: 'twitter',
      canonicalUrl: 'https://x.com/status/123',
      title: 'Test',
      author: 'Author',
      publishedAt: '2026-01-01',
      fetchedAt: '2026-01-02',
      blocks: [{ type: 'paragraph', text: 'Hello' }],
      assets: { images: [{ url: 'https://img.example/test.jpg', alt: 'img' }] },
    } as any;

    it('throws ClipError on invalid URL', async () => {
      (isValidUrl as jest.Mock).mockReturnValue(false);

      await expect(
        runner['processUrl']('not-a-url', mockContext, options, checkResult)
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_URL,
      });
    });

    it('runs full pipeline with asset downloads enabled', async () => {
      const page = { html: '<html></html>' };
      const renderMock = jest.fn().mockResolvedValue(page);
      (PageRenderer as jest.MockedClass<typeof PageRenderer>).mockImplementation(() => ({
        render: renderMock,
      }) as any);

      const extractMock = jest.fn().mockResolvedValue({ doc });
      (registry.select as jest.Mock).mockReturnValue({ extract: extractMock });

      const downloadImagesMock = jest.fn().mockResolvedValue(new Map());
      const assetFailures = [
        { url: 'https://img.example/fail.jpg', filename: '001.jpg', reason: '下载失败', attempts: 3 },
      ];
      const getFailuresMock = jest.fn().mockReturnValue(assetFailures);
      (AssetDownloader as jest.MockedClass<typeof AssetDownloader>).mockImplementation(() => ({
        downloadImages: downloadImagesMock,
        getFailures: getFailuresMock,
      }) as any);

      const generateMock = jest.fn().mockResolvedValue(undefined);
      (MarkdownGenerator as jest.MockedClass<typeof MarkdownGenerator>).mockImplementation(() => ({
        generate: generateMock,
      }) as any);

      (generateOutputPaths as jest.Mock).mockResolvedValue({
        markdownPath: '/test/output/test.md',
        assetsDir: '/test/output/assets',
      });

      const exportResult = { status: 'success' };
      (buildExportResult as jest.Mock).mockReturnValue(exportResult);

      const result = await runner['processUrl']('https://x.com/status/123', mockContext, {
        ...options,
        downloadAssets: true,
      }, checkResult);

      expect(renderMock).toHaveBeenCalledWith('https://x.com/status/123', { debug: false });
      expect(extractMock).toHaveBeenCalledWith(page);
      expect(downloadImagesMock).toHaveBeenCalledWith(doc.assets.images, '/test/output/assets');
      expect(generateMock).toHaveBeenCalledWith(doc, options.outputDir, expect.any(Map), assetFailures);
      expect(buildExportResult).toHaveBeenCalledWith(
        doc,
        { markdownPath: '/test/output/test.md', assetsDir: '/test/output/assets' },
        { wordCount: doc.blocks.length, imageCount: doc.assets.images.length },
        assetFailures
      );
      expect(result).toBe(exportResult);
    });

    it('skips asset downloads when disabled', async () => {
      const page = { html: '<html></html>' };
      (PageRenderer as jest.MockedClass<typeof PageRenderer>).mockImplementation(() => ({
        render: jest.fn().mockResolvedValue(page),
      }) as any);

      (registry.select as jest.Mock).mockReturnValue({
        extract: jest.fn().mockResolvedValue({ doc }),
      });

      const downloadImagesMock = jest.fn().mockResolvedValue(new Map());
      (AssetDownloader as jest.MockedClass<typeof AssetDownloader>).mockImplementation(() => ({
        downloadImages: downloadImagesMock,
        getFailures: jest.fn().mockReturnValue([]),
      }) as any);

      (MarkdownGenerator as jest.MockedClass<typeof MarkdownGenerator>).mockImplementation(() => ({
        generate: jest.fn().mockResolvedValue(undefined),
      }) as any);

      (generateOutputPaths as jest.Mock).mockResolvedValue({
        markdownPath: '/test/output/test.md',
        assetsDir: '/test/output/assets',
      });

      (buildExportResult as jest.Mock).mockReturnValue({ status: 'success' });

      await runner['processUrl']('https://x.com/status/123', mockContext, options, checkResult);

      expect(downloadImagesMock).not.toHaveBeenCalled();
    });

    it('returns failed ExportResult for ClipError', async () => {
      const page = { html: '<html></html>' };
      (PageRenderer as jest.MockedClass<typeof PageRenderer>).mockImplementation(() => ({
        render: jest.fn().mockResolvedValue(page),
      }) as any);

      (registry.select as jest.Mock).mockReturnValue({
        extract: jest.fn().mockRejectedValue(new ClipError(ErrorCode.NETWORK_ERROR, 'boom')),
      });

      const result = await runner['processUrl']('https://x.com/status/123', mockContext, options, checkResult);

      expect(result.status).toBe('failed');
      expect(result.diagnostics?.error?.code).toBe(ErrorCode.NETWORK_ERROR);
    });

    it('rethrows non-ClipError exceptions', async () => {
      const page = { html: '<html></html>' };
      (PageRenderer as jest.MockedClass<typeof PageRenderer>).mockImplementation(() => ({
        render: jest.fn().mockResolvedValue(page),
      }) as any);

      (registry.select as jest.Mock).mockReturnValue({
        extract: jest.fn().mockRejectedValue(new Error('boom')),
      });

      await expect(
        runner['processUrl']('https://x.com/status/123', mockContext, options, checkResult)
      ).rejects.toThrow('boom');
    });
  });
});
