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
