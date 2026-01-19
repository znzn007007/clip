# 去重逻辑实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现内容去重功能，避免重复归档同一 URL，支持跳过和强制覆盖两种模式。

**Architecture:** 创建 `DedupeManager` 类管理归档记录，在 `ClipOrchestrator` 和 `BatchRunner` 中集成去重检查。去重记录存储在输出目录下的 `.archived.json` 文件中。

**Tech Stack:** TypeScript, Node.js fs/promises, 现有 ClipDoc 类型系统

---

## Task 1: 添加去重错误码

**Files:**
- Modify: `src/core/export/types.ts:53-64`

**Step 1: 添加 ALREADY_ARCHIVED 错误码**

在 `ErrorCode` enum 中添加新值：

```typescript
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
  ALREADY_ARCHIVED = 'already_archived',  // 新增
}
```

**Step 2: 验证编译**

Run: `npm run build`
Expected: 编译成功，无错误

**Step 3: 运行测试**

Run: `npm test`
Expected: 所有测试通过

**Step 4: Commit**

```bash
git add src/core/export/types.ts
git commit -m "feat(dedupe): add ALREADY_ARCHIVED error code"
```

---

## Task 2: 创建去重类型定义

**Files:**
- Create: `src/core/dedupe/types.ts`

**Step 1: 创建类型文件**

```typescript
// src/core/dedupe/types.ts
export interface ArchiveRecord {
  firstSeen: string;      // ISO 8601 timestamp
  lastUpdated: string;    // ISO 8601 timestamp
  path: string;           // 相对路径，如 "./twitter/2026/01/19/abc/"
  platform: string;       // 'twitter' | 'zhihu' | 'wechat'
}

export interface ArchiveDatabase {
  archived: Record<string, ArchiveRecord>;
  version: number;
}

export interface DedupeCheckResult {
  isArchived: boolean;
  record?: ArchiveRecord;
}
```

**Step 2: 运行测试**

Run: `npm run build`
Expected: 编译成功

**Step 3: Commit**

```bash
git add src/core/dedupe/types.ts
git commit -m "feat(dedupe): add type definitions"
```

---

## Task 3: 实现去重策略函数

**Files:**
- Create: `src/core/dedupe/strategy.ts`
- Modify: `src/core/render/utils.ts:29-33`
- Test: `src/core/dedupe/__tests__/strategy.test.ts`

**Step 1: 编写测试用例**

创建 `src/core/dedupe/__tests__/strategy.test.ts`：

```typescript
// src/core/dedupe/__tests__/strategy.test.ts
import { describe, it, expect } from '@jest/globals';
import { getDedupeKey } from '../strategy.js';
import type { ClipDoc } from '../../types/index.js';

describe('getDedupeKey', () => {
  it('优先使用 canonicalUrl', () => {
    const doc: ClipDoc = {
      platform: 'twitter',
      sourceUrl: 'https://twitter.com/user/status/123',
      canonicalUrl: 'https://x.com/user/status/123',
      title: 'Test',
      fetchedAt: '2026-01-19T00:00:00Z',
      blocks: [],
      assets: { images: [] },
    };
    expect(getDedupeKey(doc)).toBe('https://x.com/user/status/123');
  });

  it('当没有 canonicalUrl 时使用 normalized sourceUrl', () => {
    const doc: ClipDoc = {
      platform: 'twitter',
      sourceUrl: 'https://x.com/user/status/123#hash',
      title: 'Test',
      fetchedAt: '2026-01-19T00:00:00Z',
      blocks: [],
      assets: { images: [] },
    };
    expect(getDedupeKey(doc)).toBe('https://x.com/user/status/123');
  });

  it('移除 URL hash', () => {
    const doc: ClipDoc = {
      platform: 'twitter',
      sourceUrl: 'https://x.com/user/status/123#m123',
      title: 'Test',
      fetchedAt: '2026-01-19T00:00:00Z',
      blocks: [],
      assets: { images: [] },
    };
    expect(getDedupeKey(doc)).toBe('https://x.com/user/status/123');
  });
});
```

**Step 2: 运行测试确认失败**

Run: `npm test -- strategy`
Expected: FAIL - "getDedupeKey is not defined"

**Step 3: 实现策略函数**

创建 `src/core/dedupe/strategy.ts`：

