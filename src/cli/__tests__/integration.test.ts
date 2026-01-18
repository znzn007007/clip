import { describe, it, expect } from '@jest/globals';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

describe('CLI Integration Tests', () => {
  const cli = join(process.cwd(), 'dist/cli/index.js');

  it('should show help for unified command', () => {
    const output = execSync(`node ${cli} --help`, { encoding: 'utf-8' });
    expect(output).toContain('[url]');
    expect(output).toContain('--file');
    expect(output).toContain('--stdin');
  });

  it('should show queue subcommands', () => {
    const output = execSync(`node ${cli} queue --help`, { encoding: 'utf-8' });
    expect(output).toContain('add');
    expect(output).toContain('list');
    expect(output).toContain('run');
    expect(output).toContain('clear');
  });

  it('should error when no URL or file provided', () => {
    expect(() => {
      execSync(`node ${cli}`, { encoding: 'utf-8', stdio: 'pipe' });
    }).toThrow();
  });

  it('should parse URLs from test file', () => {
    const content = '# Test URLs\nhttps://x.com/status/123\n\nhttps://zhihu.com/q/456\n';
    const urls = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    expect(urls).toHaveLength(2);
  });
});
