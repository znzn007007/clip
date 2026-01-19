// src/cli/__tests__/commands.test.ts
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { registerInstallBrowsersCommand } from '../commands/install-browsers.js';
import { registerQueueCommand } from '../commands/queue.js';
import { Command } from 'commander';

describe('CLI Commands - install-browsers', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;
  let processExitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should register install-browsers command', () => {
    const program = new Command();
    const spy = jest.spyOn(program, 'command');

    registerInstallBrowsersCommand(program);

    expect(spy).toHaveBeenCalledWith('install-browsers');
  });

  it('should set command description', () => {
    const program = new Command();
    registerInstallBrowsersCommand(program);

    const command = program.commands.find(cmd => cmd.name() === 'install-browsers');
    expect(command?.description()).toBe('Install Playwright browsers (optional fallback)');
  });

  it('should have install-browsers command registered', () => {
    const program = new Command();
    registerInstallBrowsersCommand(program);

    expect(program.commands.find(c => c.name() === 'install-browsers')).toBeDefined();
  });
});

describe('CLI Commands - queue', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;
  let processExitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should register queue command with subcommands', () => {
    const program = new Command();
    const spy = jest.spyOn(program, 'command');

    registerQueueCommand(program);

    expect(spy).toHaveBeenCalledWith('queue');
  });

  it('should register queue add subcommand', () => {
    const program = new Command();
    registerQueueCommand(program);

    const queueCmd = program.commands.find(cmd => cmd.name() === 'queue');
    expect(queueCmd).toBeDefined();

    const addCmd = queueCmd?.commands.find(cmd => cmd.name() === 'add');
    expect(addCmd).toBeDefined();
    expect(addCmd?.description()).toBe('Add URL to queue (not yet implemented)');
  });

  it('should register queue list subcommand', () => {
    const program = new Command();
    registerQueueCommand(program);

    const queueCmd = program.commands.find(cmd => cmd.name() === 'queue');
    const listCmd = queueCmd?.commands.find(cmd => cmd.name() === 'list');

    expect(listCmd).toBeDefined();
    expect(listCmd?.description()).toBe('List queue status (not yet implemented)');
  });

  it('should register queue run subcommand', () => {
    const program = new Command();
    registerQueueCommand(program);

    const queueCmd = program.commands.find(cmd => cmd.name() === 'queue');
    const runCmd = queueCmd?.commands.find(cmd => cmd.name() === 'run');

    expect(runCmd).toBeDefined();
    expect(runCmd?.description()).toBe('Execute queued tasks (not yet implemented)');
  });

  it('should register queue clear subcommand', () => {
    const program = new Command();
    registerQueueCommand(program);

    const queueCmd = program.commands.find(cmd => cmd.name() === 'queue');
    const clearCmd = queueCmd?.commands.find(cmd => cmd.name() === 'clear');

    expect(clearCmd).toBeDefined();
    expect(clearCmd?.description()).toBe('Clear queue (not yet implemented)');
  });

  it('should register all 4 queue subcommands', () => {
    const program = new Command();
    registerQueueCommand(program);

    const queueCmd = program.commands.find(cmd => cmd.name() === 'queue');
    expect(queueCmd?.commands.length).toBe(4);

    const subcommandNames = queueCmd?.commands.map(c => c.name()).sort();
    expect(subcommandNames).toEqual(['add', 'clear', 'list', 'run']);
  });
});
