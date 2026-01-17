# Clip Client M1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local content archiver CLI that fetches Twitter/X URLs and exports them as Markdown files with downloaded assets.

**Architecture:** Four-layer architecture (CLI → Render → Extract → Export) using Playwright for browser automation, with TypeScript/Node.js. Render layer fetches rendered HTML, Extract layer parses content into structured blocks, Export layer generates Markdown and downloads assets.

**Tech Stack:** TypeScript, Node.js, Playwright, Commander.js (CLI), Jest (testing)

---

## Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `README.md`
- Create: `src/cli/index.ts` (entry point)

**Step 1: Initialize package.json**

```json
{
  "name": "clip-client",
  "version": "0.1.0",
  "description": "Local content archiver for Twitter, Zhihu, and WeChat Official Accounts",
  "main": "dist/index.js",
  "bin": {
    "clip": "./dist/cli/index.js"
  },
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "jest",
    "clip": "node dist/cli/index.js"
  },
  "keywords": ["cli", "archiver", "twitter", "zhihu", "wechat"],
  "author": "nemo",
  "license": "MIT",
  "dependencies": {
    "playwright": "^1.48.0",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.1.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
clips/
*.log
.DS_Store
.env
```

**Step 4: Create basic README.md**

```markdown
# Clip Client

Local content archiver for Twitter, Zhihu, and WeChat Official Accounts.

## Installation

```bash
npm install -g clip-client
```

## Quick Start

```bash
# Install browsers (optional, uses system Chrome by default)
clip install-browsers

# Archive a single URL
clip once "https://x.com/user/status/123"
```

## Output

```
clips/
└── twitter/
    └── 2026/
        └── 0117/
            └── abc123/
                ├── content.md
                └── assets/
                    ├── 001.jpg
                    └── 002.png
```
```

**Step 5: Create CLI entry point stub**

```typescript
// src/cli/index.ts
#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('clip')
  .description('Local content archiver')
  .version('0.1.0');

program
  .command('install-browsers')
  .description('Install Playwright browsers (optional)')
  .action(() => {
    console.log('Browsers install command - to be implemented');
  });

program
  .command('once <url>')
  .description('Archive a single URL')
  .action((url: string) => {
    console.log(`Archiving: ${url}`);
  });

program.parse();
```

**Step 6: Install dependencies**

```bash
npm install
```

**Step 7: Build and test basic CLI**

```bash
npm run build
node dist/cli/index.js --help
node dist/cli/index.js once "https://x.com/test"
```

Expected: CLI shows help and recognizes the `once` command

**Step 8: Commit**

```bash
git add package.json tsconfig.json .gitignore README.md src/
git commit -m "feat: initialize project structure and CLI stub"
```

---

## Task 2: Core Type Definitions

**Files:**
- Create: `src/core/types/index.ts`
- Create: `src/core/render/types.ts`
- Create: `src/core/extract/types.ts`
- Create: `src/core/export/types.ts`
- Create: `src/core/errors.ts`

**Step 1: Create core index types**

```typescript
// src/core/types/index.ts
export type Platform = 'twitter' | 'zhihu' | 'wechat' | 'unknown';

export interface ClipDoc {
  platform: Platform;
  sourceUrl: string;
  canonicalUrl?: string;
  title: string;
  author?: string;
  publishedAt?: string;
  fetchedAt: string;
  blocks: Block[];
  assets: {
    images: AssetImage[];
  };
}

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | CodeBlock
  | ListBlock
  | ImageBlock
  | LinkBlock
  | VideoBlock;

export interface ParagraphBlock {
  type: 'paragraph';
  content: string;
}

export interface HeadingBlock {
  type: 'heading';
  level: number;
  content: string;
}

export interface QuoteBlock {
  type: 'quote';
  content: string;
  author?: string;
  sourceUrl?: string;
}

export interface CodeBlock {
  type: 'code';
  content: string;
  language?: string;
}

export interface ListBlock {
  type: 'list';
  items: string[];
  ordered: boolean;
}

export interface ImageBlock {
  type: 'image';
  url: string;
  alt: string;
}

export interface LinkBlock {
  type: 'link';
  url: string;
  title: string;
}

export interface VideoBlock {
  type: 'video';
  url: string;
  thumbnail?: string;
}

export interface AssetImage {
  url: string;
  alt: string;
  filenameHint?: string;
}
```

