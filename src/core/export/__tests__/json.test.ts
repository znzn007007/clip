// src/core/export/__tests__/json.test.ts
import { buildExportResult, formatJsonOutput } from '../json.js';
import type { ClipDoc } from '../../types/index.js';
import type { ExportPaths, ExportStats } from '../types.js';

describe('export/json', () => {
  const createMockDoc = (): ClipDoc => ({
    platform: 'twitter',
    sourceUrl: 'https://twitter.com/user/status/123',
    canonicalUrl: 'https://twitter.com/user/status/123',
    title: 'Test Tweet',
    author: 'testuser',
    publishedAt: '2024-01-15T10:30:00Z',
    fetchedAt: '2024-01-15T12:00:00Z',
    blocks: [
      { type: 'paragraph', content: 'Test content' },
    ],
    assets: { images: [] },
  });

  const createMockPaths = (): ExportPaths => ({
    markdownPath: '/test/output/content.md',
    assetsDir: '/test/output/assets',
  });

  const createMockStats = (): ExportStats => ({
    wordCount: 100,
    imageCount: 5,
  });

  describe('buildExportResult', () => {
    it('should build complete export result', () => {
      const doc = createMockDoc();
      const paths = createMockPaths();
      const stats = createMockStats();

      const result = buildExportResult(doc, paths, stats);

      expect(result.status).toBe('success');
      expect(result.platform).toBe('twitter');
      expect(result.canonicalUrl).toBe('https://twitter.com/user/status/123');
      expect(result.title).toBe('Test Tweet');
      expect(result.paths).toEqual(paths);
      expect(result.stats).toEqual(stats);
    });

    it('should include meta information from doc', () => {
      const doc = createMockDoc();
      const paths = createMockPaths();
      const stats = createMockStats();

      const result = buildExportResult(doc, paths, stats);

      expect(result.meta).toBeDefined();
      expect(result.meta?.author).toBe('testuser');
      expect(result.meta?.publishedAt).toBe('2024-01-15T10:30:00Z');
      expect(result.meta?.fetchedAt).toBe('2024-01-15T12:00:00Z');
    });

    it('should initialize empty warnings array', () => {
      const doc = createMockDoc();
      const paths = createMockPaths();
      const stats = createMockStats();

      const result = buildExportResult(doc, paths, stats);

      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.warnings).toEqual([]);
      expect(result.diagnostics?.error).toBeUndefined();
    });

    it('should handle missing optional fields', () => {
      const doc: ClipDoc = {
        platform: 'zhihu',
        sourceUrl: 'https://zhihu.com/question/123',
        title: 'Question Title',
        fetchedAt: '2024-01-15T12:00:00Z',
        blocks: [],
        assets: { images: [] },
      };
      const paths = createMockPaths();
      const stats = createMockStats();

      const result = buildExportResult(doc, paths, stats);

      expect(result.platform).toBe('zhihu');
      expect(result.canonicalUrl).toBeUndefined();
      expect(result.meta?.author).toBeUndefined();
      expect(result.meta?.publishedAt).toBeUndefined();
      expect(result.meta?.fetchedAt).toBe('2024-01-15T12:00:00Z');
    });

    it('should include paths in result', () => {
      const doc = createMockDoc();
      const paths = createMockPaths();
      const stats = createMockStats();

      const result = buildExportResult(doc, paths, stats);

      expect(result.paths).toBeDefined();
      expect(result.paths?.markdownPath).toBe('/test/output/content.md');
      expect(result.paths?.assetsDir).toBe('/test/output/assets');
    });

    it('should include stats in result', () => {
      const doc = createMockDoc();
      const paths = createMockPaths();
      const stats = createMockStats();

      const result = buildExportResult(doc, paths, stats);

      expect(result.stats).toBeDefined();
      expect(result.stats?.wordCount).toBe(100);
      expect(result.stats?.imageCount).toBe(5);
    });

    it('should include asset failures when provided', () => {
      const doc = createMockDoc();
      const paths = createMockPaths();
      const stats = createMockStats();
      const failures = [
        { url: 'https://example.com/a.jpg', filename: '001.jpg', reason: '网络超时', attempts: 3 },
      ];

      const result = buildExportResult(doc, paths, stats, failures);

      expect(result.diagnostics?.assetFailures).toEqual(failures);
    });

    it('should set status to success', () => {
      const doc = createMockDoc();
      const paths = createMockPaths();
      const stats = createMockStats();

      const result = buildExportResult(doc, paths, stats);

      expect(result.status).toBe('success');
      expect(result.status).not.toBe('failed');
    });

    it('should handle different platforms', () => {
      const platforms: Array<'twitter' | 'zhihu' | 'wechat' | 'unknown'> = [
        'twitter',
        'zhihu',
        'wechat',
        'unknown',
      ];

      platforms.forEach(platform => {
        const doc: ClipDoc = {
          platform,
          sourceUrl: `https://example.com/content`,
          title: `${platform} content`,
          fetchedAt: '2024-01-15T12:00:00Z',
          blocks: [],
          assets: { images: [] },
        };
        const paths = createMockPaths();
        const stats = createMockStats();

        const result = buildExportResult(doc, paths, stats);

        expect(result.platform).toBe(platform);
      });
    });
  });

  describe('formatJsonOutput', () => {
    it('should format result as JSON string', () => {
      const result = {
        status: 'success' as const,
        platform: 'twitter',
        canonicalUrl: 'https://twitter.com/status/123',
        title: 'Test',
        paths: createMockPaths(),
        stats: createMockStats(),
      };

      const json = formatJsonOutput(result);

      expect(typeof json).toBe('string');
      expect(json).toBeTruthy();
    });

    it('should produce valid JSON', () => {
      const result = {
        status: 'success' as const,
        platform: 'twitter',
        title: 'Test',
        paths: createMockPaths(),
        meta: {
          fetchedAt: '2024-01-15T12:00:00Z',
        },
        stats: createMockStats(),
        diagnostics: {
          warnings: [],
        },
      };

      const json = formatJsonOutput(result);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should format with 2-space indentation', () => {
      const result = {
        status: 'success' as const,
        platform: 'twitter',
        title: 'Test',
        paths: createMockPaths(),
      };

      const json = formatJsonOutput(result);

      // Check that it's formatted (not minified)
      expect(json).toContain('\n');
      expect(json).toContain('  '); // 2-space indent

      // Parse and verify structure
      const parsed = JSON.parse(json);
      expect(parsed.status).toBe('success');
      expect(parsed.platform).toBe('twitter');
    });

    it('should include all result fields in JSON', () => {
      const result = {
        status: 'success' as const,
        platform: 'twitter',
        canonicalUrl: 'https://twitter.com/status/123',
        title: 'Test Title',
        paths: createMockPaths(),
        meta: {
          author: 'testuser',
          publishedAt: '2024-01-15T10:00:00Z',
          fetchedAt: '2024-01-15T12:00:00Z',
        },
        stats: createMockStats(),
        diagnostics: {
          warnings: [],
        },
      };

      const json = formatJsonOutput(result);
      const parsed = JSON.parse(json);

      expect(parsed.status).toBe(result.status);
      expect(parsed.platform).toBe(result.platform);
      expect(parsed.canonicalUrl).toBe(result.canonicalUrl);
      expect(parsed.title).toBe(result.title);
      expect(parsed.paths).toEqual(result.paths);
      expect(parsed.meta).toEqual(result.meta);
      expect(parsed.stats).toEqual(result.stats);
      expect(parsed.diagnostics).toEqual(result.diagnostics);
    });

    it('should handle empty warnings array', () => {
      const result = {
        status: 'success' as const,
        platform: 'twitter',
        title: 'Test',
        diagnostics: {
          warnings: [],
        },
      };

      const json = formatJsonOutput(result);
      const parsed = JSON.parse(json);

      expect(parsed.diagnostics.warnings).toEqual([]);
    });

    it('should handle result with minimal fields', () => {
      const result = {
        status: 'success' as const,
        platform: 'unknown',
        title: 'Minimal',
      };

      const json = formatJsonOutput(result);
      const parsed = JSON.parse(json);

      expect(parsed.status).toBe('success');
      expect(parsed.platform).toBe('unknown');
      expect(parsed.title).toBe('Minimal');
    });
  });
});
