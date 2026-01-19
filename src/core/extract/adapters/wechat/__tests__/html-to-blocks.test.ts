import { describe, it, expect } from '@jest/globals';
import { WeChatHtmlToBlocks } from '../html-to-blocks.js';

describe('WeChatHtmlToBlocks', () => {
  it('converts mixed HTML into blocks', () => {
    const html = `
      <h2>Heading</h2>
      <p>Paragraph text <img data-src="//img.example.com/a.jpg" alt="A" /></p>
      <blockquote>Quote here</blockquote>
      <pre><code class="language-js">console.log("hi");</code></pre>
      <ul><li>Item 1</li><li>Item 2</li></ul>
      <a href="https://example.com">Example</a>
      <video src="https://video.example.com/v.mp4" poster="//img.example.com/p.jpg"></video>
      <section><div><p>Nested text</p></div></section>
    `;

    const converter = new WeChatHtmlToBlocks();
    const blocks = converter.convert(html);

    expect(blocks).toEqual(
      expect.arrayContaining([
        { type: 'heading', level: 2, content: 'Heading' },
        { type: 'paragraph', content: 'Paragraph text' },
        { type: 'image', url: 'https://img.example.com/a.jpg', alt: 'A' },
        { type: 'quote', content: 'Quote here' },
        { type: 'code', content: 'console.log("hi");', language: 'js' },
        { type: 'list', items: ['Item 1', 'Item 2'], ordered: false },
        { type: 'link', url: 'https://example.com', title: 'Example' },
        { type: 'video', url: 'https://video.example.com/v.mp4', thumbnail: 'https://img.example.com/p.jpg' },
        { type: 'paragraph', content: 'Nested text' },
      ])
    );
  });

  it('handles root text, standalone images, and media inside paragraphs', () => {
    const html = `
      Plain text
      <img src="//img.example.com/standalone.jpg" alt="standalone" />
      <p>
        <video data-src="//video.example.com/v.mp4" data-cover="//img.example.com/cover.jpg"></video>
      </p>
    `;

    const converter = new WeChatHtmlToBlocks();
    const blocks = converter.convert(html);

    expect(blocks).toEqual(
      expect.arrayContaining([
        { type: 'paragraph', content: 'Plain text' },
        { type: 'image', url: 'https://img.example.com/standalone.jpg', alt: 'standalone' },
        { type: 'video', url: 'https://video.example.com/v.mp4', thumbnail: 'https://img.example.com/cover.jpg' },
      ])
    );
  });
});