**Step 2: Create render types**

```typescript
// src/core/render/types.ts
import type { Platform } from '../types/index.js';

export interface RenderedPage {
  url: string;
  canonicalUrl?: string;
  title?: string;
  html: string;
  platform: Platform;
  screenshotPath?: string;
  debugHtmlPath?: string;
}

export interface RenderOptions {
  timeout?: number;
  waitForSelector?: string;
  debug?: boolean;
  maxScrolls?: number;
}
```

**Step 3: Create extract types**

```typescript
// src/core/extract/types.ts
import type { ClipDoc } from '../types/index.js';
import type { RenderedPage } from '../../render/types.js';

export interface ExtractResult {
  doc: ClipDoc;
  warnings: string[];
}

export interface Adapter {
  readonly platform: string;
  readonly domains: string[];

  canHandle(url: string): boolean;
  extract(page: RenderedPage): Promise<ExtractResult>;
}

export interface AdapterContext {
  debug?: boolean;
  maxThreadDepth?: number;
}
```

**Step 4: Create export types**

```typescript
// src/core/export/types.ts
import type { ClipDoc } from '../types/index.js';

export type ExportFormat = 'md' | 'md+html';

export interface ExportOptions {
  outputDir: string;
  format: ExportFormat;
  downloadAssets: boolean;
  json: boolean;
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

**Step 5: Create error classes**

```typescript
// src/core/errors.ts
import { ErrorCode } from './export/types.js';

export class ClipError extends Error {
  code: ErrorCode;
  retryable: boolean;
  suggestion?: string;
  context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    retryable: boolean = false,
    suggestion?: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ClipError';
    this.code = code;
    this.retryable = retryable;
    this.suggestion = suggestion;
    this.context = context;
  }
}

export function createExportResult(error: ClipError): Omit<import('./export/types.js').ExportResult, 'status'> & { status: 'failed' } {
  return {
    status: 'failed',
    platform: 'unknown',
    diagnostics: {
      warnings: [],
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        suggestion: error.suggestion,
      },
    },
  };
}
```

**Step 6: Create index file for core types**

```typescript
// src/core/types.ts
export * from './types/index.js';
export * from './render/types.js';
export * from './extract/types.js';
export * from './export/types.js';
export * from './errors.js';
```

**Step 7: Verify types compile**

```bash
npm run build
```

Expected: No type errors

**Step 8: Commit**

```bash
git add src/core/
git commit -m "feat: define core types and error system"
```

---

## Task 3: Render Layer - Browser Management

**Files:**
- Create: `src/core/render/browser.ts`
- Create: `src/core/config/constants.ts`

**Step 1: Create constants**

```typescript
// src/core/config/constants.ts
export const DEFAULT_TIMEOUT = 30000; // 30 seconds
export const DEFAULT_MAX_SCROLLS = 50;
export const RETRY_COUNTS: Record<string, number> = {
  network_error: 0,
  timeout: 0,
  rate_limited: 0,
  asset_download_failed: 0,
};

