#!/usr/bin/env node

import { Command } from 'commander';
import { registerOnceCommand } from './commands/once.js';
import { registerInstallBrowsersCommand } from './commands/install-browsers.js';

const program = new Command();

program
  .name('clip')
  .description('Local content archiver')
  .version('0.1.0');

registerInstallBrowsersCommand(program);
registerOnceCommand(program);

program.parse();
