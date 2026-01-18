// src/core/batch/runner.ts
import { readFile } from 'node:fs/promises';
import { ClipOrchestrator } from '../orchestrator.js';
import { ClipError } from '../errors.js';
import { ErrorCode } from '../export/types.js';
import type { ExportOptions, ExportResult } from '../export/types.js';

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

    for (const url of urls) {
      // Create a new orchestrator for each URL to ensure clean browser state
      // This is necessary because ClipOrchestrator.archive() calls browserManager.close()
      const orchestrator = new ClipOrchestrator(
        options.cdpEndpoint ? { cdpEndpoint: options.cdpEndpoint } : undefined
      );

      try {
        const result = await this.processUrl(url, orchestrator, options);
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
    orchestrator: ClipOrchestrator,
    options: BatchOptions
  ): Promise<ExportResult> {
    const exportOptions: ExportOptions = {
      outputDir: options.outputDir,
      format: options.format,
      downloadAssets: options.downloadAssets,
      json: options.json ?? false,
      debug: options.debug ?? false,
    };

    return await orchestrator.archive(url, exportOptions);
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
