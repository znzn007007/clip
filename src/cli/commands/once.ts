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
    .option('--cdp <endpoint>', 'Connect to existing browser via CDP (e.g., http://localhost:9222)')
    .action(async (url: string, options) => {
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
    });
}
