// src/core/orchestrator.ts
import { BrowserManager, type BrowserOptions } from './render/browser.js';
import { PageRenderer } from './render/page.js';
import { registry } from './extract/registry.js';
import { MarkdownGenerator } from './export/markdown.js';
import { AssetDownloader } from './export/assets.js';
import { buildExportResult } from './export/json.js';
import { isValidUrl, normalizeUrl } from './render/utils.js';
import { ClipError, ErrorCode, createExportResult } from './errors.js';
import type { ExportOptions, ExportResult } from './export/types.js';
import type { DownloadResult, DownloadError } from './export/assets.js';
import { generateOutputPaths } from './export/path.js';
import { DedupeManager } from './dedupe/index.js';

export class ClipOrchestrator {
  private browserManager: BrowserManager;

  constructor(options?: BrowserOptions) {
    this.browserManager = new BrowserManager(undefined, options);
  }

  async archive(url: string, options: ExportOptions): Promise<ExportResult> {
    // Validate URL
    if (!isValidUrl(url)) {
      throw new ClipError(ErrorCode.INVALID_URL, `Invalid URL: ${url}`);
    }

    const normalizedUrl = normalizeUrl(url);

    // Initialize deduplication manager
    const deduper = new DedupeManager(options.outputDir);
    await deduper.load();

    // Level 1 Check: URL-based quick check (before launching browser)
    const urlCheckResult = await deduper.checkByUrl(normalizedUrl);
    if (urlCheckResult.isArchived && !options.force) {
      return {
        status: 'failed',
        platform: 'unknown',
        diagnostics: {
          error: {
            code: ErrorCode.ALREADY_ARCHIVED,
            message: `Content already archived at: ${urlCheckResult.record!.path}`,
            retryable: false,
            suggestion: 'Use --force to overwrite the existing archive',
          },
        },
      };
    }

    // Force mode: remove old record if it exists
    if (options.force && urlCheckResult.isArchived) {
      if (options.verbose) {
        console.log(`[Dedupe] Removing old archive record: ${urlCheckResult.record!.path}`);
      }
      await deduper.removeRecord(normalizedUrl);
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

      // Level 2 Check: Document-based precise check (after extraction)
      const docCheckResult = await deduper.checkByDoc(doc);
      if (docCheckResult.isArchived && !options.force) {
        if (options.verbose) {
          console.log(`[Dedupe] Content already archived (canonical URL match)`);
          console.log(`[Dedupe] Existing record: ${docCheckResult.record!.path}`);
          console.log(`[Dedupe] Original URL: ${normalizedUrl}`);
          console.log(`[Dedupe] Canonical URL: ${doc.canonicalUrl}`);
        }
        return {
          status: 'failed',
          platform: doc.platform,
          canonicalUrl: doc.canonicalUrl,
          title: doc.title,
          diagnostics: {
            error: {
              code: ErrorCode.ALREADY_ARCHIVED,
              message: `Content already archived at: ${docCheckResult.record!.path}`,
              retryable: false,
              suggestion: 'Use --force to overwrite the existing archive',
            },
          },
        };
      }

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

      // Calculate relative path for archive record
      const relativePath = markdownPath.replace(options.outputDir, '.').replace(/^\/+/, '');

      // Add archive record after successful export
      await deduper.addRecord(doc, relativePath);

      if (options.verbose) {
        console.log(`[Dedupe] Archive record added: ${relativePath}`);
        console.log(`[Dedupe] Platform: ${doc.platform}`);
        console.log(`[Dedupe] Source URL: ${doc.sourceUrl}`);
        if (doc.canonicalUrl) {
          console.log(`[Dedupe] Canonical URL: ${doc.canonicalUrl}`);
        }
      }

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
}