```typescript
// src/core/dedupe/strategy.ts
import type { ClipDoc } from '../types/index.js';
import { normalizeUrl } from '../render/utils.js';

export function getDedupeKey(doc: ClipDoc): string {
  // 优先级：canonicalUrl > normalized(sourceUrl)
  return doc.canonicalUrl || normalizeUrl(doc.sourceUrl);
}

export function getDedupeKeyFromUrl(url: string): string {
  return normalizeUrl(url);
}
```

**Step 4: 运行测试确认通过**

Run: `npm test -- strategy`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/core/dedupe/strategy.ts src/core/dedupe/__tests__/strategy.test.ts
git commit -m "feat(dedupe): implement getDedupeKey strategy"
```

---

## Task 4: 实现 DedupeManager 核心功能

**Files:**
- Create: `src/core/dedupe/manager.ts`
- Test: `src/core/dedupe/__tests__/manager.test.ts`

**Step 1: 编写测试用例**

创建 `src/core/dedupe/__tests__/manager.test.ts`：

```typescript
// src/core/dedupe/__tests__/manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fs } from 'memfs';
import { DedupeManager } from '../manager.js';
import type { ClipDoc } from '../../types/index.js';
import type { ArchiveDatabase } from '../types.js';

// 模拟文件系统
jest.mock('fs/promises');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

const mockFs = fs as unknown as typeof import('fs');

describe('DedupeManager', () => {
  const testOutputDir = '/test/output';
  const archivePath = '/test/output/.archived.json';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('首次加载时文件不存在应创建空数据库', async () => {
    const { existsSync } = require('fs');
    existsSync.mockReturnValue(false);

    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    const db = manager.getDatabase();
    expect(db.version).toBe(1);
    expect(db.archived).toEqual({});
  });

  it('加载现有数据库', async () => {
    const { existsSync } = require('fs');
    const mockFs = require('fs');
    existsSync.mockReturnValue(true);

    const existingDb: ArchiveDatabase = {
      version: 1,
      archived: {
        'https://x.com/123': {
          firstSeen: '2026-01-19T00:00:00Z',
          lastUpdated: '2026-01-19T00:00:00Z',
          path: './twitter/2026/01/19/abc/',
          platform: 'twitter',
        },
      },
    };

    mockFs.promises = {
      readFile: jest.fn().mockResolvedValue(JSON.stringify(existingDb)),
    };

    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    const db = manager.getDatabase();
    expect(db.archived['https://x.com/123']).toBeDefined();
  });

  it('检查 URL 是否已归档（用 URL 预检查）', async () => {
    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    await manager.addRecordByUrl('https://x.com/123', {
      firstSeen: '2026-01-19T00:00:00Z',
      lastUpdated: '2026-01-19T00:00:00Z',
      path: './twitter/2026/01/19/abc/',
      platform: 'twitter',
    });

    const result = await manager.checkByUrl('https://x.com/123');
    expect(result.isArchived).toBe(true);
    expect(result.record?.path).toBe('./twitter/2026/01/19/abc/');
  });

  it('添加归档记录', async () => {
    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    const doc: ClipDoc = {
      platform: 'twitter',
      sourceUrl: 'https://x.com/123',
      canonicalUrl: 'https://x.com/123',
      title: 'Test',
      fetchedAt: '2026-01-19T00:00:00Z',
      blocks: [],
      assets: { images: [] },
    };

    await manager.addRecord(doc, './twitter/2026/01/19/abc/');

    const result = await manager.checkByDoc(doc);
    expect(result.isArchived).toBe(true);
  });

  it('删除记录', async () => {
    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    await manager.addRecordByUrl('https://x.com/123', {
      firstSeen: '2026-01-19T00:00:00Z',
      lastUpdated: '2026-01-19T00:00:00Z',
      path: './twitter/2026/01/19/abc/',
      platform: 'twitter',
    });

    await manager.removeRecord('https://x.com/123');

    const result = await manager.checkByUrl('https://x.com/123');
    expect(result.isArchived).toBe(false);
  });
});
```

**Step 2: 运行测试确认失败**

Run: `npm test -- manager`
Expected: FAIL - "DedupeManager is not defined"

**Step 3: 实现 DedupeManager**

创建 `src/core/dedupe/manager.ts`：

```typescript
// src/core/dedupe/manager.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import type { ClipDoc } from '../types/index.js';
import type { ArchiveRecord, ArchiveDatabase, DedupeCheckResult } from './types.js';
import { getDedupeKey, getDedupeKeyFromUrl } from './strategy.js';

