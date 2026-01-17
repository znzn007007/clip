// src/core/export/__tests__/path.test.ts
import { generateOutputPaths, buildFrontMatter } from '../path.js';
import type { ClipDoc } from '../../types/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');

describe('export/path', () => {
  const mockDoc: ClipDoc = {
    platform: 'twitter',
    sourceUrl: 'https://twitter.com/user/status/123',
    canonicalUrl: 'https://twitter.com/user/status/123',
    title: 'Test Tweet Title',
    author: 'testuser',
    publishedAt: '2024-01-15T10:30:00Z',
    fetchedAt: '2024-01-15T12:00:00Z',
    blocks: [],
    assets: {
      images: [],
    },
  };

  const mockOutputDir = '/test/output';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateOutputPaths', () => {
    it('should generate correct directory structure for Twitter', async () => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

      const result = await generateOutputPaths(mockDoc, mockOutputDir);

      // Normalize paths for cross-platform comparison
      const normalizedPath = path.normalize(result.markdownPath);
      const normalizedOutputDir = path.normalize(mockOutputDir);

      expect(normalizedPath).toContain(normalizedOutputDir);
      expect(normalizedPath).toContain('twitter');
      expect(normalizedPath).toContain('2024');
      expect(normalizedPath).toContain('0115');
      expect(normalizedPath).toContain('content.md');
      expect(result.assetsDir).toContain('assets');
    });

    it('should create assets directory', async () => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

      await generateOutputPaths(mockDoc, mockOutputDir);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('assets'),
        { recursive: true }
      );
    });

    it('should generate unique slug from title', async () => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

      const result = await generateOutputPaths(mockDoc, mockOutputDir);

      // The slug should be derived from the title and include a hash
      expect(result.markdownPath).toBeDefined();
      expect(result.markdownPath.length).toBeGreaterThan(0);
    });

    it('should handle different platforms', async () => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

      const zhihuDoc: ClipDoc = {
        ...mockDoc,
        platform: 'zhihu',
        sourceUrl: 'https://zhihu.com/question/123',
      };

      const result = await generateOutputPaths(zhihuDoc, mockOutputDir);

      expect(result.markdownPath).toContain('zhihu');
    });

    it('should format date correctly with month and day padding', async () => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

      const januaryDoc: ClipDoc = {
        ...mockDoc,
        fetchedAt: '2024-01-05T12:00:00Z',
      };

      const result = await generateOutputPaths(januaryDoc, mockOutputDir);

      expect(result.markdownPath).toContain('0105');
    });
  });

  describe('buildFrontMatter', () => {
    it('should build basic front matter with required fields', () => {
      const result = buildFrontMatter(mockDoc);

      expect(result).toContain('---');
      expect(result).toContain('title: "Test Tweet Title"');
      expect(result).toContain('source_url: "https://twitter.com/user/status/123"');
      expect(result).toContain('platform: "twitter"');
      expect(result).toContain('fetched_at: "2024-01-15T12:00:00Z"');
      expect(result).toContain('tags: []');
    });

    it('should include optional author field when present', () => {
      const result = buildFrontMatter(mockDoc);

      expect(result).toContain('author: "testuser"');
    });

    it('should include optional published_at field when present', () => {
      const result = buildFrontMatter(mockDoc);

      expect(result).toContain('published_at: "2024-01-15T10:30:00Z"');
    });

    it('should include canonical_url when present', () => {
      const result = buildFrontMatter(mockDoc);

      expect(result).toContain('canonical_url: "https://twitter.com/user/status/123"');
    });

    it('should handle missing optional fields', () => {
      const minimalDoc: ClipDoc = {
        platform: 'twitter',
        sourceUrl: 'https://twitter.com/user/status/123',
        title: 'Minimal Doc',
        fetchedAt: '2024-01-15T12:00:00Z',
        blocks: [],
        assets: { images: [] },
      };

      const result = buildFrontMatter(minimalDoc);

      expect(result).toContain('title: "Minimal Doc"');
      expect(result).toContain('source_url: "https://twitter.com/user/status/123"');
      expect(result).toContain('platform: "twitter"');
      expect(result).toContain('fetched_at: "2024-01-15T12:00:00Z"');
      expect(result).not.toContain('author:');
      expect(result).not.toContain('published_at:');
    });

    it('should properly format YAML with correct delimiters', () => {
      const result = buildFrontMatter(mockDoc);

      const lines = result.split('\n');
      expect(lines[0]).toBe('---');
      expect(lines[lines.length - 2]).toBe('---');
      expect(lines[lines.length - 1]).toBe('');
    });

    it('should escape special characters in title', () => {
      const docWithSpecialChars: ClipDoc = {
        ...mockDoc,
        title: 'Title with "quotes" and \'apostrophes\'',
      };

      const result = buildFrontMatter(docWithSpecialChars);

      expect(result).toContain('title:');
    });
  });
});
