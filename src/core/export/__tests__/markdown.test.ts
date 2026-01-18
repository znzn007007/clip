// src/core/export/__tests__/markdown.test.ts
import { MarkdownGenerator } from '../markdown.js';
import type { ClipDoc, Block } from '../../types/index.js';
import * as fs from 'fs/promises';

// Mock fs module
jest.mock('fs/promises');
jest.mock('../path.js', () => ({
  generateOutputPaths: jest.fn(),
  buildFrontMatter: jest.fn(),
}));

describe('MarkdownGenerator', () => {
  let generator: MarkdownGenerator;
  const mockOutputDir = '/test/output';

  beforeEach(() => {
    generator = new MarkdownGenerator();
    jest.clearAllMocks();
  });

  const createMockDoc = (blocks: Block[] = []): ClipDoc => ({
    platform: 'twitter',
    sourceUrl: 'https://twitter.com/user/status/123',
    canonicalUrl: 'https://twitter.com/user/status/123',
    title: 'Test Document',
    author: 'testuser',
    fetchedAt: '2024-01-15T12:00:00Z',
    blocks,
    assets: { images: [] },
  });

  describe('generate', () => {
    it('should generate markdown file with front matter and blocks', async () => {
      const { generateOutputPaths, buildFrontMatter } = await import('../path.js');
      const mockDoc = createMockDoc([
        { type: 'paragraph', content: 'Test paragraph' },
      ]);

      (generateOutputPaths as jest.Mock).mockResolvedValue({
        markdownPath: '/test/output.md',
        assetsDir: '/test/assets',
      });
      (buildFrontMatter as jest.Mock).mockReturnValue('---\nfrontmatter\n---\n\n');
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await generator.generate(mockDoc, mockOutputDir);

      expect(result).toBe('/test/output.md');
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/output.md',
        expect.stringContaining('Test paragraph'),
        'utf-8'
      );
    });

    it('should use asset mapping for images', async () => {
      const { generateOutputPaths, buildFrontMatter } = await import('../path.js');
      const assetMapping = new Map([
        ['http://example.com/image.jpg', { status: 'success' as const, path: './assets/001.jpg', attempts: 1 }]
      ]);
      const mockDoc = createMockDoc([
        { type: 'image', url: 'http://example.com/image.jpg', alt: 'Test Image' },
      ]);

      (generateOutputPaths as jest.Mock).mockResolvedValue({
        markdownPath: '/test/output.md',
        assetsDir: '/test/assets',
      });
      (buildFrontMatter as jest.Mock).mockReturnValue('---\nfrontmatter\n---\n\n');
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await generator.generate(mockDoc, mockOutputDir, assetMapping);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/output.md',
        expect.stringContaining('./assets/001.jpg'),
        'utf-8'
      );
    });
  });

  describe('blockToMarkdown', () => {
    it('should convert paragraph block', () => {
      const block: Block = { type: 'paragraph', content: 'Test paragraph' };
      const result = (generator as any).blockToMarkdown(block, new Map());
      expect(result).toBe('Test paragraph');
    });

    it('should convert heading block with correct level', () => {
      const h1: Block = { type: 'heading', level: 1, content: 'Title' };
      const h2: Block = { type: 'heading', level: 2, content: 'Subtitle' };
      const h3: Block = { type: 'heading', level: 3, content: 'Section' };

      expect((generator as any).blockToMarkdown(h1, new Map())).toBe('# Title');
      expect((generator as any).blockToMarkdown(h2, new Map())).toBe('## Subtitle');
      expect((generator as any).blockToMarkdown(h3, new Map())).toBe('### Section');
    });

    it('should convert quote block', () => {
      const quote: Block = { type: 'quote', content: 'Test quote' };
      const result = (generator as any).blockToMarkdown(quote, new Map());
      expect(result).toBe('> Test quote');
    });

    it('should convert quote block with source URL', () => {
      const quote: Block = {
        type: 'quote',
        content: 'Test quote',
        sourceUrl: 'https://twitter.com/user/status/123',
      };
      const result = (generator as any).blockToMarkdown(quote, new Map());
      expect(result).toBe('> Test quote\n> 来源: [查看原推](https://twitter.com/user/status/123)');
    });

    it('should convert code block', () => {
      const code: Block = { type: 'code', content: 'console.log("test");', language: 'javascript' };
      const result = (generator as any).blockToMarkdown(code, new Map());
      expect(result).toBe('```javascript\nconsole.log("test");\n```');
    });

    it('should convert code block without language', () => {
      const code: Block = { type: 'code', content: 'code content' };
      const result = (generator as any).blockToMarkdown(code, new Map());
      expect(result).toBe('```\ncode content\n```');
    });

    it('should convert unordered list block', () => {
      const list: Block = {
        type: 'list',
        items: ['item 1', 'item 2', 'item 3'],
        ordered: false,
      };
      const result = (generator as any).blockToMarkdown(list, new Map());
      expect(result).toBe('- item 1\n- item 2\n- item 3');
    });

    it('should convert ordered list block', () => {
      const list: Block = {
        type: 'list',
        items: ['first', 'second', 'third'],
        ordered: true,
      };
      const result = (generator as any).blockToMarkdown(list, new Map());
      expect(result).toBe('. first\n. second\n. third');
    });

    it('should convert image block', () => {
      const image: Block = {
        type: 'image',
        url: 'http://example.com/image.jpg',
        alt: 'Test Image',
      };
      const result = (generator as any).blockToMarkdown(image, new Map());
      expect(result).toBe('![Test Image](http://example.com/image.jpg)');
    });

    it('should convert image block with asset mapping', () => {
      const image: Block = {
        type: 'image',
        url: 'http://example.com/image.jpg',
        alt: 'Test Image',
      };
      const assetMapping = new Map([
        ['http://example.com/image.jpg', { status: 'success' as const, path: './assets/001.jpg', attempts: 1 }]
      ]);
      const result = (generator as any).blockToMarkdown(image, assetMapping);
      expect(result).toBe('![Test Image](./assets/001.jpg)');
    });

    it('should convert link block', () => {
      const link: Block = {
        type: 'link',
        url: 'https://example.com',
        title: 'Example Site',
      };
      const result = (generator as any).blockToMarkdown(link, new Map());
      expect(result).toBe('[Example Site](https://example.com)');
    });

    it('should convert video block with thumbnail', () => {
      const video: Block = {
        type: 'video',
        url: 'https://example.com/video.mp4',
        thumbnail: 'https://example.com/thumb.jpg',
      };
      const assetMapping = new Map([
        ['https://example.com/thumb.jpg', { status: 'success' as const, path: './assets/001.jpg', attempts: 1 }]
      ]);
      const result = (generator as any).blockToMarkdown(video, assetMapping);
      expect(result).toBe('[视频: 已截图](./assets/001.jpg)\n\n[视频链接](https://example.com/video.mp4)');
    });

    it('should convert video block without thumbnail', () => {
      const video: Block = {
        type: 'video',
        url: 'https://example.com/video.mp4',
      };
      const result = (generator as any).blockToMarkdown(video, new Map());
      expect(result).toBe('[视频链接](https://example.com/video.mp4)');
    });

    it('should handle unknown block type', () => {
      const unknown = { type: 'unknown', content: 'test' } as any;
      const result = (generator as any).blockToMarkdown(unknown, new Map());
      expect(result).toBe('');
    });
  });

  describe('blocksToMarkdown', () => {
    it('should convert multiple blocks with proper spacing', () => {
      const blocks: Block[] = [
        { type: 'paragraph', content: 'First paragraph' },
        { type: 'heading', level: 2, content: 'Section' },
        { type: 'paragraph', content: 'Second paragraph' },
      ];
      const result = (generator as any).blocksToMarkdown(blocks, new Map());
      expect(result).toBe('First paragraph\n\n## Section\n\nSecond paragraph');
    });

    it('should handle empty block array', () => {
      const result = (generator as any).blocksToMarkdown([], new Map());
      expect(result).toBe('');
    });

    it('should preserve block order', () => {
      const blocks: Block[] = [
        { type: 'paragraph', content: 'First' },
        { type: 'paragraph', content: 'Second' },
        { type: 'paragraph', content: 'Third' },
      ];
      const result = (generator as any).blocksToMarkdown(blocks, new Map());
      const lines = result.split('\n\n');
      expect(lines[0]).toBe('First');
      expect(lines[1]).toBe('Second');
      expect(lines[2]).toBe('Third');
    });
  });
});
