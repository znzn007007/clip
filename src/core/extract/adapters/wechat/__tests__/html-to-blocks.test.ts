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

  it('filters out data:image URLs and empty images', () => {
    const html = `
      <img src="data:image/png;base64,abc123" alt="base64" />
      <img src="" alt="empty" />
      <img alt="no-src" />
      <img src="https://valid.example.com/img.jpg" alt="valid" />
    `;

    const converter = new WeChatHtmlToBlocks();
    const blocks = converter.convert(html);

    expect(blocks).toEqual([
      { type: 'image', url: 'https://valid.example.com/img.jpg', alt: 'valid' },
    ]);
  });

  it('handles pre tags without code tags', () => {
    const html = `<pre>console.log("direct code");</pre>`;

    const converter = new WeChatHtmlToBlocks();
    const blocks = converter.convert(html);

    expect(blocks).toEqual([
      { type: 'code', content: 'console.log("direct code");', language: '' },
    ]);
  });

  it('handles ordered lists', () => {
    const html = `<ol><li>First</li><li>Second</li><li>Third</li></ol>`;

    const converter = new WeChatHtmlToBlocks();
    const blocks = converter.convert(html);

    expect(blocks).toEqual([
      { type: 'list', items: ['First', 'Second', 'Third'], ordered: true },
    ]);
  });

  it('handles iframe videos', () => {
    const html = `<iframe src="https://youtube.com/embed/123" data-cover="//img.example.com/thumb.jpg"></iframe>`;

    const converter = new WeChatHtmlToBlocks();
    const blocks = converter.convert(html);

    expect(blocks).toEqual([
      { type: 'video', url: 'https://youtube.com/embed/123', thumbnail: 'https://img.example.com/thumb.jpg' },
    ]);
  });

  it('handles mp-video tags', () => {
    const html = `<mp-video src="https://video.example.com/v.mp4" poster="//img.example.com/p.jpg"></mp-video>`;

    const converter = new WeChatHtmlToBlocks();
    const blocks = converter.convert(html);

    expect(blocks).toEqual([
      { type: 'video', url: 'https://video.example.com/v.mp4', thumbnail: 'https://img.example.com/p.jpg' },
    ]);
  });

  it('handles images with data-original attribute', () => {
    const html = `<img data-original="https://img.example.com/original.jpg" alt="original" />`;

    const converter = new WeChatHtmlToBlocks();
    const blocks = converter.convert(html);

    expect(blocks).toEqual([
      { type: 'image', url: 'https://img.example.com/original.jpg', alt: 'original' },
    ]);
  });

  it('handles empty paragraphs and empty list items', () => {
    const html = `
      <p></p>
      <p>   </p>
      <ul><li></li><li>Valid item</li></ul>
    `;

    const converter = new WeChatHtmlToBlocks();
    const blocks = converter.convert(html);

    expect(blocks).toEqual([
      { type: 'list', items: ['Valid item'], ordered: false },
    ]);
  });

  it('ignores links without href or text', () => {
    const html = `
      <a>no href</a>
      <a href="https://example.com"></a>
      <a href="https://example.com">Valid Link</a>
    `;

    const converter = new WeChatHtmlToBlocks();
    const blocks = converter.convert(html);

    expect(blocks).toEqual([
      { type: 'link', url: 'https://example.com', title: 'Valid Link' },
    ]);
  });

  it('handles video with source child element', () => {
    const html = `<video><source src="https://video.example.com/v.mp4" type="video/mp4" /></video>`;

    const converter = new WeChatHtmlToBlocks();
    const blocks = converter.convert(html);

    expect(blocks).toEqual([
      { type: 'video', url: 'https://video.example.com/v.mp4', thumbnail: undefined },
    ]);
  });

  it('handles already https URLs in normalizeUrl', () => {
    const html = `<img src="https://img.example.com/already-https.jpg" alt="https" />`;

    const converter = new WeChatHtmlToBlocks();
    const blocks = converter.convert(html);

    expect(blocks).toEqual([
      { type: 'image', url: 'https://img.example.com/already-https.jpg', alt: 'https' },
    ]);
  });
});
