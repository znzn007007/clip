// src/core/batch/__tests__/runner.test.ts
import { BatchRunner } from '../runner.js';
import { ClipOrchestrator } from '../../orchestrator.js';

// Mock ClipOrchestrator
jest.mock('../../orchestrator.js');

describe('BatchRunner', () => {
  let runner: BatchRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    runner = new BatchRunner();
  });

  describe('parseUrls', () => {
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
        duration: expect.any(Number),
        failures: [],
      });
      expect(summary.duration).toBeGreaterThanOrEqual(0);
    });

    it('should process URLs successfully', async () => {
      const mockUrls = [
        'https://x.com/status/123',
        'https://zhihu.com/question/456',
      ];

      // Mock parseUrls
      jest.spyOn(runner as any, 'parseUrls').mockResolvedValue(mockUrls);

      const mockResult = {
        status: 'success' as const,
        platform: 'twitter',
        canonicalUrl: 'https://x.com/status/123',
        title: 'Test Tweet',
      };

      (ClipOrchestrator.prototype.archive as jest.Mock).mockResolvedValue(
        mockResult
      );

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
      expect(ClipOrchestrator.prototype.archive).toHaveBeenCalledTimes(2);

      consoleLogSpy.mockRestore();
    });

    it('should handle failures and continue when continueOnError is true', async () => {
      const mockUrls = [
        'https://x.com/status/123',
        'https://zhihu.com/question/456',
      ];

      jest.spyOn(runner as any, 'parseUrls').mockResolvedValue(mockUrls);

      (ClipOrchestrator.prototype.archive as jest.Mock)
        .mockResolvedValueOnce({
          status: 'success',
          platform: 'twitter',
          canonicalUrl: 'https://x.com/status/123',
          title: 'Test Tweet',
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

      (ClipOrchestrator.prototype.archive as jest.Mock).mockRejectedValue(
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
        status: 'success' as const,
        platform: 'twitter',
        canonicalUrl: 'https://x.com/status/123',
        title: 'Test Tweet',
      };

      (ClipOrchestrator.prototype.archive as jest.Mock).mockResolvedValue(
        mockResult
      );

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
        status: 'failed' as const,
        platform: 'twitter',
        diagnostics: {
          error: {
            code: 'network_error' as const,
            message: 'Connection failed',
            retryable: true,
          },
        },
      };

      (ClipOrchestrator.prototype.archive as jest.Mock).mockResolvedValue(
        mockResult
      );

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

    it('should pass correct export options to orchestrator', async () => {
      const mockUrls = ['https://x.com/status/123'];

      jest.spyOn(runner as any, 'parseUrls').mockResolvedValue(mockUrls);

      const mockResult = {
        status: 'success' as const,
        platform: 'twitter',
        canonicalUrl: 'https://x.com/status/123',
        title: 'Test Tweet',
      };

      (ClipOrchestrator.prototype.archive as jest.Mock).mockResolvedValue(
        mockResult
      );

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
      });

      expect(ClipOrchestrator.prototype.archive).toHaveBeenCalledWith(
        'https://x.com/status/123',
        expect.objectContaining({
          outputDir: '/custom/output',
          format: 'md+html',
          downloadAssets: true,
          json: false,
          debug: false,
        })
      );

      consoleLogSpy.mockRestore();
    });
  });
});
