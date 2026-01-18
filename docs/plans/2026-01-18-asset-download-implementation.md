# Asset Download Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement actual image downloading with retry, fallback, and failure reporting.

**Architecture:** AssetDownloader uses two-layer download (page.goto → page.evaluate fetch), sequential processing with exponential backoff retry (1s → 2s → 4s). Returns `Map<string, DownloadResult>` with status tracking.

**Tech Stack:** Playwright (BrowserContext, Page), Node.js fs/promises, TypeScript

---

## Context: Current State

**File:** `src/core/export/assets.ts`

Current implementation is a stub that only returns URL mappings without actual downloading:

```typescript
async downloadImages(images: AssetImage[], assetsDir: string): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const ext = this.getExtension(image.url);
    const filename = `${String(i + 1).padStart(3, '0')}.${ext}`;
    // Download logic will be implemented with Playwright
    mapping.set(image.url, `./assets/${filename}`);
  }
  return mapping;
}
```

**Key Changes:**
1. Add `DownloadResult` and `DownloadError` types
2. Implement actual download with two-layer fallback
3. Add retry with exponential backoff
4. Track failures for reporting
5. Return `Map<string, DownloadResult>` instead of `Map<string, string>`

---

## Task 1: Add Type Definitions

**Files:**
- Modify: `src/core/export/assets.ts`

**Step 1: Add type definitions to assets.ts**

Add at the top of the file, after the imports:

```typescript
// src/core/export/assets.ts
import type { BrowserContext } from 'playwright';
import type { AssetImage } from '../types/index.js';
import * as fs from 'fs/promises';
import { join } from 'path';

export interface DownloadResult {
  status: 'success' | 'failed';
  path: string;  // success: "./assets/001.jpg", failed: original URL
  error?: {
    reason: string;  // Chinese error message: 网络超时, 404, 连接失败, etc.
  };
}

export interface DownloadError {
  url: string;
  filename: string;  // e.g., "001.jpg" (for display, not URL)
  reason: string;    // Chinese error message
  attempts: number;  // 0-3
}
```

**Step 2: Run build to verify types compile**

Run: `npm run build`

Expected: SUCCESS, no type errors

**Step 3: Commit**

```bash
git add src/core/export/assets.ts
git commit -m "feat(assets): add DownloadResult and DownloadError type definitions"
```

---

## Task 2: Implement Private Helper Methods

**Files:**
- Modify: `src/core/export/assets.ts`

**Step 1: Add sleep utility method**

Add to `AssetDownloader` class:

```typescript
private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Step 2: Add tryContextDownload method**

Add to `AssetDownloader` class:

```typescript
private async tryContextDownload(url: string, filepath: string): Promise<void> {
  const page = await this.context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response?.status() || 'unknown'}`);
    }
    const buffer = await response.body();
    await fs.writeFile(filepath, buffer);
  } finally {
    await page.close();
  }
}
```

**Step 3: Add tryFetchDownload fallback method**

Add to `AssetDownloader` class:

```typescript
private async tryFetchDownload(url: string, filepath: string): Promise<void> {
  // Create a temporary page for fetch injection
  const page = await this.context.newPage();
  try {
    // Use page.evaluate to run fetch in browser context (preserves cookies)
    const bufferArray = await page.evaluate(async (fetchUrl) => {
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      return Array.from(new Uint8Array(arrayBuffer));
    }, url);

    await fs.writeFile(filepath, Buffer.from(bufferArray));
  } finally {
    await page.close();
  }
}
```

**Step 4: Add downloadWithRetry method**

Add to `AssetDownloader` class:

