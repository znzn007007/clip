# 图片位置修复设计文档

**日期**: 2026-01-19
**状态**: 设计完成，待实现

## 概述

修复 Twitter、WeChat、Zhihu 三个平台的图片位置问题，确保图片在导出的 Markdown 文件中出现在正确的段落级位置。

## 问题分析

### 当前状态

| 平台 | 当前实现 | 图片位置是否正确 |
|------|---------|-----------------|
| WeChat | `WeChatHtmlToBlocks` 按 DOM 顺序遍历 | ✅ 正确 |
| Zhihu | `ZhihuHtmlToBlocks` 按 DOM 顺序遍历 | ✅ 正确 |
| Twitter | `TwitterBlockBuilder` 先文字后批量添加图片 | ❌ 图片全部在末尾 |

### 问题根源

Twitter adapter 当前的提取路径：

```
rawData/DOM → TweetData → TwitterBlockBuilder.tweetToBlocks()
```

`TweetData.media` 数组只包含图片 URL，**没有位置信息**，导致 `TwitterBlockBuilder` 只能把所有图片 block 批量添加到文字后面。

## 架构设计

### 整体架构

采用**主路径 + Fallback** 的双路径设计：

```
┌─────────────────────────────────────────────────────────────┐
│                     TwitterAdapter                           │
│                                                              │
│  Path 1 (Primary):                                           │
│    RenderedPage.html → TwitterHtmlToBlocks → Block[]         │
│    ✅ 图片在正确位置                                         │
│                                                              │
│  Path 2 (Fallback):                                          │
│    rawData → TweetData → TwitterBlockBuilder → Block[]       │
│    ⚠️ 图片在末尾，但保证基本功能可用                        │
└─────────────────────────────────────────────────────────────┘
```

### 设计原则

1. **优先正确性**：默认使用 HTML 路径保证图片位置正确
2. **保持可用性**：rawData 路径作为 fallback，确保即使 HTML 解析失败也能工作
3. **代码一致性**：与 Zhihu/WeChat 保持相同的 HTML 解析模式

## 实现细节

### 新增文件：`src/core/extract/adapters/twitter/html-to-blocks.ts`