export const BROWSER_CHANNELS = ['chrome', 'msedge', 'chromium'] as const;
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
```

**Step 2: Create browser manager**

```typescript
// src/core/render/browser.ts
import { chromium, type Browser, type BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class BrowserManager {
  private browser?: Browser;
  private context?: BrowserContext;
  private sessionDir: string;

  constructor(sessionDir: string = path.join(process.cwd(), '.clip', 'session')) {
    this.sessionDir = sessionDir;
  }

  async launch(): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    // Try system browsers first, fallback to Playwright browser
    const channels = ['chrome', 'msedge', 'chromium'];

    for (const channel of channels) {
      try {
        this.browser = await chromium.launch({
          channel,
          headless: true,
        });
        break;
      } catch (e) {
        // Channel not available, try next
        continue;
      }
    }

    // If all channels failed, use Playwright's bundled browser
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
      });
    }

    // Ensure session directory exists
    await fs.mkdir(this.sessionDir, { recursive: true });

    // Create persistent context for session reuse
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    return this.context;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = undefined;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }

  getContext(): BrowserContext | undefined {
    return this.context;
  }
}
```

**Step 3: Commit**

```bash
git add src/core/render/browser.ts src/core/config/
git commit -m "feat: add browser manager with system browser fallback"
```

---

## Task 4: Render Layer - Page Renderer

**Files:**
- Create: `src/core/render/page.ts`
- Create: `src/core/render/utils.ts`

**Step 1: Create platform detection utils**

```typescript
// src/core/render/utils.ts
import type { Platform } from '../types/index.js';

export function detectPlatform(url: URL): Platform {
  const hostname = url.hostname.toLowerCase();

  if (hostname.includes('x.com') || hostname.includes('twitter.com')) {
    return 'twitter';
  }
  if (hostname.includes('zhihu.com')) {
    return 'zhihu';
  }
  if (hostname.includes('mp.weixin.qq.com')) {
    return 'wechat';
  }

  return 'unknown';
}

export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeUrl(urlString: string): string {
  const url = new URL(urlString);
  url.hash = '';
  return url.toString();
}
```

**Step 2: Create page renderer**

```typescript
// src/core/render/page.ts
import type { BrowserContext } from 'playwright';
import type { RenderedPage, RenderOptions } from './types.js';
import type { ClipError } from '../errors.js';
import { detectPlatform } from './utils.js';
import { DEFAULT_TIMEOUT, DEFAULT_MAX_SCROLLS } from '../config/constants.js';

export class PageRenderer {
  constructor(private context: BrowserContext) {}

  async render(url: string, options: RenderOptions = {}): Promise<RenderedPage> {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const maxScrolls = options.maxScrolls ?? DEFAULT_MAX_SCROLLS;

    const page = await this.context.newPage();

    try {
      // Navigate to URL
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout,
      });

      // Wait for main content
      const contentSelector = options.waitForSelector || 'article, main, [role="main"]';
      await page.waitForSelector(contentSelector, { timeout: 5000 }).catch(() => {
        // Continue even if selector not found
      });

      // Platform-specific handling
      const platform = detectPlatform(new URL(url));

      if (platform === 'twitter') {
        await this.handleTwitter(page, maxScrolls);
      }

      // Extract page info
      const title = await page.title();
      const canonicalUrl = await this.extractCanonicalUrl(page);
      const html = await page.content();
      const urlObj = new URL(url);

      // Debug outputs
      let screenshotPath: string | undefined;
      let debugHtmlPath: string | undefined;

      if (options.debug) {
        // Save debug info (implementation later)
      }

      return {
        url,
        canonicalUrl,
        title,
        html,
        platform,
        screenshotPath,
        debugHtmlPath,
      };
    } finally {
      await page.close();
    }
  }

  private async handleTwitter(page: any, maxScrolls: number): Promise<void> {
    // For Twitter/X, scroll to load thread content
    let scrollCount = 0;
    let previousHeight = 0;

    while (scrollCount < maxScrolls) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });

      await page.waitForTimeout(1000);

      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight) {
        break; // No more content loading
      }
      previousHeight = currentHeight;
      scrollCount++;
    }

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  private async extractCanonicalUrl(page: any): Promise<string | undefined> {
    try {
      return await page.$eval('link[rel="canonical"]', (el: any) => el.href);
    } catch {
      return undefined;
    }
  }
}
```

**Step 3: Create render index**

```typescript
// src/core/render/index.ts
export * from './types.js';
export * from './browser.js';
export * from './page.js';
export * from './utils.js';
```

**Step 4: Commit**

```bash
git add src/core/render/
git commit -m "feat: implement page renderer with Twitter scroll handling"
```

---

## Task 5: Extract Layer - Base Adapter

**Files:**
- Create: `src/core/extract/adapters/base.ts`
- Create: `src/core/extract/adapters/twitter.ts`
- Create: `src/core/extract/registry.ts`
- Create: `src/core/extract/index.ts`

**Step 1: Create base adapter**

```typescript
// src/core/extract/adapters/base.ts
import type { Adapter, ExtractResult } from '../types.js';
import type { RenderedPage } from '../../render/types.js';