```typescript
private async downloadWithRetry(
  url: string,
  filepath: string,
  filename: string
): Promise<DownloadResult> {
  const errors: string[] = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Try Method 1: Context download
      await this.tryContextDownload(url, filepath);
      return { status: 'success', path: `./assets/${filename}` };
    } catch (e1) {
      errors.push(`Method1: ${(e1 as Error).message}`);

      // Try Method 2: Fetch fallback
      try {
        await this.tryFetchDownload(url, filepath);
        return { status: 'success', path: `./assets/${filename}` };
      } catch (e2) {
        errors.push(`Method2: ${(e2 as Error).message}`);
      }
    }

    // Retry delay with exponential backoff (1s, 2s, 4s)
    if (attempt < 2) {
      await this.sleep(1000 * Math.pow(2, attempt));
    }
  }

  // All attempts failed - return original URL
  const lastError = errors[errors.length - 1] || 'Unknown error';
  const reason = this.formatErrorReason(lastError);
  return {
    status: 'failed',
    path: url,  // Use original URL as fallback
    error: { reason }
  };
}

private formatErrorReason(error: string): string {
  if (error.includes('timeout') || error.includes('Timed out')) {
    return '网络超时';
  }
  if (error.includes('404')) {
    return '404 Not Found';
  }
  if (error.includes('403') || error.includes('401')) {
    return '访问被拒绝';
  }
  if (error.includes('ECONNREFUSED') || error.includes('fetch failed')) {
    return '连接失败';
  }
  return '下载失败';
}
```

**Step 5: Run build to verify**

Run: `npm run build`

Expected: SUCCESS

**Step 6: Commit**

```bash
git add src/core/export/assets.ts
git commit -m "feat(assets): add download helper methods with retry and fallback"
```

---

## Task 3: Update downloadImages Method

**Files:**
- Modify: `src/core/export/assets.ts`

**Step 1: Add failures tracking property**

Add to `AssetDownloader` class:

```typescript
export class AssetDownloader {
  private failures: DownloadError[] = [];

  constructor(private context: BrowserContext) {}
  // ... existing methods
```

**Step 2: Rewrite downloadImages method**

Replace the existing `downloadImages` method with:

```typescript
async downloadImages(
  images: AssetImage[],
  assetsDir: string
): Promise<Map<string, DownloadResult>> {
  // Reset failures for this batch
  this.failures = [];

  // Ensure assets directory exists
  await fs.mkdir(assetsDir, { recursive: true });

  const mapping = new Map<string, DownloadResult>();

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const ext = this.getExtension(image.url);
    const filename = `${String(i + 1).padStart(3, '0')}.${ext}`;
    const filepath = join(assetsDir, filename);

    // Download with retry
    const result = await this.downloadWithRetry(image.url, filepath, filename);
    mapping.set(image.url, result);

    // Track failures
    if (result.status === 'failed') {
      this.failures.push({
        url: image.url,
        filename,
        reason: result.error?.reason || '未知错误',
        attempts: 3
      });
    }
  }

  return mapping;
}
```

**Step 3: Add getFailures method**

Add to `AssetDownloader` class:

```typescript
getFailures(): DownloadError[] {
  return [...this.failures];
}
```

**Step 4: Run build**

Run: `npm run build`

Expected: SUCCESS

**Step 5: Commit**

```bash
git add src/core/export/assets.ts
git/core/export/assets.ts
git commit -m "feat(assets): implement downloadImages with retry and failure tracking"
```

---

## Task 4: Update ExportResult Type

**Files:**
- Modify: `src/core/export/types.ts`

**Step 1: Add DownloadError import and update ExportResult**

Update the file to export `DownloadError` and add to `ExportResult`:

```typescript
// src/core/export/types.ts
import type { ClipDoc } from '../types/index.js';
import type { DownloadError } from './assets.js';  // Add this import

export type ExportFormat = 'md' | 'md+html';

export interface ExportOptions {
  outputDir: string;
  format: ExportFormat;
  downloadAssets: boolean;
  json: boolean;
  cdpEndpoint?: string;
  debug?: boolean;
}

export interface ExportPaths {
  markdownPath: string;
  htmlPath?: string;
  assetsDir: string;
}

export interface ExportStats {
  wordCount: number;
  imageCount: number;
}

export interface ExportResult {
  status: 'success' | 'failed';
  platform: string;
  canonicalUrl?: string;
  title?: string;
  paths?: ExportPaths;
  meta?: {
    author?: string;
    publishedAt?: string;
    fetchedAt: string;
  };
  stats?: ExportStats;
  diagnostics?: {
    warnings: string[];
    error?: ExportError;
    assetFailures?: DownloadError[];  // Add this field
  };
}

export interface ExportError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  suggestion?: string;
}

export enum ErrorCode {
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  LOGIN_REQUIRED = 'login_required',
  DOM_CHANGED = 'dom_changed',
  EXTRACT_FAILED = 'extract_failed',
  ASSET_DOWNLOAD_FAILED = 'asset_download_failed',
  EXPORT_FAILED = 'export_failed',
  RATE_LIMITED = 'rate_limited',
  INVALID_URL = 'invalid_url',
  UNSUPPORTED_PLATFORM = 'unsupported_platform',
}
```