```typescript
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { Block } from '../../../types/index.js';

export class TwitterHtmlToBlocks {
  /**
   * Convert Twitter HTML to Block array, preserving image positions
   */
  convert(html: string): Block[] {
    const $ = cheerio.load(html);
    const blocks: Block[] = [];

    const $article = $('article[data-testid="tweet"]').first();
    if ($article.length === 0) return blocks;

    this.processTweetContent($, $article, blocks);
    return blocks;
  }

  private processTweetContent(
    $: cheerio.CheerioAPI,
    $container: cheerio.Cheerio<any>,
    blocks: Block[]
  ): void {
    const $clone = $container.clone();
    $clone.find('[data-testid="User-Name"], [data-testid="UserActions"], [role="group"], time').remove();

    const $textDiv = $clone.find('[data-testid="tweetText"], [data-testid="longformRichTextComponent"]');

    if ($textDiv.length > 0) {
      this.processTextContent($, $textDiv.first(), blocks);
    }

    // Images in DOM order
    $clone.find('img[src*="pbs.twimg.com"]').each((_, img) => {
      const $img = $(img);
      const url = $img.attr('src');
      if (url && !url.includes('profile_images')) {
        blocks.push({
          type: 'image',
          url: url.replace(/&name=\w+/, '&name=orig'),
          alt: $img.attr('alt') || '',
        });
      }
    });

    // Videos
    $clone.find('video').each((_, video) => {
      const $video = $(video);
      const src = $video.find('source').attr('src');
      if (src) {
        blocks.push({
          type: 'video',
          url: src,
          thumbnail: $video.attr('poster'),
        });
      }
    });

    // Hashtags
    $clone.find('a[href^="/hashtag/"]').each((_, a) => {
      const tag = $(a).text().trim();
      if (tag.startsWith('#')) {
        blocks.push({
          type: 'hashtag',
          tag,
          url: `https://x.com/hashtag/${tag.slice(1)}`,
        });
      }
    });

    // External links
    $clone.find('a[href^="http"]').not('[href*="/"]').each((_, a) => {
      blocks.push({
        type: 'link',
        url: $(a).attr('href') || '',
        title: $(a).text().trim(),
      });
    });
  }

  private processTextContent(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>,
    blocks: Block[]
  ): void {
    if ($element.is('[data-testid="tweetText"]')) {
      const text = $element.text().replace(/\s+/g, ' ').trim();
      if (text) {
        blocks.push({ type: 'paragraph', content: text });
      }
      return;
    }

    if ($element.is('[data-testid="longformRichTextComponent"]')) {
      this.processChildren($, $element[0], blocks);
    }
  }

  private processChildren($: cheerio.CheerioAPI, element: AnyNode, blocks: Block[]): void {
    $(element).contents().each((_, node) => {
      if (node.type === 'text') {
        const text = (node as any).data?.replace(/\s+/g, ' ').trim();
        if (text) {
          blocks.push({ type: 'paragraph', content: text });
        }
      } else if (node.type === 'tag') {
        const $node = $(node);
        const tagName = (node as Element).tagName?.toLowerCase();

        if (tagName === 'img') {
          const url = $node.attr('src');
          if (url && url.includes('pbs.twimg.com') && !url.includes('profile_images')) {
            blocks.push({
              type: 'image',
              url: url.replace(/&name=\w+/, '&name=orig'),
              alt: $node.attr('alt') || '',
            });
          }
        } else {
          this.processChildren($, node, blocks);
        }
      }
    });
  }
}
```

### 修改文件：`src/core/extract/adapters/twitter.ts`

调整提取路径优先级：

```typescript
export class TwitterAdapter extends BaseAdapter {
  async extract(page: RenderedPage): Promise<ExtractResult> {
    // Path 1 (Primary): HTML → HtmlToBlocks (correct image positions)
    if (page.html) {
      try {
        const htmlToBlocks = new TwitterHtmlToBlocks();
        const blocks = htmlToBlocks.convert(page.html);

        if (blocks.length > 0) {
          const tweet = this.extractTweetData(page);

          return {
            doc: {
              platform: 'twitter',
              sourceUrl: page.url,
              canonicalUrl: page.canonicalUrl,
              title: tweet.text.slice(0, 100) + (tweet.text.length > 100 ? '...' : ''),
              author: `@${tweet.author.screenName}`,
              publishedAt: tweet.createdAt,
              fetchedAt: new Date().toISOString(),
              blocks,
              assets: {
                images: blocks
                  .filter(b => b.type === 'image')
                  .map(b => ({ url: b.url, alt: b.alt })),
              },
            },
            warnings: [],
          };
        }
      } catch (error) {
        // Fall through to fallback
      }
    }

    // Path 2 (Fallback): rawData → TweetData → BlockBuilder (images at end)
    // ... 现有逻辑
  }
}
```

## 错误处理与边界情况

| 情况 | 处理方式 |
|------|---------|
| 找不到 tweet article | 返回空数组，触发 fallback |
| HTML 格式异常 | try-catch 捕获，触发 fallback |
| 没有 text 内容 | 返回只有图片的 blocks |
| 只有 text 没有图片 | 返回只有 text 的 blocks |
| 引用推文 | 递归处理引用推文 |
| 嵌套媒体 (gallery) | 按 DOM 顺序逐个添加 |

## 测试策略

### 单元测试

**文件**: `src/core/extract/adapters/twitter/__tests__/html-to-blocks.test.ts`

- 标准推文：文本 + 图片顺序正确
- 长推文：longformRichTextComponent 嵌套处理
- 边界情况：空 HTML、无效 HTML、profile_images 过滤
- hashtag 和链接提取

### 集成测试

**文件**: `src/core/extract/adapters/__tests__/twitter.adapter.test.ts`

- HTML 路径成功时图片位置正确
- HTML 失败时 fallback 到 rawData
- assets.images 正确提取

## 文件清单

### 新增文件

- `src/core/extract/adapters/twitter/html-to-blocks.ts`
- `src/core/extract/adapters/twitter/__tests__/html-to-blocks.test.ts`

### 修改文件

- `src/core/extract/adapters/twitter.ts`
- `src/core/extract/adapters/__tests__/twitter.adapter.test.ts`

## 后续工作

实现完成后，更新以下文档：

- `CLAUDE.md`：移除 "Image position" 已知问题
- `README.md`：添加图片位置修复说明
- `docs/dailyReport/2026-01-19-summary.md`：记录实现进度