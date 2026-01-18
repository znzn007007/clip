// src/cli/commands/queue.ts
import { Command } from 'commander';

export function registerQueueCommand(program: Command): void {
  const queueCmd = program
    .command('queue')
    .description('Queue management commands');

  queueCmd
    .command('add <url>')
    .description('Add URL to queue (not yet implemented)')
    .action(() => {
      console.error('Error: Queue commands are not yet implemented');
      process.exit(1);
    });

  queueCmd
    .command('list')
    .description('List queue status (not yet implemented)')
    .action(() => {
      console.error('Error: Queue commands are not yet implemented');
      process.exit(1);
    });

  queueCmd
    .command('run')
    .description('Execute queued tasks (not yet implemented)')
    .action(() => {
      console.error('Error: Queue commands are not yet implemented');
      process.exit(1);
    });

  queueCmd
    .command('clear')
    .description('Clear queue (not yet implemented)')
    .action(() => {
      console.error('Error: Queue commands are not yet implemented');
      process.exit(1);
    });
}