**Step 2: Fix circular import issue**

Since `assets.ts` imports from `types.ts`, we need to avoid circular dependency. Move `DownloadError` to a shared location or use type-only import.

Update `src/core/export/assets.ts` to use type-only import:

```typescript
// At the top of assets.ts
import type { BrowserContext } from 'playwright';
import type { AssetImage } from '../types/index.js';
import * as fs from 'fs/promises';
import { join } from 'path';

// Define types here (not imported)
export interface DownloadResult { /* ... */ }
export interface DownloadError { /* ... */ }
```

And update `src/core/export/types.ts` to import from assets:

```typescript
// src/core/export/types.ts
import type { ClipDoc } from '../types/index.js';
import type { DownloadError } from './assets.js';
```

**Step 3: Run build**

Run: `npm run build`

Expected: SUCCESS (no circular dependency errors)

**Step 4: Commit**

```bash
git add src/core/export/types.ts
git commit -m "feat(types): add assetFailures to ExportResult diagnostics"
```

---

## Task 5: Update buildExportResult Function

**Files:**
- Modify: `src/core/export/json.ts`

**Step 1: Read current buildExportResult implementation**

Run: `cat src/core/export/json.ts`

**Step 2: Update buildExportResult signature**

Add `assetFailures` parameter:

```typescript
export function buildExportResult(
  doc: ClipDoc,
  paths: ExportPaths,
  stats: ExportStats,
  assetFailures?: DownloadError[]
): ExportResult {
  // ... existing implementation
  // Add assetFailures to diagnostics
  const diagnostics: ExportResult['diagnostics'] = {};

  if (assetFailures && assetFailures.length > 0) {
    diagnostics.assetFailures = assetFailures;
  }

  return {
    status: 'success',
    platform: doc.platform,
    canonicalUrl: doc.canonicalUrl,
    title: doc.title,
    paths,
    meta: {
      author: doc.author,
      publishedAt: doc.publishedAt,
      fetchedAt: doc.fetchedAt,
    },
    stats,
    diagnostics: Object.keys(diagnostics).length > 0 ? diagnostics : undefined,
  };
}
```

**Step 3: Run build**

Run: `npm run build`

Expected: SUCCESS

**Step 4: Commit**

```bash
git add src/core/export/json.ts
git commit -m "feat(json): add assetFailures parameter to buildExportResult"
```

---

## Task 6: Update ClipOrchestrator

**Files:**
- Modify: `src/core/orchestrator.ts`

**Step 1: Update orchestrator to collect and pass failures**

Find the section where `downloadImages` is called and update:

```typescript
// src/core/orchestrator.ts
async archive(url: string, options: ExportOptions): Promise<ExportResult> {
  // ... existing code until download section

  // Download assets
  let assetMapping = new Map<string, DownloadResult>();
  let assetFailures: DownloadError[] = [];
  if (options.downloadAssets) {
    assetMapping = await assetDownloader.downloadImages(
      doc.assets.images,
      assetsDir
    );
    assetFailures = assetDownloader.getFailures();
  }

  // Generate markdown (pass failures)
  await markdownGen.generate(doc, options.outputDir, assetMapping, assetFailures);

  // Build result (pass failures)
  const stats = {
    wordCount: doc.blocks.length,
    imageCount: doc.assets.images.length,
  };

  return buildExportResult(doc, { markdownPath, assetsDir }, stats, assetFailures);

  // ... rest of method
}
```

**Step 2: Update MarkdownGenerator import**

The `generate` method signature will be updated in Task 7, but the import stays the same.

**Step 3: Run build**

Run: `npm run build`

Expected: May have type errors until MarkdownGenerator is updated in Task 7

**Step 4: Commit**

```bash
git add src/core/orchestrator.ts
git commit -m "feat(orchestrator): collect and pass asset download failures"
```

---

## Task 7: Update MarkdownGenerator

**Files:**
- Modify: `src/core/export/markdown.ts`

**Step 1: Import DownloadError type**

Add import:

