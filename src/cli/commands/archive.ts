// src/cli/commands/archive.ts
import { Command } from 'commander';
import { BatchRunner } from '../../core/batch/runner.js';
import { ClipOrchestrator } from '../../core/orchestrator.js';
import type { ExportFormat } from '../../core/export/types.js';
import type { BrowserType } from '../../core/types/index.js';

function parseBrowserType(value: string): BrowserType {
  if (value === 'chrome' || value === 'edge' || value === 'auto') {
    return value;
  }
  throw new Error(`Invalid browser: ${value}. Use chrome, edge, or auto`);
}

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
    .option('--browser <browser>', 'Browser to use (chrome|edge|auto) (default: "auto")', 'auto')
    .option('--force', 'Force overwrite existing archives', false)
    .option('--verbose', 'Verbose output', false)
    .action(async (url: string | undefined, options) => {
      // Validate and parse browser type
      const browserType = parseBrowserType(options.browser);

      // Validate arguments
      const hasUrl = url && url.length > 0;
      const hasFile = options.file || options.stdin;

      if (!hasUrl && !hasFile) {
        console.error('Error: URL argument or --file/--stdin is required');
        process.exit(1);
      }

      // Single URL mode
      if (hasUrl && !hasFile) {
        await handleSingleUrl(url!, options, browserType);
        return;
      }

      // Batch mode
      await handleBatch(options, browserType);
    });
}

async function handleSingleUrl(url: string, options: any, browserType: BrowserType): Promise<void> {
  const orchestrator = new ClipOrchestrator(
    options.cdp ? { cdpEndpoint: options.cdp, browserType } : { browserType }
  );

  try {
    console.log(`Archiving: ${url}`);

    const result = await orchestrator.archive(url, {
      outputDir: options.out,
      format: options.format,
      downloadAssets: options.assets,
      json: options.json,
      debug: options.debug,
      force: options.force,
      verbose: options.verbose,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    }

    // Check for "already archived" warning
    if (result.diagnostics?.warnings?.some(w => w.includes('Already archived'))) {
      console.log('⊘ Already archived:', result.diagnostics.warnings.find(w => w.includes('Already archived')));
      return;
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

async function handleBatch(options: any, browserType: BrowserType): Promise<void> {
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
      browserType,
      force: options.force ?? false,
    });
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
