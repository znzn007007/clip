import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ClipOrchestrator } from '../orchestrator.js';
import { BrowserManager } from '../render/browser.js';
import { PageRenderer } from '../render/page.js';
import { registry } from '../extract/registry.js';
import { MarkdownGenerator } from '../export/markdown.js';
import { AssetDownloader } from '../export/assets.js';
import { buildExportResult } from '../export/json.js';
import { generateOutputPaths } from '../export/path.js';
import { isValidUrl, normalizeUrl } from '../render/utils.js';
import { ClipError, ErrorCode } from '../errors.js';

jest.mock('../render/browser.js');
jest.mock('../render/page.js');
jest.mock('../export/markdown.js');
jest.mock('../export/assets.js');
jest.mock('../export/json.js', () => ({
  buildExportResult: jest.fn(),
}));
jest.mock('../export/path.js', () => ({
  generateOutputPaths: jest.fn(),
}));
jest.mock('../render/utils.js', () => ({
  isValidUrl: jest.fn(),
  normalizeUrl: jest.fn(),
}));
jest.mock('../extract/registry.js', () => ({
  registry: { select: jest.fn() },
}));

describe('ClipOrchestrator', () => {
  const mockResolved = <T>(value: T) => {
    return jest.fn(() => Promise.resolve(value)) as jest.Mock;
  };
  const mockRejected = (error: unknown) => {
    return jest.fn(() => Promise.reject(error)) as jest.Mock;
  };
  const BrowserManagerMock = BrowserManager as jest.MockedClass<typeof BrowserManager>;
  const PageRendererMock = PageRenderer as jest.MockedClass<typeof PageRenderer>;
  const MarkdownGeneratorMock = MarkdownGenerator as jest.MockedClass<typeof MarkdownGenerator>;
  const AssetDownloaderMock = AssetDownloader as jest.MockedClass<typeof AssetDownloader>;
  const buildExportResultMock = buildExportResult as jest.MockedFunction<typeof buildExportResult>;
  const generateOutputPathsMock = generateOutputPaths as jest.MockedFunction<typeof generateOutputPaths>;
  const isValidUrlMock = isValidUrl as jest.MockedFunction<typeof isValidUrl>;
  const normalizeUrlMock = normalizeUrl as jest.MockedFunction<typeof normalizeUrl>;
  const registrySelectMock = registry.select as jest.MockedFunction<typeof registry.select>;

  const mockDoc = {
    platform: 'twitter',
    sourceUrl: 'https://x.com/status/1',
    canonicalUrl: 'https://x.com/status/1',
    title: 'Test',
    author: 'tester',
    fetchedAt: '2026-01-19T00:00:00Z',
    blocks: [{ type: 'paragraph', content: 'hello' }],
    assets: { images: ['https://img/1.jpg'] },
  } as any;

  let mockContext: any;
  let mockBrowserManager: { launch: jest.Mock; close: jest.Mock };
  let mockRenderer: { render: jest.Mock };
  let mockMarkdown: { generate: jest.Mock };
  let mockAssets: { downloadImages: jest.Mock; getFailures: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = { page: {} };
    mockBrowserManager = {
      launch: mockResolved(mockContext),
      close: mockResolved(undefined),
    };
    BrowserManagerMock.mockImplementation(() => mockBrowserManager as any);

    mockRenderer = {
      render: mockResolved({ html: '<html />' }),
    };
    PageRendererMock.mockImplementation(() => mockRenderer as any);

    mockMarkdown = {
      generate: mockResolved(undefined),
    };
    MarkdownGeneratorMock.mockImplementation(() => mockMarkdown as any);

    mockAssets = {
      downloadImages: mockResolved(new Map()),
      getFailures: jest.fn().mockReturnValue([]),
    };
    AssetDownloaderMock.mockImplementation(() => mockAssets as any);

    isValidUrlMock.mockReturnValue(true);
    normalizeUrlMock.mockReturnValue('https://x.com/status/1');
    registrySelectMock.mockReturnValue({
      extract: mockResolved({ doc: mockDoc }),
    } as any);

    generateOutputPathsMock.mockResolvedValue({
      markdownPath: '/out/test.md',
      assetsDir: '/out/assets',
    });

    buildExportResultMock.mockReturnValue({
      status: 'success',
      platform: 'twitter',
      paths: { markdownPath: '/out/test.md', assetsDir: '/out/assets' },
      stats: { wordCount: 1, imageCount: 1 },
    } as any);
  });

  it('throws ClipError for invalid URL', async () => {
    isValidUrlMock.mockReturnValue(false);

    const orchestrator = new ClipOrchestrator();
    await expect(orchestrator.archive('not-a-url', {
      outputDir: './clips',
      format: 'md',
      downloadAssets: true,
      json: false,
    })).rejects.toBeInstanceOf(ClipError);

    expect(mockBrowserManager.launch).not.toHaveBeenCalled();
  });

  it('runs the full pipeline and returns export result', async () => {
    const orchestrator = new ClipOrchestrator();
    const result = await orchestrator.archive('https://x.com/status/1', {
      outputDir: './clips',
      format: 'md',
      downloadAssets: true,
      json: false,
      debug: true,
    });

    expect(mockBrowserManager.launch).toHaveBeenCalledWith('https://x.com/status/1');
    expect(mockRenderer.render).toHaveBeenCalledWith('https://x.com/status/1', { debug: true });
    expect(registrySelectMock).toHaveBeenCalledWith('https://x.com/status/1');
    expect(mockAssets.downloadImages).toHaveBeenCalledWith(mockDoc.assets.images, '/out/assets');
    expect(mockMarkdown.generate).toHaveBeenCalled();
    expect(buildExportResultMock).toHaveBeenCalled();
    expect(result.status).toBe('success');
    expect(mockBrowserManager.close).toHaveBeenCalledTimes(1);
  });

  it('skips asset downloads when disabled', async () => {
    const orchestrator = new ClipOrchestrator();
    await orchestrator.archive('https://x.com/status/1', {
      outputDir: './clips',
      format: 'md',
      downloadAssets: false,
      json: false,
    });

    expect(mockAssets.downloadImages).not.toHaveBeenCalled();
    expect(mockMarkdown.generate).toHaveBeenCalledWith(
      mockDoc,
      './clips',
      new Map(),
      []
    );
  });

  it('returns failed ExportResult for ClipError and closes browser', async () => {
    const error = new ClipError(ErrorCode.EXTRACT_FAILED, 'boom');
    registrySelectMock.mockReturnValue({
      extract: mockRejected(error),
    } as any);

    const orchestrator = new ClipOrchestrator();
    const result = await orchestrator.archive('https://x.com/status/1', {
      outputDir: './clips',
      format: 'md',
      downloadAssets: true,
      json: false,
    });

    expect(result.status).toBe('failed');
    expect(result.diagnostics?.error?.code).toBe(ErrorCode.EXTRACT_FAILED);
    expect(buildExportResultMock).not.toHaveBeenCalled();
    expect(mockBrowserManager.close).toHaveBeenCalledTimes(1);
  });
});
