# Zhihu Content Parsing Design

> **For Claude:** Use this design as the specification for implementing Zhihu content parsing.

**Date:** 2026-01-17
**Status:** Ready for Implementation
**Related:** M1 Implementation Plan

---

## Overview

This document defines the design for parsing Zhihu content, including both articles (专栏) and answers (问答). The implementation uses a hybrid approach: primary path via Zhihu's internal data, with Cheerio HTML parsing as fallback.

---

## Requirements

### M1 Scope

- **Articles**: Parse and export Zhihu column articles (`zhuanlan.zhihu.com/p/*`)
- **Answers**: Parse specific answers provided by user (`www.zhihu.com/question/*/answer/*`)
  - Extract question title
  - Extract the specific answer content
  - No need to determine "best" answer - user provides exact answer URL
- **Images**: Download images to local assets directory
- **HTML Conversion**: Full conversion preserving paragraphs, headings, code blocks, lists, links, tables

### Out of Scope (Future)

- Multiple answers per question
- Comments parsing
- Video content
- Login-wall bypass

---

## Architecture

### Data Flow

```
知乎 URL
    ↓
PageRenderer (获取 HTML + rawData)
    ↓
ZhihuAdapter.extract()
    ├→ rawData 存在?
    │  ├→ 是 → parseFromRawState()
    │  └→ 否 → parseFromCheerio()
    ↓
ZhihuData (结构化数据)
    ↓
ZhihuHtmlToBlocks.convert()
    ↓
Block[] (统一格式)
    ↓
ClipDoc (最终文档)
    ↓
MarkdownGenerator → content.md
AssetDownloader → assets/
```

### URL Pattern Recognition

- **文章**: `zhuanlan.zhihu.com/p/[id]`
- **回答**: `www.zhihu.com/question/[id]/answer/[id]` or `zhihu.com/question/[id]/answer/[id]`

---

## Data Structures

```typescript
// Zhihu-specific data structures
interface ZhihuData {
  type: 'article' | 'answer';

  // Article fields
  title?: string;

  // Answer fields
  question?: {
    title: string;
    detail?: string;
  };

  // Common fields
  content: string;  // HTML 格式
  author: {
    name: string;
    url: string;
  };
  publishedAt: string;
  images: string[];
  upvotes?: number;  // 仅回答
}
```

---

## Components

### 1. ZhihuParser

**File:** `src/core/extract/adapters/zhihu/parser.ts`

**Responsibilities:**
- Parse Zhihu internal state into ZhihuData
- Parse Cheerio elements into ZhihuData
- Handle both article and answer formats

**Key Methods:**
- `parseFromRawState(state: unknown): ZhihuData | null`
- `parseFromCheerio($: CheerioAPI, url: string): ZhihuData`
- `parseAnswer($: CheerioAPI, url: string): ZhihuData`
- `parseArticle($: CheerioAPI, url: string): ZhihuData`

### 2. ZhihuHtmlToBlocks

**File:** `src/core/extract/adapters/zhihu/html-to-blocks.ts`

**Responsibilities:**
- Convert Zhihu HTML content to Block array
- Preserve formatting: paragraphs, headings, code, lists, links, images
- Handle nested structures

**Key Methods:**
- `convert(html: string): Block[]`
- `processChildren($: CheerioAPI, element: AnyNode, blocks: Block[]): void`

### 3. ZhihuAdapter

**File:** `src/core/extract/adapters/zhihu/index.ts`

**Responsibilities:**
- Orchestrate parsing flow
- Build ClipDoc from ZhihuData
- Dual-path parsing with fallback

**Key Methods:**
- `extract(page: RenderedPage): Promise<ExtractResult>`
- `buildDoc(data: ZhihuData, page: RenderedPage): ClipDoc`

### 4. ZhihuExtractError

**File:** `src/core/extract/adapters/zhihu/errors.ts`

**Error Types:**
- `CONTENT_NOT_FOUND` - Content not found or deleted
- `PARSE_FAILED` - Parsing error
- `LOGIN_REQUIRED` - Login wall detected

---

## Key Implementation Details

### Answer Parsing Strategy

```typescript
// 提取问题标题
const questionTitle = $('h1.QuestionHeader-title').text().trim();

// 提取回答内容
const answerContent = $('.RichContent-inner').html() || '';

// 提取作者
const authorName = $('.AuthorInfo-name').text().trim();

// 提取赞同数
const upvotesText = $('.VoteButton--up .VoteCount').text().trim();
const upvotes = this.parseNumber(upvotesText);
```

### HTML Conversion Strategy

支持的 HTML 标签转换：
- `<p>` → `ParagraphBlock`
- `<h1>-<h6>` → `HeadingBlock`
- `<blockquote>` → `QuoteBlock`
- `<pre><code>` → `CodeBlock`
- `<ul>/<ol>` → `ListBlock`
- `<img>` → `ImageBlock`
- `<a>` → `LinkBlock`

递归处理其他标签，保留文本内容。

### Image Handling

```typescript
private toHighRes(url: string): string {
  // 知乎图片 URL 处理
  return url
    .replace(/_b\.jpg/, '_r.jpg')
    .replace(/\/\d+_\d+_\//, '/2000_2000_/');
}
```

---

## Error Handling

### Boundary Cases

1. **登录墙检测**: 检测 "请登录" 或 "查看更多内容需要登录"
2. **内容被删除**: 检测 "内容已被删除" 或 "404"
3. **匿名用户**: 处理未登录状态
4. **图片加载失败**: 记录警告，继续处理
5. **空内容**: 抛出 `CONTENT_NOT_FOUND`

---

## File Structure

**New Files:**
```
src/core/extract/adapters/zhihu/
├── index.ts              # ZhihuAdapter
├── parser.ts             # ZhihuParser
├── html-to-blocks.ts     # ZhihuHtmlToBlocks
└── errors.ts             # ZhihuExtractError
```

**Modified Files:**
- `src/core/extract/registry.ts` - Register ZhihuAdapter

---

## Output Example

**Input:** `https://www.zhihu.com/question/12345/answer/67890`

**Output Markdown:**
```markdown
---
title: "如何学习编程？"
source_url: "https://www.zhihu.com/question/12345/answer/67890"
platform: "zhihu"
author: "张三"
published_at: "2026-01-17T10:00:00Z"
fetched_at: "2026-01-17T12:00:00Z"
tags: []
---

## 如何学习编程？

学习编程需要耐心和坚持。

### 1. 选择语言

建议从 Python 开始...

```python
print("Hello, World!")
```

**赞同数**: 1234

![示例图片](./assets/001.jpg)
```

---

## Testing Strategy

### Unit Tests
- ZhihuParser.parseFromCheerio() with mock HTML
- ZhihuHtmlToBlocks.convert() with various HTML snippets
- Error handling for login walls and deleted content

### Integration Tests
- Full flow with real Zhihu URLs (using saved HTML snapshots)
- Fallback behavior when rawData is missing
- Image download functionality

---

## Implementation Order

1. Create zhihu directory structure
2. Implement ZhihuExtractError
3. Implement ZhihuHtmlToBlocks (standalone, testable)
4. Implement ZhihuParser with Cheerio path
5. Implement ZhihuAdapter
6. Register adapter in registry
7. Update existing tests
8. End-to-end testing

---

## Open Questions

- How often does Zhihu change their DOM structure?
- Should we add support for Zhihu "想法" (Thoughts)?
- How to handle very long articles (paging)?
- Should we preserve article tags/topics?
