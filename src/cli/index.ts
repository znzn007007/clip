#!/usr/bin/env node

import { Command } from 'commander';
import { registerArchiveCommand } from './commands/archive.js';
import { registerInstallBrowsersCommand } from './commands/install-browsers.js';

const program = new Command();

program
  .name('clip')
  .description('Local content archiver')
  .version('0.1.0');

registerInstallBrowsersCommand(program);
registerArchiveCommand(program);

program.parse();
