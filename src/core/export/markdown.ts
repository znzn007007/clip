// src/core/export/markdown.ts
import * as fs from 'fs/promises';
import type { ClipDoc, Block, TweetMetaBlock } from '../types/index.js';
import type { DownloadResult, DownloadError } from './assets.js';
import { buildFrontMatter, generateOutputPaths } from './path.js';

export class MarkdownGenerator {
  async generate(
    doc: ClipDoc,
    outputDir: string,
    assetMapping: Map<string, DownloadResult> = new Map(),
    assetFailures?: DownloadError[]
  ): Promise<string> {
    const { markdownPath } = await generateOutputPaths(doc, outputDir);

    let content = buildFrontMatter(doc);
    content += this.blocksToMarkdown(doc.blocks, assetMapping);

    // Add failure notice
    if (assetFailures && assetFailures.length > 0) {
      content += '\n\n---\n\n';
      content += '## 图片下载提示\n\n';
      content += '部分图片使用在线链接：\n\n';
      for (const fail of assetFailures) {
        content += `• ${fail.filename} (${fail.reason})\n`;
      }
    }

    await fs.writeFile(markdownPath, content, 'utf-8');

    return markdownPath;
  }

  private blocksToMarkdown(blocks: Block[], assetMapping: Map<string, DownloadResult>): string {
    return blocks.map(block => this.blockToMarkdown(block, assetMapping)).join('\n\n');
  }

  private blockToMarkdown(block: Block, assetMapping: Map<string, DownloadResult>): string {
    switch (block.type) {
      case 'paragraph':
        return block.content;

      case 'heading':
        return '#'.repeat(block.level) + ' ' + block.content;

      case 'quote':
        if (block.sourceUrl) {
          return `> ${block.content}\n> 来源: [查看原推](${block.sourceUrl})`;
        }
        return `> ${block.content}`;

      case 'code':
        return '```' + (block.language || '') + '\n' + block.content + '\n```';

      case 'list':
        const prefix = block.ordered ? '. ' : '- ';
        return block.items.map(item => prefix + item).join('\n');

      case 'image':
        const result = assetMapping.get(block.url);
        const filename = result?.path || block.url;
        return `![${block.alt}](${filename})`;

      case 'link':
        return `[${block.title}](${block.url})`;

      case 'video':
        if (block.thumbnail) {
          const thumbResult = assetMapping.get(block.thumbnail);
          const thumb = thumbResult?.path || block.thumbnail;
          return `[视频: 已截图](${thumb})\n\n[视频链接](${block.url})`;
        }
        return `[视频链接](${block.url})`;

      case 'hashtag':
        return `[${block.tag}](${block.url})`;

      case 'tweet_meta':
        return this.formatTweetMeta(block);

      default:
        return '';
    }
  }

  private formatTweetMeta(meta: TweetMetaBlock): string {
    const parts: string[] = [];
    if (meta.likes > 0) parts.push(`❤️ ${meta.likes}`);
    if (meta.retweets > 0) parts.push(`🔁 ${meta.retweets}`);
    if (meta.replies > 0) parts.push(`💬 ${meta.replies}`);
    if (meta.views > 0) parts.push(`👁️ ${meta.views}`);

    return parts.length > 0
      ? `\n\n---\n\n**互动数据**: ${parts.join(' | ')}\n`
      : '';
  }
}