export class DedupeManager {
  private archivePath: string;
  private database: ArchiveDatabase;
  private loaded: boolean = false;

  constructor(outputDir: string) {
    this.archivePath = path.join(outputDir, '.archived.json');
    this.database = {
      version: 1,
      archived: {},
    };
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    if (!existsSync(this.archivePath)) {
      // 首次运行，创建空数据库
      this.loaded = true;
      return;
    }

    try {
      const content = await fs.readFile(this.archivePath, 'utf-8');
      this.database = JSON.parse(content) as ArchiveDatabase;
      this.loaded = true;
    } catch (error) {
      // 文件损坏，备份并重建
      await this.backupAndRecover();
      this.loaded = true;
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.archivePath), { recursive: true });
    await fs.writeFile(this.archivePath, JSON.stringify(this.database, null, 2));
  }

  getDatabase(): ArchiveDatabase {
    return this.database;
  }

  async checkByUrl(url: string): Promise<DedupeCheckResult> {
    await this.ensureLoaded();

    const key = getDedupeKeyFromUrl(url);
    const record = this.database.archived[key];

    if (!record) {
      return { isArchived: false };
    }

    return { isArchived: true, record };
  }

  async checkByDoc(doc: ClipDoc): Promise<DedupeCheckResult> {
    await this.ensureLoaded();

    const key = getDedupeKey(doc);
    const record = this.database.archived[key];

    if (!record) {
      return { isArchived: false };
    }

    return { isArchived: true, record };
  }

  async addRecord(doc: ClipDoc, outputPath: string): Promise<void> {
    await this.ensureLoaded();

    const key = getDedupeKey(doc);
    const now = new Date().toISOString();

    const record: ArchiveRecord = {
      firstSeen: now,
      lastUpdated: now,
      path: outputPath,
      platform: doc.platform,
    };

    this.database.archived[key] = record;
    await this.save();
  }

  async addRecordByUrl(url: string, record: ArchiveRecord): Promise<void> {
    await this.ensureLoaded();

    const key = getDedupeKeyFromUrl(url);
    this.database.archived[key] = record;
    await this.save();
  }

  async removeRecord(url: string): Promise<void> {
    await this.ensureLoaded();

    const key = getDedupeKeyFromUrl(url);
    delete this.database.archived[key];
    await this.save();
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }
  }

  private async backupAndRecover(): Promise<void> {
    const backupPath = this.archivePath + '.bak';

    try {
      await fs.rename(this.archivePath, backupPath);
    } catch {
      // 忽略备份失败
    }

    this.database = {
      version: 1,
      archived: {},
    };
  }
}
```

**Step 4: 运行测试确认通过**

Run: `npm test -- manager`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/core/dedupe/manager.ts src/core/dedupe/__tests__/manager.test.ts
git commit -m "feat(dedupe): implement DedupeManager core functionality"
```

---

## Task 5: 创建去重模块导出

**Files:**
- Create: `src/core/dedupe/index.ts`

**Step 1: 创建导出文件**

```typescript
// src/core/dedupe/index.ts
export { DedupeManager } from './manager.js';
export { getDedupeKey, getDedupeKeyFromUrl } from './strategy.js';
export type { ArchiveRecord, ArchiveDatabase, DedupeCheckResult } from './types.js';
```

**Step 2: 验证编译**

Run: `npm run build`
Expected: 编译成功

**Step 3: Commit**

```bash
git add src/core/dedupe/index.ts
git commit -m "feat(dedupe): add module exports"
```

---

## Task 6: 扩展 ExportOptions 类型

**Files:**
- Modify: `src/core/export/types.ts:7-14`

**Step 1: 添加新选项**

```typescript
export interface ExportOptions {
  outputDir: string;
  format: ExportFormat;
  downloadAssets: boolean;
  json: boolean;
  cdpEndpoint?: string;
  debug?: boolean;

  // 去重相关
  force?: boolean;      // 强制覆盖已归档内容
  verbose?: boolean;    // 详细输出模式
}
```

**Step 2: 验证编译**

Run: `npm run build`
Expected: 编译成功

