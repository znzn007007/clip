// src/cli/commands/install-browsers.ts
import { Command } from 'commander';
import { execSync } from 'child_process';

export function registerInstallBrowsersCommand(program: Command): void {
  program
    .command('install-browsers')
    .description('Install Playwright browsers (optional fallback)')
    .action(async () => {
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