export abstract class BaseAdapter implements Adapter {
  abstract readonly platform: string;
  abstract readonly domains: string[];

  canHandle(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return this.domains.some(domain => urlObj.hostname.includes(domain));
    } catch {
      return false;
    }
  }

  abstract extract(page: RenderedPage): Promise<ExtractResult>;

  protected cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
```

**Step 2: Create Twitter adapter (basic)**

```typescript
// src/core/extract/adapters/twitter.ts
import { BaseAdapter } from './base.js';
import type { ExtractResult } from '../types.js';
import type { RenderedPage } from '../../render/types.js';
import type { ClipDoc, Block } from '../../types/index.js';

export class TwitterAdapter extends BaseAdapter {
  readonly platform = 'twitter';
  readonly domains = ['x.com', 'twitter.com'];

  async extract(page: RenderedPage): Promise<ExtractResult> {
    const warnings: string[] = [];

    // Parse HTML to extract content
    // For now, create a basic structure
    const doc: ClipDoc = {
      platform: 'twitter',
      sourceUrl: page.url,
      canonicalUrl: page.canonicalUrl,
      title: page.title || 'Twitter Thread',
      author: this.extractAuthor(page.html),
      publishedAt: this.extractPublishDate(page.html),
      fetchedAt: new Date().toISOString(),
      blocks: await this.extractBlocks(page.html),
      assets: {
        images: this.extractImages(page.html),
      },
    };

    return { doc, warnings };
  }

  private extractAuthor(html: string): string | undefined {
    // Basic extraction - will be enhanced
    const authorMatch = html.match(/"screen_name":"([^"]+)"/);
    return authorMatch ? `@${authorMatch[1]}` : undefined;
  }

  private extractPublishDate(html: string): string | undefined {
    // Basic extraction - will be enhanced
    return undefined;
  }

  private async extractBlocks(html: string): Promise<Block[]> {
    const blocks: Block[] = [];

    // This is a stub - full implementation will parse the actual HTML
    blocks.push({
      type: 'paragraph',
      content: 'Content extraction to be implemented',
    });

    return blocks;
  }

  private extractImages(html: string): Array<{ url: string; alt: string }> {
    // Stub for image extraction
    return [];
  }
}
```

**Step 3: Create adapter registry**

```typescript
// src/core/extract/registry.ts
import type { Adapter } from './types.js';
import { TwitterAdapter } from './adapters/twitter.js';

export class AdapterRegistry {
  private adapters: Adapter[] = [
    new TwitterAdapter(),
    // More adapters will be added here
  ];

  select(url: string): Adapter {
    const adapter = this.adapters.find(a => a.canHandle(url));

    if (!adapter) {
      throw new Error(`No adapter found for URL: ${url}`);
    }

    return adapter;
  }

  register(adapter: Adapter): void {
    this.adapters.push(adapter);
  }
}