**Step 3: 运行测试**

Run: `npm test`
Expected: 所有测试通过

**Step 4: Commit**

```bash
git add src/core/export/types.ts
git commit -m "feat(dedupe): add force and verbose options to ExportOptions"
```

---

## Task 7: 集成到 ClipOrchestrator

**Files:**
- Modify: `src/core/orchestrator.ts:1-83`
- Test: `src/core/orchestrator.test.ts` (如存在)

**Step 1: 更新 import**

在文件顶部添加：

```typescript
import { DedupeManager } from './dedupe/index.js';
```

**Step 2: 修改 archive 方法**

将 `archive` 方法更新为：

```typescript
async archive(url: string, options: ExportOptions): Promise<ExportResult> {
  // Validate URL
  if (!isValidUrl(url)) {
    throw new ClipError(ErrorCode.INVALID_URL, `Invalid URL: ${url}`);
  }

  const normalizedUrl = normalizeUrl(url);

  // 去重检查（非 force 模式）
  if (!options.force) {
    const deduper = new DedupeManager(options.outputDir);
    await deduper.load();

    const preCheck = await deduper.checkByUrl(normalizedUrl);
    if (preCheck.isArchived) {
      // 已归档，返回跳过结果
      return {
        status: 'success',
        platform: preCheck.record!.platform,
        canonicalUrl: normalizedUrl,
        diagnostics: {
          warnings: [`Already archived at ${preCheck.record!.path}`],
        },
      };
    }
  }

  // Launch browser
  const context = await this.browserManager.launch(normalizedUrl);

  try {
    // Render
    const renderer = new PageRenderer(context);
    const page = await renderer.render(normalizedUrl, {
      debug: options.debug ?? false,
    });

    // Extract
    const adapter = registry.select(normalizedUrl);
    const { doc } = await adapter.extract(page);

    // 二级去重检查（使用 canonicalUrl）
    if (!options.force) {
      const deduper = new DedupeManager(options.outputDir);
      await deduper.load();

      const postCheck = await deduper.checkByDoc(doc);
      if (postCheck.isArchived) {
        if (options.verbose) {
          console.log(`Already archived on ${postCheck.record!.firstSeen}`);
          console.log(`Location: ${postCheck.record!.path}`);
        }
        return {
          status: 'success',
          platform: doc.platform,
          canonicalUrl: doc.canonicalUrl || doc.sourceUrl,
          title: doc.title,
          diagnostics: {
            warnings: [`Already archived at ${postCheck.record!.path}`],
          },
        };
      }

      // --force 模式：删除旧记录
      const key = doc.canonicalUrl || normalizedUrl;
      await deduper.removeRecord(key);
    }

    // Export
    const markdownGen = new MarkdownGenerator();
    const assetDownloader = new AssetDownloader(context);

    const { markdownPath, assetsDir } = await generateOutputPaths(
      doc,
      options.outputDir
    );

    // 计算相对路径用于存储
    const relativePath = markdownPath.replace(options.outputDir, '.').replace(/^\/+/, '');

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

    // 添加归档记录
    const deduper = new DedupeManager(options.outputDir);
    await deduper.load();
    await deduper.addRecord(doc, relativePath);

    // Build result
    const stats = {
      wordCount: doc.blocks.length,
      imageCount: doc.assets.images.length,
    };

    return buildExportResult(doc, { markdownPath, assetsDir }, stats, assetFailures);
  } catch (error) {
    if (error instanceof ClipError) {
      return createExportResult(error);
    }

    throw error;
  } finally {
    await this.browserManager.close();
  }
}
```

**Step 3: 验证编译**

Run: `npm run build`
Expected: 编译成功

**Step 4: 运行测试**

Run: `npm test`
Expected: 所有测试通过

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts
git commit -m "feat(dedupe): integrate deduplication into ClipOrchestrator"
```

---

## Task 8: 集成到 BatchRunner

**Files:**
- Modify: `src/core/batch/runner.ts:1-227`

**Step 1: 添加 import**

在文件顶部添加：

```typescript
import { DedupeManager } from '../dedupe/index.js';
```

**Step 2: 修改 run 方法**

更新 `run` 方法以支持去重：

```typescript
export class BatchRunner {
  private deduper?: DedupeManager;

