import { describe, it, expect } from '@jest/globals';
import { TwitterHtmlToBlocks } from '../html-to-blocks.js';

describe('TwitterHtmlToBlocks', () => {
  describe('Buffer 机制', () => {
    it('应该合并相邻的 text token', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">
            <span>Hello</span>
            <span> World</span>
          </div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual({
        type: 'paragraph',
        content: 'Hello World',
      });
    });

    it('应该在块级元素前 flush buffer', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">Text before</div>
          <img src="https://pbs.twimg.com/media/1.jpg?name=small">
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks[0].type).toBe('paragraph');
      expect((blocks[0] as any).content).toBe('Text before');
      expect(blocks[1].type).toBe('image');
      expect((blocks[1] as any).url).toBe('https://pbs.twimg.com/media/1.jpg?name=orig');
    });

    it('应该在 <br> 时 flush buffer', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">Line 1<br>Line 2</div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks).toEqual([
        { type: 'paragraph', content: 'Line 1' },
        { type: 'paragraph', content: 'Line 2' },
      ]);
    });
  });

  describe('Link 和 Hashtag', () => {
    it('hashtag 应该转换为 markdown 链接', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">
            <a href="/hashtag/Tech">#Tech</a>
          </div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect((blocks[0] as any).content).toContain('[#Tech](https://x.com/hashtag/Tech)');
    });

    it('相对链接应该退化为 text', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">
            <a href="/user">@user</a>
          </div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect((blocks[0] as any).content).toBe('@user');
      expect((blocks[0] as any).content).not.toContain('[');
    });
  });

  describe('多 tweet 处理', () => {
    it('应该在多个 tweet 之间插入分隔符', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">First tweet</div>
        </article>
        <article data-testid="tweet">
          <div data-testid="tweetText">Second tweet</div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks).toEqual([
        { type: 'paragraph', content: 'First tweet' },
        { type: 'paragraph', content: '---' },
        { type: 'paragraph', content: 'Second tweet' },
      ]);
    });
  });

  describe('Skip 逻辑', () => {
    it('应该跳过 profile_images', () => {
      const html = `
        <article data-testid="tweet">
          <img src="https://pbs.twimg.com/profile_images/avatar.jpg">
          <img src="https://pbs.twimg.com/media/1.jpg">
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      const images = blocks.filter((b: any) => b.type === 'image');
      expect(images).toHaveLength(1);
      expect((images[0] as any).url).toContain('1.jpg');
    });

    it('应该跳过 UserActions', () => {
      const html = `
        <article data-testid="tweet">
          <div data-testid="tweetText">Hello</div>
          <div data-testid="UserActions">
            <a href="/like">Like</a>
          </div>
        </article>
      `;
      const blocks = new TwitterHtmlToBlocks().convert(html);

      expect(blocks).toHaveLength(1);
      expect((blocks[0] as any).content).toBe('Hello');
    });
  });
});
