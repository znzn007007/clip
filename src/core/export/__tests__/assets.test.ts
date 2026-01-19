// src/core/export/__tests__/assets.test.ts
import { AssetDownloader, type DownloadResult } from '../assets.js';
import type { BrowserContext } from 'playwright';
import type { AssetImage } from '../../types/index.js';
import * as fs from 'fs/promises';

jest.mock('fs/promises');

describe('AssetDownloader', () => {
  let downloader: AssetDownloader;
  let mockContext: jest.Mocked<BrowserContext>;
  let mockPage: any;

  beforeEach(() => {
    mockPage = {
      goto: jest.fn(),
      close: jest.fn(),
      evaluate: jest.fn(),
    };

    mockContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      request: { get: jest.fn() },
    } as any;

    downloader = new AssetDownloader(mockContext);

    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with browser context', () => {
      expect(downloader).toBeInstanceOf(AssetDownloader);
    });
  });

  describe('downloadImages', () => {
    it('should create mapping for single image', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/image.jpg', alt: 'Test Image' },
      ];
      const assetsDir = '/test/assets';

      // Mock the download methods
      jest.spyOn(downloader as any, 'downloadWithRetry').mockResolvedValue({
        status: 'success',
        path: './assets/001.jpg',
        attempts: 1
      });

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);
      const downloadResult = result.get('https://example.com/image.jpg');
      expect(downloadResult?.status).toBe('success');
      expect(downloadResult?.path).toBe('./assets/001.jpg');
    });

    it('should create mapping for multiple images', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/image1.jpg', alt: 'Image 1' },
        { url: 'https://example.com/image2.png', alt: 'Image 2' },
        { url: 'https://example.com/image3.gif', alt: 'Image 3' },
      ];
      const assetsDir = '/test/assets';

      // Mock the download methods
      jest.spyOn(downloader as any, 'downloadWithRetry')
        .mockResolvedValueOnce({ status: 'success', path: './assets/001.jpg', attempts: 1 })
        .mockResolvedValueOnce({ status: 'success', path: './assets/002.png', attempts: 1 })
        .mockResolvedValueOnce({ status: 'success', path: './assets/003.gif', attempts: 1 });

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.size).toBe(3);
      expect(result.get('https://example.com/image1.jpg')?.path).toBe('./assets/001.jpg');
      expect(result.get('https://example.com/image2.png')?.path).toBe('./assets/002.png');
      expect(result.get('https://example.com/image3.gif')?.path).toBe('./assets/003.gif');
    });

    it('should handle empty image array', async () => {
      const images: AssetImage[] = [];
      const assetsDir = '/test/assets';

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.size).toBe(0);
      expect(downloader.getFailures()).toHaveLength(0);
    });

    it('should extract extension from URL', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/image.png', alt: 'PNG Image' },
        { url: 'https://example.com/photo.jpeg', alt: 'JPEG Image' },
        { url: 'https://example.com/pic.webp', alt: 'WebP Image' },
      ];
      const assetsDir = '/test/assets';

      // Mock the download methods
      jest.spyOn(downloader as any, 'downloadWithRetry')
        .mockResolvedValueOnce({ status: 'success', path: './assets/001.png', attempts: 1 })
        .mockResolvedValueOnce({ status: 'success', path: './assets/002.jpeg', attempts: 1 })
        .mockResolvedValueOnce({ status: 'success', path: './assets/003.webp', attempts: 1 });

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.get('https://example.com/image.png')?.path).toBe('./assets/001.png');
      expect(result.get('https://example.com/photo.jpeg')?.path).toBe('./assets/002.jpeg');
      expect(result.get('https://example.com/pic.webp')?.path).toBe('./assets/003.webp');
    });

    it('should handle URLs with query parameters', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/image.jpg?size=large&quality=high', alt: 'Image with query' },
      ];
      const assetsDir = '/test/assets';

      // Mock the download methods
      jest.spyOn(downloader as any, 'downloadWithRetry').mockResolvedValue({
        status: 'success',
        path: './assets/001.jpg',
        attempts: 1
      });

      const result = await downloader.downloadImages(images, assetsDir);

      const downloadResult = result.get('https://example.com/image.jpg?size=large&quality=high');
      expect(downloadResult?.path).toBe('./assets/001.jpg');
    });

    it('should default to jpg extension when not found in URL', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/image/noext', alt: 'No extension' },
      ];
      const assetsDir = '/test/assets';

      // Mock the download methods
      jest.spyOn(downloader as any, 'downloadWithRetry').mockResolvedValue({
        status: 'success',
        path: './assets/001.jpg',
        attempts: 1
      });

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.get('https://example.com/image/noext')?.path).toBe('./assets/001.jpg');
    });

    it('should pad filename numbers with zeros', async () => {
      const images: AssetImage[] = Array.from({ length: 15 }, (_, i) => ({
        url: `https://example.com/image${i}.jpg`,
        alt: `Image ${i}`,
      }));
      const assetsDir = '/test/assets';

      // Mock the download methods - return different paths for different calls
      const mockDownload = jest.spyOn(downloader as any, 'downloadWithRetry');
      for (let i = 0; i < 15; i++) {
        const filename = `${String(i + 1).padStart(3, '0')}.jpg`;
        mockDownload.mockResolvedValueOnce({
          status: 'success',
          path: `./assets/${filename}`,
          attempts: 1
        });
      }

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.get('https://example.com/image0.jpg')?.path).toBe('./assets/001.jpg');
      expect(result.get('https://example.com/image9.jpg')?.path).toBe('./assets/010.jpg');
      expect(result.get('https://example.com/image14.jpg')?.path).toBe('./assets/015.jpg');
    });

    it('should preserve URL-to-filename mapping structure', async () => {
      const images: AssetImage[] = [
        { url: 'https://cdn.example.com/path/to/image.jpg', alt: 'CDN Image' },
      ];
      const assetsDir = '/test/assets';

      // Mock the download methods
      jest.spyOn(downloader as any, 'downloadWithRetry').mockResolvedValue({
        status: 'success',
        path: './assets/001.jpg',
        attempts: 1
      });

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.has('https://cdn.example.com/path/to/image.jpg')).toBe(true);
      const downloadResult = result.get('https://cdn.example.com/path/to/image.jpg');
      expect(downloadResult?.path).toMatch(/^\.\/assets\/\d{3}\.jpg$/);
    });
  });

  describe('getFailures', () => {
    it('should return empty array when no failures', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/image.jpg', alt: 'Test Image' },
      ];

      jest.spyOn(downloader as any, 'downloadWithRetry').mockResolvedValue({
        status: 'success',
        path: './assets/001.jpg',
        attempts: 1
      });

      await downloader.downloadImages(images, '/test/assets');

      expect(downloader.getFailures()).toEqual([]);
    });

    it('should track failed downloads', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/fail.jpg', alt: 'Failed Image' },
      ];

      jest.spyOn(downloader as any, 'downloadWithRetry').mockResolvedValue({
        status: 'failed',
        path: 'https://example.com/fail.jpg',
        attempts: 3,
        error: { reason: '网络超时' }
      });

      await downloader.downloadImages(images, '/test/assets');

      const failures = downloader.getFailures();
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        url: 'https://example.com/fail.jpg',
        filename: '001.jpg',
        reason: '网络超时',
        attempts: 3
      });
    });

    it('should track multiple failures', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/fail1.jpg', alt: 'Failed Image 1' },
        { url: 'https://example.com/success.jpg', alt: 'Success Image' },
        { url: 'https://example.com/fail2.png', alt: 'Failed Image 2' },
      ];

      jest.spyOn(downloader as any, 'downloadWithRetry')
        .mockResolvedValueOnce({
          status: 'failed',
          path: 'https://example.com/fail1.jpg',
          attempts: 3,
          error: { reason: '网络超时' }
        })
        .mockResolvedValueOnce({
          status: 'success',
          path: './assets/002.jpg',
          attempts: 1
        })
        .mockResolvedValueOnce({
          status: 'failed',
          path: 'https://example.com/fail2.png',
          attempts: 3,
          error: { reason: '404 Not Found' }
        });

      await downloader.downloadImages(images, '/test/assets');

      const failures = downloader.getFailures();
      expect(failures).toHaveLength(2);
      expect(failures[0].url).toBe('https://example.com/fail1.jpg');
      expect(failures[1].url).toBe('https://example.com/fail2.png');
    });
  });

  describe('downloadWithRetry', () => {
    it('should retry with exponential backoff on failure', async () => {
      const url = 'https://example.com/image.jpg';
      const filepath = '/test/assets/001.jpg';

      // Mock to fail first 2 times, succeed on 3rd
      let attempts = 0;
      jest.spyOn(downloader as any, 'tryContextDownload').mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Network timeout');
        }
      });

      jest.spyOn(downloader as any, 'tryFetchDownload').mockRejectedValue(new Error('Fallback also failed'));

      const sleepSpy = jest.spyOn(downloader as any, 'sleep').mockResolvedValue(undefined);

      const result = await (downloader as any).downloadWithRetry(url, filepath, '001.jpg');

      // Should have attempted 3 times (initial + 2 retries)
      expect(attempts).toBe(3);

      // Should have called sleep with exponential backoff (1000, 2000)
      expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000);
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000);

      expect(result.status).toBe('success');
      expect(result.path).toBe('./assets/001.jpg');
      expect(result.attempts).toBe(3);
    });

    it('should return failed result after all retries exhausted', async () => {
      const url = 'https://example.com/image.jpg';
      const filepath = '/test/assets/001.jpg';

      // Mock to always fail - both methods should timeout
      jest.spyOn(downloader as any, 'tryContextDownload').mockRejectedValue(new Error('timeout'));

      jest.spyOn(downloader as any, 'tryFetchDownload').mockRejectedValue(new Error('Timed out'));

      const sleepSpy = jest.spyOn(downloader as any, 'sleep').mockResolvedValue(undefined);

      const result = await (downloader as any).downloadWithRetry(url, filepath, '001.jpg');

      // Should have attempted 3 times (initial + 2 retries)
      expect(sleepSpy).toHaveBeenCalledTimes(2);

      expect(result.status).toBe('failed');
      expect(result.path).toBe(url);
      expect(result.error?.reason).toBe('网络超时');
      expect(result.attempts).toBe(3);
    });

    it('should succeed on first attempt', async () => {
      const url = 'https://example.com/image.jpg';
      const filepath = '/test/assets/001.jpg';

      jest.spyOn(downloader as any, 'tryContextDownload').mockResolvedValue(undefined);

      const sleepSpy = jest.spyOn(downloader as any, 'sleep').mockResolvedValue(undefined);

      const result = await (downloader as any).downloadWithRetry(url, filepath, '001.jpg');

      // Should not have retried
      expect(sleepSpy).not.toHaveBeenCalled();

      expect(result.status).toBe('success');
      expect(result.path).toBe('./assets/001.jpg');
      expect(result.attempts).toBe(1);
    });

    it('should succeed via fetch fallback when context download fails', async () => {
      const url = 'https://example.com/image.jpg';
      const filepath = '/test/assets/001.jpg';

      jest.spyOn(downloader as any, 'tryContextDownload').mockRejectedValue(new Error('context fail'));
      jest.spyOn(downloader as any, 'tryFetchDownload').mockResolvedValue(undefined);

      const result = await (downloader as any).downloadWithRetry(url, filepath, '001.jpg');

      expect(result.status).toBe('success');
      expect(result.path).toBe('./assets/001.jpg');
      expect(result.attempts).toBe(1);
    });
  });

  describe('sleep', () => {
    it('resolves after the timeout', async () => {
      jest.useFakeTimers();
      const sleepPromise = (downloader as any).sleep(10);

      jest.advanceTimersByTime(10);
      await expect(sleepPromise).resolves.toBeUndefined();
      jest.useRealTimers();
    });
  });

  describe('getExtension', () => {
    it('should extract common image extensions', () => {
      const downloader = new AssetDownloader(mockContext);

      expect((downloader as any).getExtension('image.jpg')).toBe('jpg');
      expect((downloader as any).getExtension('image.png')).toBe('png');
      expect((downloader as any).getExtension('image.gif')).toBe('gif');
      expect((downloader as any).getExtension('image.webp')).toBe('webp');
      expect((downloader as any).getExtension('image.jpeg')).toBe('jpeg');
      expect((downloader as any).getExtension('image.svg')).toBe('svg');
    });

    it('should extract extension before query parameters', () => {
      const downloader = new AssetDownloader(mockContext);

      expect((downloader as any).getExtension('image.jpg?v=1')).toBe('jpg');
      expect((downloader as any).getExtension('image.png?width=200&height=200')).toBe('png');
    });

    it('should extract extension before hash fragment', () => {
      const downloader = new AssetDownloader(mockContext);

      expect((downloader as any).getExtension('image.jpg#section')).toBe('jpg');
    });

    it('should default to jpg for unknown extensions', () => {
      const downloader = new AssetDownloader(mockContext);

      expect((downloader as any).getExtension('image.unknown')).toBe('jpg');
      expect((downloader as any).getExtension('image')).toBe('jpg');
    });

    it('should handle uppercase extensions', () => {
      const downloader = new AssetDownloader(mockContext);

      expect((downloader as any).getExtension('image.JPG')).toBe('jpg');
      expect((downloader as any).getExtension('image.PNG')).toBe('png');
    });
  });

  describe('tryFetchDownload', () => {
    it('throws when response is not ok', async () => {
      const response = {
        ok: () => false,
        status: () => 404,
        body: jest.fn(),
      };
      (mockContext.request.get as jest.Mock).mockResolvedValue(response);

      await expect((downloader as any).tryFetchDownload('https://example.com/img.jpg', '/tmp/img.jpg'))
        .rejects.toThrow('HTTP 404');
    });

    it('writes file when response is ok', async () => {
      const response = {
        ok: () => true,
        status: () => 200,
        body: jest.fn().mockResolvedValue(Buffer.from('data')),
      };
      (mockContext.request.get as jest.Mock).mockResolvedValue(response);

      await (downloader as any).tryFetchDownload('https://example.com/img.jpg', '/tmp/img.jpg');

      expect(fs.writeFile).toHaveBeenCalledWith('/tmp/img.jpg', expect.any(Buffer));
    });
  });

  describe('tryContextDownload', () => {
    it('throws when response is not ok and always closes page', async () => {
      const response = {
        ok: () => false,
        status: () => 500,
        body: jest.fn(),
      };
      mockPage.goto.mockResolvedValue(response);

      await expect((downloader as any).tryContextDownload('https://example.com/img.jpg', '/tmp/img.jpg'))
        .rejects.toThrow('HTTP 500');

      expect(mockPage.close).toHaveBeenCalledTimes(1);
    });

    it('writes file when response is ok and closes page', async () => {
      const response = {
        ok: () => true,
        status: () => 200,
        body: jest.fn().mockResolvedValue(Buffer.from('data')),
      };
      mockPage.goto.mockResolvedValue(response);

      await (downloader as any).tryContextDownload('https://example.com/img.jpg', '/tmp/img.jpg');

      expect(fs.writeFile).toHaveBeenCalledWith('/tmp/img.jpg', expect.any(Buffer));
      expect(mockPage.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatErrorReason', () => {
    it('maps common errors to localized reasons', () => {
      const downloader = new AssetDownloader(mockContext);

      expect((downloader as any).formatErrorReason('timeout')).toBe('网络超时');
      expect((downloader as any).formatErrorReason('HTTP 404')).toBe('404 Not Found');
      expect((downloader as any).formatErrorReason('HTTP 403')).toBe('访问被拒绝');
      expect((downloader as any).formatErrorReason('ECONNREFUSED')).toBe('连接失败');
    });

    it('falls back to generic reason', () => {
      const downloader = new AssetDownloader(mockContext);
      expect((downloader as any).formatErrorReason('something else')).toBe('下载失败');
      expect((downloader as any).formatErrorReason('HTTP 401')).toBe('访问被拒绝');
    });
  });
});