  async run(options: BatchOptions): Promise<BatchSummary> {
    const urls = await this.parseUrls(options.source, options.filePath);

    if (urls.length === 0) {
      return {
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0,  // 新增字段
        duration: 0,
        failures: [],
      };
    }

    const startTime = Date.now();
    const failures: Array<{ url: string; error: string }> = [];
    let successCount = 0;
    let skippedCount = 0;  // 新增

    // 创建共享的 DedupeManager
    this.deduper = new DedupeManager(options.outputDir);
    await this.deduper.load();

    // Create a single browser manager for all URLs
    const browserManager = new BrowserManager(
      undefined,
      options.cdpEndpoint ? { cdpEndpoint: options.cdpEndpoint } : undefined
    );

    try {
      // Launch browser once for all URLs
      const context = await browserManager.launch(urls[0]);

      for (const url of urls) {
        try {
          // 去重预检查
          if (!options.force) {
            const preCheck = await this.deduper!.checkByUrl(url);
            if (preCheck.isArchived) {
              skippedCount++;
              console.log(`⊘ ${url} (already archived)`);
              continue;
            }
          }

          const result = await this.processUrl(url, context, options);
          if (options.jsonl) {
            this.printJsonl(result);
          }
          if (result.status === 'success') {
            successCount++;
            console.log(`✓ ${url}`);
          } else {
            failures.push({
              url,
              error: result.diagnostics?.error?.message ?? 'Unknown error',
            });
            console.log(`✗ ${url} (${result.diagnostics?.error?.code})`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          failures.push({ url, error: errorMsg });
          console.log(`✗ ${url} (${errorMsg})`);

          if (!options.continueOnError) {
            throw error;
          }
        }
      }
    } finally {
      // Close browser after all URLs are processed
      await browserManager.close();
    }

    const duration = Date.now() - startTime;
    const summary: BatchSummary = {
      total: urls.length,
      success: successCount,
      failed: failures.length,
      skipped: skippedCount,  // 新增
      duration,
      failures,
    };

    this.printSummary(summary);
    return summary;
  }

  // ... 其他方法保持不变
}
```

**Step 3: 更新 BatchSummary 接口**

```typescript
export interface BatchSummary {
  total: number;
  success: number;
  failed: number;
  skipped: number;  // 新增
  duration: number;
  failures: Array<{ url: string; error: string }>;
}
```

**Step 4: 更新 printSummary 方法**

```typescript
private printSummary(summary: BatchSummary): void {
  console.log('\n' + '━'.repeat(50));
  console.log(
    `Summary: ${summary.success} success, ${summary.skipped} skipped, ${summary.failed} failed, ${(summary.duration / 1000).toFixed(1)}s`
  );

  if (summary.failures.length > 0) {
    console.log('\nFailed URLs:');
    summary.failures.forEach(({ url, error }) => {
      console.log(`  - ${url}: ${error}`);
    });
  }
}
```

**Step 5: 修改 processUrl 方法**

在 processUrl 方法中添加去重记录：

```typescript
private async processUrl(
  url: string,
  context: any,
  options: BatchOptions
): Promise<ExportResult> {
  // Validate URL
  if (!isValidUrl(url)) {
    throw new ClipError(ErrorCode.INVALID_URL, `Invalid URL: ${url}`);
  }

  const normalizedUrl = normalizeUrl(url);

  try {
    // Render
    const renderer = new PageRenderer(context);
    const page = await renderer.render(normalizedUrl, {
      debug: options.debug ?? false,
    });

    // Extract
    const adapter = registry.select(normalizedUrl);
    const { doc } = await adapter.extract(page);

    // 二级去重检查
    if (!options.force) {
      const postCheck = await this.deduper!.checkByDoc(doc);
      if (postCheck.isArchived) {
        return {
          status: 'success',
          platform: doc.platform,
          canonicalUrl: doc.canonicalUrl || doc.sourceUrl,
          title: doc.title,
          diagnostics: {
            warnings: [`Already archived at ${postCheck.record!.path}`],
          },
        };
      }

      // --force 模式：删除旧记录
      const key = doc.canonicalUrl || normalizedUrl;
      await this.deduper!.removeRecord(key);
    }

    // Export
    const markdownGen = new MarkdownGenerator();
    const assetDownloader = new AssetDownloader(context);

    const { markdownPath, assetsDir } = await generateOutputPaths(
      doc,
      options.outputDir
    );

    // 计算相对路径
    const relativePath = markdownPath.replace(options.outputDir, '.').replace(/^\/+/, '');

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

    // 添加归档记录
    await this.deduper!.addRecord(doc, relativePath);

    // Build result
    const stats = {
      wordCount: doc.blocks.length,
      imageCount: doc.assets.images.length,
    };

    return buildExportResult(doc, { markdownPath, assetsDir }, stats, assetFailures);
  } catch (error) {
    if (error instanceof ClipError) {
      return createExportResult(error);
    }

    throw error;
  }
}
```

**Step 6: 更新 BatchOptions 接口**

```typescript
export interface BatchOptions {
  source: 'file' | 'stdin';
  filePath?: string;
  continueOnError: boolean;
  jsonl: boolean;
  outputDir: string;
  format: 'md' | 'md+html';
  downloadAssets: boolean;
  json?: boolean;
  debug?: boolean;
  cdpEndpoint?: string;
  force?: boolean;  // 新增
}
```

**Step 7: 验证编译**

Run: `npm run build`
Expected: 编译成功

**Step 8: 运行测试**

Run: `npm test`
Expected: 所有测试通过

**Step 9: Commit**

```bash
git add src/core/batch/runner.ts
git commit -m "feat(dedupe): integrate deduplication into BatchRunner"
```

---

## Task 9: 添加 CLI 选项

**Files:**
- Modify: `src/cli/commands/archive.ts:1-95`

**Step 1: 添加新选项**

在 `registerArchiveCommand` 中添加：

```typescript
export function registerArchiveCommand(program: Command): void {
  program
    .argument('[url]', 'URL to archive (optional if using --file or --stdin)')
    .option('--out <dir>', 'Output directory', './clips')
    .option('--format <format>', 'Output format (md|md+html)', 'md' as ExportFormat)
    .option('--json', 'Output JSON to stdout', false)
    .option('--jsonl', 'Output JSONL stream', false)
    .option('--debug', 'Save debug artifacts', false)
    .option('--no-assets', 'Skip asset downloads')
    .option('--continue-on-error', 'Continue on failure (batch mode)')
    .option('--cdp <endpoint>', 'Connect to existing browser via CDP')
    .option('--file <path>', 'Read URLs from file')
    .option('--stdin', 'Read URLs from stdin')
    .option('--force', 'Force overwrite existing archives', false)  // 新增
    .option('--verbose', 'Verbose output', false)  // 新增
    .action(async (url: string | undefined, options) => {
      // ... existing code
    });
}
```

**Step 2: 传递新选项到 orchestrator**

更新 `handleSingleUrl` 函数：

```typescript
async function handleSingleUrl(url: string, options: any): Promise<void> {
  const orchestrator = new ClipOrchestrator(
    options.cdp ? { cdpEndpoint: options.cdp } : undefined
  );

  try {
    console.log(`Archiving: ${url}`);

    const result = await orchestrator.archive(url, {
      outputDir: options.out,
      format: options.format,
      downloadAssets: options.assets,
      json: options.json,
      debug: options.debug,
      force: options.force,      // 新增
      verbose: options.verbose,  // 新增
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    }

    if (result.status === 'success') {
      // 检查是否是跳过的情况
      if (result.diagnostics?.warnings?.some(w => w.includes('Already archived'))) {
        console.log('⊘ Already archived:', result.diagnostics.warnings[0]);
        return;
      }

      console.log('Exported to:', result.paths?.markdownPath);
      console.log('Images:', result.stats?.imageCount);
    } else {
      console.error('Failed:', result.diagnostics?.error?.message);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
```

**Step 3: 传递新选项到 BatchRunner**

更新 `handleBatch` 函数：

```typescript
async function handleBatch(options: any): Promise<void> {
  const runner = new BatchRunner();

  const source = options.file ? 'file' : 'stdin';

  try {
    await runner.run({
      source,
      filePath: options.file,
      continueOnError: options.continueOnError ?? false,
      jsonl: options.jsonl ?? false,
      outputDir: options.out,
      format: options.format,
      downloadAssets: options.assets,
      cdpEndpoint: options.cdp,
      force: options.force ?? false,  // 新增
    });
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
```

**Step 4: 验证编译**

Run: `npm run build`
Expected: 编译成功

**Step 5: 运行测试**

Run: `npm test`
Expected: 所有测试通过

**Step 6: 手动测试**

```bash
# 测试首次归档
node dist/cli/index.js "https://x.com/user/status/123" --out ./test-archive

# 测试重复检测
node dist/cli/index.js "https://x.com/user/status/123" --out ./test-archive

# 测试强制覆盖
node dist/cli/index.js "https://x.com/user/status/123" --out ./test-archive --force

# 测试详细输出
node dist/cli/index.js "https://x.com/user/status/123" --out ./test-archive --verbose
```

**Step 7: Commit**

```bash
git add src/cli/commands/archive.ts
git commit -m "feat(dedupe): add --force and --verbose CLI options"
```

---

## Task 10: 添加 .npmignore

**Files:**
- Create: `.npmignore`

**Step 1: 创建 .npmignore 文件**

```
# 源文件
src/
*.ts
tsconfig.json

# 测试
**/__tests__/
**/*.test.ts
coverage/
jest.config.js

# 开发文件
.eslintrc.js
.prettierrc.js
.editorconfig

# 文档（除 README）
docs/
*.md
!README.md

# CI/CD
.github/
.gitlab-ci.yml

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# 其他
.git/
.gitignore
.env
.env.*
.DS_Store
```

**Step 2: 验证打包内容**

Run: `npm pack --dry-run`
Expected: 列出将包含的文件，不应包含 src/、测试文件等

**Step 3: Commit**

```bash
git add .npmignore
git commit -m "chore: add .npmignore for clean npm packages"
```

---

## Task 11: 更新待办文档

**Files:**
- Modify: `docs/pending-tasks.md:24-68`

**Step 1: 更新待办任务**

将 P0 任务标记为完成：

```markdown
## 最近已完成 (2026-01-19)

1. **资产下载实现** - 两层 fallback、3 次重试、失败追踪
2. **批量处理系统** - BatchRunner、CLI 统一重构、JSONL 输出
3. **微信公众号适配器** - 完整解析实现
4. **Twitter 长推文修复** - 多种 DOM 提取方法
5. **页面等待策略优化** - waitUntil: 'load' + 3s 延迟
6. **CDP 浏览器连接** - `--cdp` 选项支持
7. **去重逻辑实现** - DedupeManager、两级检查、--force 选项 ✅

---

## 未完成任务 / Pending Tasks

## P1 高优先级

### 1. 图片位置修复 / Image Position Fix
...
```

**Step 2: 更新项目完成度**

```markdown
## 项目完成度评估

| 模块 | 完成度 | 状态 |
|------|--------|------|
| CLI 层 | 80% | archive ✅ / install-browsers ✅ / queue ❌ / 去重 ✅ |
| 编排层 | 100% | ✅ ClipOrchestrator 完整实现 |
| 渲染层 | 95% | ✅ Playwright / ⚠️ 仅支持 Edge |
| 提取层 | 96% | Twitter ✅ / Zhihu 90% / WeChat ✅ |
| 导出层 | 100% | ✅ Markdown / JSON / 资源下载 |
| 批处理 | 100% | ✅ BatchRunner 完整实现 |
| 去重系统 | 100% | ✅ DedupeManager 完整实现 |

**整体完成度: ~95%**
**测试覆盖: 130/133 通过**
```

**Step 3: Commit**

```bash
git add docs/pending-tasks.md
git commit -m "docs: mark deduplication feature as completed"
```

---

## Task 12: 运行完整测试套件

**Step 1: 运行所有测试**

Run: `npm test`
Expected: 所有测试通过

**Step 2: 构建项目**

Run: `npm run build`
Expected: 编译成功，生成 dist/ 目录

**Step 3: 打包测试**

Run: `npm pack --dry-run`
Expected: 包含正确的文件，不包含源码和测试文件

---

## 完成检查清单

- [ ] 所有 12 个任务完成
- [ ] 所有测试通过
- [ ] 项目成功构建
- [ ] .npmignore 配置正确
- [ ] 待办文档已更新
- [ ] 代码已提交到 git

---

## 后续步骤

完成此计划后，优先处理：
1. **P1 图片位置修复** - 修复 Twitter 图片位置
2. **P1 浏览器策略重构** - 支持多浏览器
3. **P2 npm 发布准备** - 准备发布到 npm
