import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Command } from 'commander';
import { buildProgram, runCli } from '../index.js';
import { BatchRunner } from '../../core/batch/runner.js';
import { ClipOrchestrator } from '../../core/orchestrator.js';
import * as childProcess from 'child_process';

jest.mock('../../core/batch/runner.js');
jest.mock('../../core/orchestrator.js');
jest.mock('child_process', () => ({ execSync: jest.fn() }));

describe('CLI Integration Tests', () => {
  const BatchRunnerMock = BatchRunner as jest.MockedClass<typeof BatchRunner>;
  const ClipOrchestratorMock = ClipOrchestrator as jest.MockedClass<typeof ClipOrchestrator>;

  let exitSpy: jest.SpiedFunction<typeof process.exit>;
  let errorSpy: jest.SpiedFunction<typeof console.error>;
  let logSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      return undefined as never;
    }) as never);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should show help for unified command', () => {
    const program = buildProgram();
    const help = program.helpInformation();
    expect(help).toContain('[url]');
    expect(help).toContain('--file');
    expect(help).toContain('--stdin');
  });

  it('runs parseAsync via runCli with provided argv', async () => {
    const parseSpy = jest.spyOn(Command.prototype, 'parseAsync').mockResolvedValue(undefined as any);

    await runCli(['node', 'clip', '--help']);

    expect(parseSpy).toHaveBeenCalledWith(['node', 'clip', '--help']);
    parseSpy.mockRestore();
  });

  it('auto-runs when NODE_ENV is not test', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalArgv = process.argv;
    process.env.NODE_ENV = 'production';

    process.argv = ['node', 'clip', '--help'];

    try {
      await jest.isolateModulesAsync(async () => {
        await import('../index.js');
      });
      expect(exitSpy).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.argv = originalArgv;
    }
  });

  it('should show queue subcommands', () => {
    const program = buildProgram();
    const queueCmd = program.commands.find((cmd) => cmd.name() === 'queue');
    expect(queueCmd).toBeDefined();
    const help = queueCmd?.helpInformation() ?? '';
    expect(help).toContain('add');
    expect(help).toContain('list');
    expect(help).toContain('run');
    expect(help).toContain('clear');
  });

  it('should error when no URL or file provided', async () => {
    const program = buildProgram();

    await program.parseAsync(['node', 'clip']);

    expect(errorSpy).toHaveBeenCalledWith('Error: URL argument or --file/--stdin is required');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should run batch mode when --file is provided', async () => {
    const runSpy = jest.fn(() => Promise.resolve()) as jest.Mock;
    BatchRunnerMock.mockImplementation(() => ({ run: runSpy }) as any);

    const program = buildProgram();
    await program.parseAsync(['node', 'clip', '--file', 'urls.txt', '--continue-on-error']);

    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'file',
        filePath: 'urls.txt',
        continueOnError: true,
      })
    );
  });

  it('should run single URL mode with orchestrator', async () => {
    const archiveSpy = jest.fn(() => Promise.resolve({
      status: 'success',
      paths: { markdownPath: '/tmp/test.md' },
      stats: { imageCount: 0 },
    })) as jest.Mock;
    ClipOrchestratorMock.mockImplementation(() => ({ archive: archiveSpy }) as any);

    const program = buildProgram();
    await program.parseAsync(['node', 'clip', 'https://x.com/status/123', '--format', 'md']);

    expect(archiveSpy).toHaveBeenCalledWith(
      'https://x.com/status/123',
      expect.objectContaining({
        outputDir: './clips',
        format: 'md',
        downloadAssets: true,
        json: false,
        debug: false,
      })
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should output json when --json is set', async () => {
    const archiveSpy = jest.fn(() => Promise.resolve({
      status: 'success',
      paths: { markdownPath: '/tmp/test.md' },
      stats: { imageCount: 2 },
    })) as jest.Mock;
    ClipOrchestratorMock.mockImplementation(() => ({ archive: archiveSpy }) as any);

    const program = buildProgram();
    await program.parseAsync(['node', 'clip', 'https://x.com/status/123', '--json']);

    const jsonCall = logSpy.mock.calls.find(call => typeof call[0] === 'string' && call[0].includes('"status"'));
    expect(jsonCall).toBeDefined();
  });

  it('should exit when archive returns failed status', async () => {
    const archiveSpy = jest.fn(() => Promise.resolve({
      status: 'failed',
      diagnostics: { error: { message: 'bad' } },
    })) as jest.Mock;
    ClipOrchestratorMock.mockImplementation(() => ({ archive: archiveSpy }) as any);

    const program = buildProgram();
    await program.parseAsync(['node', 'clip', 'https://x.com/status/123']);

    expect(errorSpy).toHaveBeenCalledWith('Failed:', 'bad');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit when archive throws', async () => {
    const archiveSpy = jest.fn(() => Promise.reject(new Error('boom'))) as jest.Mock;
    ClipOrchestratorMock.mockImplementation(() => ({ archive: archiveSpy }) as any);

    const program = buildProgram();
    await program.parseAsync(['node', 'clip', 'https://x.com/status/123']);

    expect(errorSpy).toHaveBeenCalledWith('Error:', 'boom');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it.each([
    ['add', ['queue', 'add', 'https://x.com/status/1']],
    ['list', ['queue', 'list']],
    ['run', ['queue', 'run']],
    ['clear', ['queue', 'clear']],
  ])('should error for queue %s subcommand', async (_label, args) => {
    const program = buildProgram();

    await program.parseAsync(['node', 'clip', ...args]);

    expect(errorSpy).toHaveBeenCalledWith('Error: Queue commands are not yet implemented');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit when batch runner throws', async () => {
    const runSpy = jest.fn(() => Promise.reject(new Error('batch fail'))) as jest.Mock;
    BatchRunnerMock.mockImplementation(() => ({ run: runSpy }) as any);

    const program = buildProgram();
    await program.parseAsync(['node', 'clip', '--file', 'urls.txt']);

    expect(errorSpy).toHaveBeenCalledWith('Error:', 'batch fail');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should install browsers successfully', async () => {
    const execSpy = childProcess.execSync as jest.Mock;
    execSpy.mockImplementation(() => Buffer.from(''));

    const program = buildProgram();
    await program.parseAsync(['node', 'clip', 'install-browsers']);

    expect(execSpy).toHaveBeenCalledWith('npx playwright install chromium', { stdio: 'inherit' });
    expect(logSpy).toHaveBeenCalledWith('✓ Browsers installed successfully');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should exit when install browsers fails', async () => {
    const execSpy = childProcess.execSync as jest.Mock;
    execSpy.mockImplementation(() => {
      throw new Error('fail');
    });

    const program = buildProgram();
    await program.parseAsync(['node', 'clip', 'install-browsers']);

    expect(errorSpy).toHaveBeenCalledWith('✗ Failed to install browsers');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
