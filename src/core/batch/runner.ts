// src/core/batch/runner.ts
import { readFile } from 'node:fs/promises';
import { BrowserManager } from '../render/browser.js';
import { PageRenderer } from '../render/page.js';
import { registry } from '../extract/registry.js';
import { MarkdownGenerator } from '../export/markdown.js';
import { AssetDownloader } from '../export/assets.js';
import { buildExportResult } from '../export/json.js';
import { ClipError } from '../errors.js';
import { ErrorCode } from '../export/types.js';
import type { ExportOptions, ExportResult } from '../export/types.js';
import type { DownloadResult, DownloadError } from '../export/assets.js';
import { generateOutputPaths } from '../export/path.js';
import { isValidUrl, normalizeUrl } from '../render/utils.js';
import { createExportResult } from '../errors.js';

// Helper function to read from stdin (extracted for testability)
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

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
}

export interface BatchSummary {
  total: number;
  success: number;
  failed: number;
  duration: number;
  failures: Array<{ url: string; error: string }>;
}

export class BatchRunner {
  async run(options: BatchOptions): Promise<BatchSummary> {
    const urls = await this.parseUrls(options.source, options.filePath);

    if (urls.length === 0) {
      return {
        total: 0,
        success: 0,
        failed: 0,
        duration: 0,
        failures: [],
      };
    }

    const startTime = Date.now();
    const failures: Array<{ url: string; error: string }> = [];
    let successCount = 0;

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
      duration,
      failures,
    };

    this.printSummary(summary);
    return summary;
  }

  async parseUrls(
    source: 'file' | 'stdin',
    filePath?: string
  ): Promise<string[]> {
    let content: string;

    if (source === 'file') {
      if (!filePath) {
        throw new ClipError(
          ErrorCode.INVALID_URL,
          'File path is required when source is "file"'
        );
      }
      content = await readFile(filePath, 'utf-8');
    } else {
      // Note: stdin reading is tested via integration tests rather than unit tests
      // due to the complexity of mocking process.stdin in Jest with ESM mode.
      // The readStdin() function implementation is straightforward and will be
      // verified through manual and integration testing.
      content = await readStdin();
    }

    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
  }

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

      // Export
      const markdownGen = new MarkdownGenerator();
      const assetDownloader = new AssetDownloader(context);

      const { markdownPath, assetsDir } = await generateOutputPaths(
        doc,
        options.outputDir
      );

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

  private printJsonl(result: ExportResult): void {
    console.log(JSON.stringify(result));
  }

  private printSummary(summary: BatchSummary): void {
    console.log('\n' + '━'.repeat(50));
    console.log(
      `Summary: ${summary.success} success, ${summary.failed} failed, ${(summary.duration / 1000).toFixed(1)}s`
    );

    if (summary.failures.length > 0) {
      console.log('\nFailed URLs:');
      summary.failures.forEach(({ url, error }) => {
        console.log(`  - ${url}: ${error}`);
      });
    }
  }
}