```typescript
// src/core/export/markdown.ts
import * as fs from 'fs/promises';
import type { ClipDoc, Block, TweetMetaBlock } from '../types/index.js';
import type { DownloadResult, DownloadError } from './assets.js';  // Add this
import { buildFrontMatter, generateOutputPaths } from './path.js';
```

**Step 2: Update generate signature**

```typescript
async generate(
  doc: ClipDoc,
  outputDir: string,
  assetMapping: Map<string, DownloadResult>,  // Changed from Map<string, string>
  assetFailures?: DownloadError[]  // Add this parameter
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
```

**Step 3: Update blockToMarkdown to handle DownloadResult**

```typescript
private blockToMarkdown(block: Block, assetMapping: Map<string, DownloadResult>): string {
  // ...
  case 'image':
    const result = assetMapping.get(block.url);
    const filename = result?.path || block.url;  // Handle new structure
    return `![${block.alt}](${filename})`;

  case 'video':
    if (block.thumbnail) {
      const thumbResult = assetMapping.get(block.thumbnail);
      const thumb = thumbResult?.path || block.thumbnail;
      return `[视频: 已截图](${thumb})\n\n[视频链接](${block.url})`;
    }
    return `[视频链接](${block.url})`;
  // ...
}
```

**Step 4: Run build**

Run: `npm run build`

Expected: SUCCESS, all type errors resolved

**Step 5: Commit**

```bash
git add src/core/export/markdown.ts
git commit -m "feat(markdown): add asset failure notice and update for DownloadResult"
```

---

## Task 8: Update Tests

**Files:**
- Modify: `src/core/export/__tests__/assets.test.ts`

**Step 1: Update imports and add type imports**

```typescript
// src/core/export/__tests__/assets.test.ts
import { AssetDownloader, type DownloadResult } from '../assets.js';
import type { BrowserContext } from 'playwright';
import type { AssetImage } from '../../types/index.js';
```

**Step 2: Update existing tests for new return type**

Update each test to check `DownloadResult` structure:

```typescript
describe('AssetDownloader', () => {
  // ... setup

  describe('downloadImages', () => {
    it('should create mapping for single image', async () => {
      const images: AssetImage[] = [
        { url: 'https://example.com/image.jpg', alt: 'Test Image' },
      ];
      const assetsDir = '/test/assets';

      // Mock the download methods
      jest.spyOn(downloader as any, 'downloadWithRetry').mockResolvedValue({
        status: 'success',
        path: './assets/001.jpg'
      });

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);
      const downloadResult = result.get('https://example.com/image.jpg');
      expect(downloadResult?.status).toBe('success');
      expect(downloadResult?.path).toBe('./assets/001.jpg');
    });

    it('should handle empty image array', async () => {
      const images: AssetImage[] = [];
      const assetsDir = '/test/assets';

      const result = await downloader.downloadImages(images, assetsDir);

      expect(result.size).toBe(0);
      expect(downloader.getFailures()).toHaveLength(0);
    });

    // ... update other tests similarly
  });
});
```

**Step 3: Add new test for download failure tracking**

```typescript
describe('getFailures', () => {
  it('should return empty array when no failures', async () => {
    const images: AssetImage[] = [
      { url: 'https://example.com/image.jpg', alt: 'Test Image' },
    ];

    jest.spyOn(downloader as any, 'downloadWithRetry').mockResolvedValue({
      status: 'success',
      path: './assets/001.jpg'
    });

    await downloader.downloadImages(images, '/test/assets');

    expect(downloader.getFailures()).toEqual([]);
  });

  it('should track failed downloads', async () => {
    const images: AssetImage[] = [
      { url: 'https://example.com/fail.jpg', alt: 'Failed Image' },
    ];

    jest.spyOn(downloader as any, 'downloadWithRetry').mockResolvedValue({
      status: 'failed',
      path: 'https://example.com/fail.jpg',
      error: { reason: '网络超时' }
    });

    await downloader.downloadImages(images, '/test/assets');

    const failures = downloader.getFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      url: 'https://example.com/fail.jpg',
      filename: '001.jpg',
      reason: '网络超时',
      attempts: 3
    });
  });
});
```

**Step 4: Add integration test for retry logic**