// Singleton instance
export const registry = new AdapterRegistry();
```

**Step 4: Create extract index**

```typescript
// src/core/extract/index.ts
export * from './types.js';
export * from './registry.js';
export * from './adapters/base.js';
export * from './adapters/twitter.js';
```

**Step 5: Commit**

```bash
git add src/core/extract/
git commit -m "feat: implement base adapter and Twitter adapter stub"
```

---

## Task 6: Export Layer - Markdown Generator

**Files:**
- Create: `src/core/export/markdown.ts`
- Create: `src/core/export/assets.ts`
- Create: `src/core/export/path.ts`

**Step 1: Create path utilities**

```typescript
// src/core/export/path.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import type { ClipDoc, Platform } from '../types/index.js';

export async function generateOutputPaths(
  doc: ClipDoc,
  outputDir: string
): Promise<{ markdownPath: string; assetsDir: string }> {
  const date = new Date(doc.fetchedAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  // Generate slug from title
  const slug = generateSlug(doc.title);

  const platformDir = path.join(outputDir, doc.platform);
  const dateDir = path.join(platformDir, String(year), month + day);
  const contentDir = path.join(dateDir, slug);
  const assetsDir = path.join(contentDir, 'assets');
  const markdownPath = path.join(contentDir, 'content.md');

  // Create directories
  await fs.mkdir(assetsDir, { recursive: true });

  return { markdownPath, assetsDir };
}

function generateSlug(title: string): string {
  // Remove invalid characters and generate short hash
  const cleaned = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  // Add short hash for uniqueness
  const hash = Buffer.from(title).toString('base64').substring(0, 8);
  return `${cleaned}-${hash}`;
}

export function buildFrontMatter(doc: ClipDoc): string {
  const frontMatter: Record<string, unknown> = {
    title: doc.title,
    source_url: doc.sourceUrl,
    canonical_url: doc.canonicalUrl,
    platform: doc.platform,
    fetched_at: doc.fetchedAt,
    tags: [],
  };

  if (doc.author) {
    frontMatter.author = doc.author;
  }
  if (doc.publishedAt) {
    frontMatter.published_at = doc.publishedAt;
  }

  const yaml = Object.entries(frontMatter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: []`;
      }
      if (typeof value === 'string') {
        return `${key}: "${value}"`;
      }
      return `${key}: ${value}`;
    })
    .join('\n');

  return `---\n${yaml}\n---\n\n`;
}
```

**Step 2: Create markdown generator**

```typescript
// src/core/export/markdown.ts
import * as fs from 'fs/promises';
import type { ClipDoc, Block } from '../types/index.js';
import { buildFrontMatter, generateOutputPaths } from './path.js';

export class MarkdownGenerator {
  async generate(
    doc: ClipDoc,
    outputDir: string,
    assetMapping: Map<string, string> = new Map()
  ): Promise<string> {
    const { markdownPath } = await generateOutputPaths(doc, outputDir);

    let content = buildFrontMatter(doc);
    content += this.blocksToMarkdown(doc.blocks, assetMapping);

    await fs.writeFile(markdownPath, content, 'utf-8');

    return markdownPath;
  }

  private blocksToMarkdown(blocks: Block[], assetMapping: Map<string, string>): string {
    return blocks.map(block => this.blockToMarkdown(block, assetMapping)).join('\n\n');
  }

  private blockToMarkdown(block: Block, assetMapping: Map<string, string>): string {
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
        const filename = assetMapping.get(block.url) || block.url;
        return `![${block.alt}](${filename})`;

      case 'link':
        return `[${block.title}](${block.url})`;

      case 'video':
        if (block.thumbnail) {
          const thumb = assetMapping.get(block.thumbnail) || block.thumbnail;
          return `[视频: 已截图](${thumb})\n\n[视频链接](${block.url})`;
        }
        return `[视频链接](${block.url})`;

      default:
        return '';
    }
  }
}
```

**Step 3: Create asset downloader (stub for now)**

```typescript
// src/core/export/assets.ts
import type { BrowserContext } from 'playwright';
import type { AssetImage } from '../types/index.js';

export class AssetDownloader {
  constructor(private context: BrowserContext) {}

  async downloadImages(
    images: AssetImage[],
    assetsDir: string
  ): Promise<Map<string, string>> {
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

  private getExtension(url: string): string {
    const match = url.match(/\.([a-z]{3,4})(?:\?|$)/i);
    return match ? match[1] : 'jpg';
  }
}
```

**Step 4: Create JSON exporter**

```typescript
// src/core/export/json.ts'
import type { ExportResult, ExportPaths, ExportStats } from './types.js';
import type { ClipDoc } from '../types/index.js';

export function buildExportResult(
  doc: ClipDoc,
  paths: ExportPaths,
  stats: ExportStats
): ExportResult {
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
    diagnostics: {
      warnings: [],
    },
  };
}

export function formatJsonOutput(result: ExportResult): string {
  return JSON.stringify(result, null, 2);
}
```

**Step 5: Create export index**

```typescript
// src/core/export/index.ts
export * from './types.js';
export * from './markdown.js';
export * from './assets.js';
export * from './json.js';
export * from './path.js';
```

**Step 6: Commit**

```bash
git add src/core/export/
git commit -m "feat: implement markdown generator and path utilities"
```

---

## Task 7: CLI - Once Command Implementation

**Files:**
- Modify: `src/cli/index.ts`
- Create: `src/cli/commands/once.ts`
- Create: `src/core/orchestrator.ts`

**Step 1: Create orchestrator**

```typescript
// src/core/orchestrator.ts
import { BrowserManager } from './render/browser.js';
import { PageRenderer } from './render/page.js';
import { registry } from './extract/registry.js';
import { MarkdownGenerator } from './export/markdown.js';
import { AssetDownloader } from './export/assets.js';
import { buildExportResult, formatJsonOutput } from './export/json.js';
import { isValidUrl, normalizeUrl } from './render/utils.js';
import { ClipError, ErrorCode } from './errors.js';
import type { ExportOptions, ExportResult } from './export/types.js';

export class ClipOrchestrator {
  private browserManager: BrowserManager;

  constructor() {
    this.browserManager = new BrowserManager();
  }

  async archive(url: string, options: ExportOptions): Promise<ExportResult> {
    // Validate URL
    if (!isValidUrl(url)) {
      throw new ClipError(ErrorCode.INVALID_URL, `Invalid URL: ${url}`);
    }

    const normalizedUrl = normalizeUrl(url);

    // Launch browser
    const context = await this.browserManager.launch();

    try {
      // Render
      const renderer = new PageRenderer(context);
      const page = await renderer.render(normalizedUrl, {
        debug: false,
      });

      // Extract
      const adapter = registry.select(normalizedUrl);
      const { doc } = await adapter.extract(page);

      // Export
      const markdownGen = new MarkdownGenerator();
      const assetDownloader = new AssetDownloader(context);

      const { markdownPath, assetsDir } = await markdown['generateOutputPaths'](
        doc,
        options.outputDir
      );

      // Download assets
      const assetMapping = await assetDownloader.downloadImages(
        doc.assets.images,
        assetsDir
      );

      // Generate markdown
      await markdownGen.generate(doc, options.outputDir, assetMapping);

      // Build result
      const stats = {
        wordCount: this.countWords(doc.blocks),
        imageCount: doc.assets.images.length,
      };

      return buildExportResult(doc, { markdownPath, assetsDir }, stats);
    } catch (error) {
      if (error instanceof ClipError) {
        return {
          status: 'failed',
          platform: 'unknown',
          diagnostics: {
            warnings: [],
            error: {
              code: error.code,
              message: error.message,
              retryable: error.retryable,
              suggestion: error.suggestion,
            },
          },
        };
      }

      throw error;
    } finally {
      await this.browserManager.close();
    }
  }

  private countWords(blocks: unknown[]): number {
    // Simple word count - can be enhanced
    return blocks.length;
  }
}
```

**Step 2: Create once command**

```typescript
// src/cli/commands/once.ts
import { Command } from 'commander';
import { ClipOrchestrator } from '../../core/orchestrator.js';
import type { ExportFormat } from '../../core/export/types.js';

export function registerOnceCommand(program: Command): void {
  program
    .command('once <url>')
    .description('Archive a single URL')
    .option('--out <dir>', 'Output directory', './clips')
    .option('--format <format>', 'Output format (md|md+html)', 'md' as ExportFormat)
    .option('--json', 'Output JSON to stdout', false)
    .option('--debug', 'Save debug artifacts', false)
    .option('--no-assets', 'Skip asset downloads', false)
    .action(async (url: string, options) => {
      const orchestrator = new ClipOrchestrator();

      try {
        console.log(`Archiving: ${url}`);

        const result = await orchestrator.archive(url, {
          outputDir: options.out,
          format: options.format,
          downloadAssets: options.assets,
          json: options.json,
        });

        if (result.status === 'success') {
          console.log('✓ Exported to:', result.paths?.markdownPath);
          console.log('✓ Images:', result.stats?.imageCount);
        } else {
          console.error('✗ Failed:', result.diagnostics?.error?.message);
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
```

**Step 3: Update CLI index**

```typescript
// src/cli/index.ts
#!/usr/bin/env node

import { Command } from 'commander';
import { registerOnceCommand } from './commands/once.js';

const program = new Command();

program
  .name('clip')
  .description('Local content archiver')
  .version('0.1.0');

registerOnceCommand(program);

program.parse();
```

**Step 4: Fix orchestrator imports**

```typescript
// src/core/orchestrator.ts (fixed imports)
import { BrowserManager } from './render/browser.js';
import { PageRenderer } from './render/page.js';
import { registry } from './extract/registry.js';
import { MarkdownGenerator } from './export/markdown.js';
import { AssetDownloader } from './export/assets.js';
import { buildExportResult } from './export/json.js';
import { isValidUrl, normalizeUrl } from './render/utils.js';
import { ClipError, ErrorCode } from './errors.js';
import type { ExportOptions, ExportResult } from './export/types.js';
import { generateOutputPaths } from './export/path.js';

export class ClipOrchestrator {
  private browserManager: BrowserManager;

  constructor() {
    this.browserManager = new BrowserManager();
  }

  async archive(url: string, options: ExportOptions): Promise<ExportResult> {
    // Validate URL
    if (!isValidUrl(url)) {
      throw new ClipError(ErrorCode.INVALID_URL, `Invalid URL: ${url}`);
    }

    const normalizedUrl = normalizeUrl(url);

    // Launch browser
    const context = await this.browserManager.launch();

    try {
      // Render
      const renderer = new PageRenderer(context);
      const page = await renderer.render(normalizedUrl, {
        debug: false,
      });

      // Extract
      const adapter = registry.select(normalizedUrl);
      const { doc } = await adapter.extract(page);

      // Export
      const markdownGen = new MarkdownGenerator();
      const assetDownloader = new AssetDownloader(context);

      const { markdownPath, assetsDir } = await generateOutputPaths(
        doc,
        options.outputDir
      );

      // Download assets
      const assetMapping = await assetDownloader.downloadImages(
        doc.assets.images,
        assetsDir
      );

      // Generate markdown
      await markdownGen.generate(doc, options.outputDir, assetMapping);

      // Build result
      const stats = {
        wordCount: doc.blocks.length,
        imageCount: doc.assets.images.length,
      };

      return buildExportResult(doc, { markdownPath, assetsDir }, stats);
    } catch (error) {
      if (error instanceof ClipError) {
        return {
          status: 'failed',
          platform: 'unknown',
          diagnostics: {
            warnings: [],
            error: {
              code: error.code,
              message: error.message,
              retryable: error.retryable,
              suggestion: error.suggestion,
            },
          },
        };
      }

      throw error;
    } finally {
      await this.browserManager.close();
    }
  }
}
```

**Step 5: Build and test**

```bash
npm run build
node dist/cli/index.js once --help
node dist/cli/index.js once "https://x.com/example"
```

**Step 6: Commit**

```bash
git add src/cli/ src/core/orchestrator.ts
git commit -m "feat: implement once command with orchestrator"
```

---

## Task 8: Add install-browsers Command

**Files:**
- Modify: `src/cli/index.ts`
- Create: `src/cli/commands/install-browsers.ts`

**Step 1: Create install-browsers command**

```typescript
// src/cli/commands/install-browsers.ts
import { Command } from 'commander';
import { execSync } from 'child_process';

export function registerInstallBrowsersCommand(program: Command): void {
  program
    .command('install-browsers')
    .description('Install Playwright browsers (optional fallback)')
    .action(async () => {
      console.log('Installing Playwright browsers...');

      try {
        execSync('npx playwright install chromium', {
          stdio: 'inherit',
        });
        console.log('✓ Browsers installed successfully');
      } catch (error) {
        console.error('✗ Failed to install browsers');
        console.error('Note: This is optional. The tool will use your system Chrome by default.');
        process.exit(1);
      }
    });
}
```

**Step 2: Update CLI index**

```typescript
// src/cli/index.ts
#!/usr/bin/env node

import { Command } from 'commander';
import { registerOnceCommand } from './commands/once.js';
import { registerInstallBrowsersCommand } from './commands/install-browsers.js';

const program = new Command();

program
  .name('clip')
  .description('Local content archiver')
  .version('0.1.0');

registerInstallBrowsersCommand(program);
registerOnceCommand(program);

program.parse();
```

**Step 3: Commit**

```bash
git add src/cli/commands/install-browsers.ts src/cli/index.ts
git commit -m "feat: add install-browsers command"
```

---

## Task 9: Final Testing and Documentation

**Files:**
- Update: `README.md`
- Create: `CLIPS.md` (usage examples)

**Step 1: Update README with current capabilities**

```markdown
# Clip Client

Local content archiver for Twitter, Zhihu, and WeChat Official Accounts.

## Installation

```bash
npm install -g clip-client
```

## Quick Start

```bash
# Archive a single URL
clip once "https://x.com/user/status/123"

# Specify output directory
clip once "https://x.com/user/status/123" --out ~/my-clips

# Output JSON
clip once "https://x.com/user/status/123" --json
```

## Output Structure

```
clips/
└── twitter/
    └── 2026/
        └── 0117/
            └── slug-hash/
                ├── content.md
                └── assets/
                    ├── 001.jpg
                    └── 002.png
```

## Current Status

**M1 - Twitter Basic (In Progress)**
- ✓ Project structure
- ✓ Core type definitions
- ✓ Render layer with Playwright
- ✓ Extract layer (stub)
- ✓ Export layer (Markdown generation)
- ⚳ Twitter adapter (needs full implementation)
- ⚳ Asset downloading (needs implementation)

## TODO

- [ ] Complete Twitter adapter HTML parsing
- [ ] Implement actual image downloading
- [ ] Add thread expansion logic
- [ ] Add quote tweet handling
- [ ] Add error handling and retry logic
```

**Step 2: Test end-to-end with a real Twitter URL**

```bash
npm run build
node dist/cli/index.js once "https://x.com/elonmusk/status/123456" --debug
```

**Step 3: Verify output structure**

```bash
ls -R clips/
```

Expected: Directory structure created with content.md

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README with current status"
```

---

## Summary

This plan establishes:

1. **Project foundation** - TypeScript, Playwright, CLI structure
2. **Four-layer architecture** - Render → Extract → Export → CLI
3. **Twitter support stub** - Basic structure ready for content parsing implementation
4. **Markdown export** - With front matter and asset references

**Next Steps (Beyond M1):**
- Implement actual Twitter HTML parsing
- Complete asset downloading with Playwright
- Add thread expansion and quote handling
- Implement queue system for batch processing
- Add Zhihu and WeChat adapters
