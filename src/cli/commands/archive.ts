// src/cli/commands/archive.ts
import { Command } from 'commander';
import { BatchRunner } from '../../core/batch/runner.js';
import { ClipOrchestrator } from '../../core/orchestrator.js';
import type { ExportFormat } from '../../core/export/types.js';

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
    .action(async (url: string | undefined, options) => {
      // Validate arguments
      const hasUrl = url && url.length > 0;
      const hasFile = options.file || options.stdin;

      if (!hasUrl && !hasFile) {
        console.error('Error: URL argument or --file/--stdin is required');
        process.exit(1);
      }

      // Single URL mode
      if (hasUrl && !hasFile) {
        await handleSingleUrl(url!, options);
        return;
      }

      // Batch mode
      await handleBatch(options);
    });
}

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
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    }

    if (result.status === 'success') {
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
    });
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