```typescript
describe('downloadWithRetry', () => {
  it('should retry with exponential backoff on failure', async () => {
    const url = 'https://example.com/image.jpg';
    const filepath = '/test/assets/001.jpg';

    // Mock to fail first 2 times, succeed on 3rd
    let attempts = 0;
    jest.spyOn(downloader as any, 'tryContextDownload').mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Network timeout');
      }
    });

    jest.spyOn(downloader as any, 'tryFetchDownload').mockRejectedValue(new Error('Fallback also failed'));

    const sleepSpy = jest.spyOn(downloader as any, 'sleep').mockResolvedValue(undefined);

    const result = await (downloader as any).downloadWithRetry(url, filepath, '001.jpg');

    // Should have attempted 3 times (initial + 2 retries)
    expect(attempts).toBe(3);

    // Should have called sleep with exponential backoff (1000, 2000)
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000);
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000);

    expect(result.status).toBe('failed');
    expect(result.path).toBe(url);
    expect(result.error?.reason).toBe('网络超时');
  });
});
```

**Step 5: Run tests**

Run: `npm test -- src/core/export/__tests__/assets.test.ts`

Expected: Some tests may fail until mocks are properly set up for download methods

**Step 6: Fix test mocks and run again**

Add proper mocks for BrowserContext and Page:

```typescript
describe('AssetDownloader', () => {
  let downloader: AssetDownloader;
  let mockContext: jest.Mocked<BrowserContext>;
  let mockPage: any;

  beforeEach(() => {
    mockPage = {
      goto: jest.fn(),
      close: jest.fn(),
      evaluate: jest.fn(),
    };

    mockContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
    } as any;

    downloader = new AssetDownloader(mockContext);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  // ... tests
});
```

**Step 7: Run tests again**

Run: `npm test -- src/core/export/__tests__/assets.test.ts`

Expected: All tests PASS

**Step 8: Commit**

```bash
git add src/core/export/__tests__/assets.test.ts
git commit -m "test(assets): update tests for DownloadResult and failure tracking"
```

---

## Task 9: Run Full Test Suite

**Step 1: Run all tests**

Run: `npm test`

Expected: All tests PASS (or fix any issues)

**Step 2: Build project**

Run: `npm run build`

Expected: SUCCESS

**Step 3: Manual test with real URL**

Run: `npm run build && node dist/cli/index.js once "https://x.com/user/status/123" --download-assets`

Expected:
- Images downloaded to `assets/` directory
- Markdown file with local image paths
- If any downloads fail, failure notice at end of markdown

**Step 4: Check generated files**

Run: `cat ./twitter/2026/*/01/*/index.md`

Expected: See either local paths `./assets/001.jpg` or original URLs for failed downloads

**Step 5: Commit**

```bash
git add .
git commit -m "test: verify full test suite passes and manual testing works"
```

---

## Task 10: Update Documentation

**Files:**
- Modify: `docs/pending-tasks.md`

**Step 1: Mark asset download task as completed**

Update `docs/pending-tasks.md`:

```markdown
### 1. 资产下载实现 / Asset Download Implementation

**优先级:** ✅ 已完成 (2026-01-18)

**实现内容:**
- 实际图片下载（两层 fallback: page.goto → page.evaluate fetch）
- 重试机制（指数退避: 1s → 2s → 4s）
- 失败追踪（ExportResult.assetFailures + Markdown 尾注）
- 返回类型更新为 Map<url, DownloadResult>
```

**Step 2: Update CLAUDE.md if needed**

Remove the known issue about asset downloading:

```markdown
## Known Issues

1. ~~Asset downloading not implemented~~ - ✅ Completed
```

**Step 3: Commit**

```bash
git add docs/pending-tasks.md CLAUDE.md
git commit -m "docs: mark asset download as completed"
```

---

## Summary

This plan implements the full asset download feature with:

1. **Two-layer download fallback**: Context download → Fetch in-page
2. **Exponential backoff retry**: 1s → 2s → 4s delays
3. **Failure tracking**: Both in ExportResult and markdown footer
4. **Type safety**: New DownloadResult and DownloadError types
5. **Backward compatibility**: Failed images use original URL

**Files Modified:**
- `src/core/export/assets.ts` - Main implementation
- `src/core/export/types.ts` - ExportResult type
- `src/core/export/json.ts` - buildExportResult function
- `src/core/export/markdown.ts` - Failure notice in markdown
- `src/core/orchestrator.ts` - Collect and pass failures
- `src/core/export/__tests__/assets.test.ts` - Test updates
- `docs/pending-tasks.md` - Documentation
