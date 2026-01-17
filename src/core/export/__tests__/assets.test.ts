// src/core/export/__tests__/assets.test.ts
import { AssetDownloader } from '../assets.js';
import type { BrowserContext } from 'playwright';
import type { AssetImage } from '../../types/index.js';

describe('AssetDownloader', () => {
  let downloader: AssetDownloader;
  let mockContext: jest.Mocked<BrowserContext>;

  beforeEach(() => {
    mockContext = {
      // Mock the BrowserContext interface
      // We'll add necessary methods as needed
    } as any;
    downloader = new AssetDownloader(mockContext);
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

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);
      expect(result.get('https://example.com/image.jpg')).toBe('./assets/001.jpg');
    });

    it('should create mapping for multiple images', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/image1.jpg', alt: 'Image 1' },
        { url: 'https://example.com/image2.png', alt: 'Image 2' },
        { url: 'https://example.com/image3.gif', alt: 'Image 3' },
      ];
      const assetsDir = '/test/assets';

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.size).toBe(3);
      expect(result.get('https://example.com/image1.jpg')).toBe('./assets/001.jpg');
      expect(result.get('https://example.com/image2.png')).toBe('./assets/002.png');
      expect(result.get('https://example.com/image3.gif')).toBe('./assets/003.gif');
    });

    it('should handle empty image array', async () => {
      const images: AssetImage[] = [];
      const assetsDir = '/test/assets';

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.size).toBe(0);
    });

    it('should extract extension from URL', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/image.png', alt: 'PNG Image' },
        { url: 'https://example.com/photo.jpeg', alt: 'JPEG Image' },
        { url: 'https://example.com/pic.webp', alt: 'WebP Image' },
      ];
      const assetsDir = '/test/assets';

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.get('https://example.com/image.png')).toBe('./assets/001.png');
      expect(result.get('https://example.com/photo.jpeg')).toBe('./assets/002.jpeg');
      expect(result.get('https://example.com/pic.webp')).toBe('./assets/003.webp');
    });

    it('should handle URLs with query parameters', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/image.jpg?size=large&quality=high', alt: 'Image with query' },
      ];
      const assetsDir = '/test/assets';

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.get('https://example.com/image.jpg?size=large&quality=high'))
        .toBe('./assets/001.jpg');
    });

    it('should default to jpg extension when not found in URL', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/image/noext', alt: 'No extension' },
      ];
      const assetsDir = '/test/assets';

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.get('https://example.com/image/noext')).toBe('./assets/001.jpg');
    });

    it('should pad filename numbers with zeros', async () => {
      const images: AssetImage[] = Array.from({ length: 15 }, (_, i) => ({
        url: `https://example.com/image${i}.jpg`,
        alt: `Image ${i}`,
      }));
      const assetsDir = '/test/assets';

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.get('https://example.com/image0.jpg')).toBe('./assets/001.jpg');
      expect(result.get('https://example.com/image9.jpg')).toBe('./assets/010.jpg');
      expect(result.get('https://example.com/image14.jpg')).toBe('./assets/015.jpg');
    });

    it('should preserve URL-to-filename mapping structure', async () => {
      const images: AssetImage[] = [
        { url: 'https://cdn.example.com/path/to/image.jpg', alt: 'CDN Image' },
      ];
      const assetsDir = '/test/assets';

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.has('https://cdn.example.com/path/to/image.jpg')).toBe(true);
      expect(result.get('https://cdn.example.com/path/to/image.jpg')).toMatch(/^\.\/assets\/\d{3}\.jpg$/);
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
});
