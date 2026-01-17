// src/core/orchestrator.ts
import { BrowserManager } from './render/browser.js';
import { PageRenderer } from './render/page.js';
import { registry } from './extract/registry.js';
import { MarkdownGenerator } from './export/markdown.js';
import { AssetDownloader } from './export/assets.js';
import { buildExportResult } from './export/json.js';
import { isValidUrl, normalizeUrl } from './render/utils.js';
import { ClipError, ErrorCode, createExportResult } from './errors.js';
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
      let assetMapping = new Map<string, string>();
      if (options.downloadAssets) {
        assetMapping = await assetDownloader.downloadImages(
          doc.assets.images,
          assetsDir
        );
      }

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
        return createExportResult(error);
      }

      throw error;
    } finally {
      await this.browserManager.close();
    }
  }
}
