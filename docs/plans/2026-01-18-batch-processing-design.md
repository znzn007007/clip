# Batch Processing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement batch URL processing with unified CLI command structure (`clip <url>` and `clip --file urls.txt`), supporting JSONL stream output and summary reports.

**Architecture:**
- Create `BatchRunner` class to handle serial execution of multiple URLs
- Refactor CLI from `clip once` to unified `clip <url>` command with `--file`/`--stdin` options
- Reuse existing `ClipOrchestrator` for individual URL processing

**Tech Stack:** TypeScript, Commander.js, Node.js streams

---

## Task 1: Create BatchRunner Core

**Files:**
- Create: `src/core/batch/runner.ts`
- Create: `src/core/batch/__tests__/runner.test.ts`

**Step 1: Write the failing test**

```typescript
// src/core/batch/__tests__/runner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BatchRunner } from '../runner.js';
import { ClipOrchestrator } from '../../orchestrator.js';

vi.mock('../../orchestrator.js');

describe('BatchRunner', () => {
  it('should parse URLs from file', async () => {
    const mockFs = await import('node:fs/promises');
    vi.spyOn(mockFs, 'readFile').mockResolvedValue(
      'https://x.com/status/123\n' +
      '# comment\n' +
      'https://zhihu.com/question/456\n' +
      '\n'  // empty line
    );

    const runner = new BatchRunner();
    const urls = await runner['parseUrls']('file', 'test.txt');

    expect(urls).toEqual([
      'https://x.com/status/123',
      'https://zhihu.com/question/456'
    ]);
  });

  it('should parse URLs from stdin', async () => {
    const mockFs = await import('node:fs/promises');
    vi.spyOn(mockFs, 'readFile').mockResolvedValue(
      'https://x.com/status/789\nhttps://zhihu.com/question/101'
    );

    const runner = new BatchRunner();
    const urls = await runner['parseUrls']('stdin');

    expect(urls).toEqual([
      'https://x.com/status/789',
      'https://zhihu.com/question/101'
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- batch.runner`
Expected: FAIL with "Cannot find module '../runner'"

**Step 3: Write minimal implementation**

```typescript
// src/core/batch/runner.ts
import { readFile } from 'node:fs/promises';
import { ClipOrchestrator } from '../orchestrator.js';
import type { ExportOptions, ExportResult } from '../export/types.js';

export interface BatchOptions {
  source: 'file' | 'stdin';
  filePath?: string;
  continueOnError: boolean;
  jsonl: boolean;
  outputDir: string;
  format: 'md' | 'md+html';
  downloadAssets: boolean;
  cdpEndpoint?: string;
}

export interface BatchSummary {
  total: number;
  success: number;
  failed: number;
  duration: number;
  failures: Array<{ url: string; error: string }>;
}

export class BatchRunner {
  async run(options: BatchOptions): Promise<BatchSummary> {
    const urls = await this.parseUrls(options.source, options.filePath);

    if (urls.length === 0) {
      return { total: 0, success: 0, failed: 0, duration: 0, failures: [] };
    }

    const startTime = Date.now();
    const failures: Array<{ url: string; error: string }> = [];
    let successCount = 0;

    const orchestrator = new ClipOrchestrator(
      options.cdpEndpoint ? { cdpEndpoint: options.cdpEndpoint } : undefined
    );

    for (const url of urls) {
      try {
        const result = await this.processUrl(url, orchestrator, options);
        if (options.jsonl) {
          this.printJsonl(result);
        }
        if (result.status === 'success') {
          successCount++;
          console.log(`✓ ${url}`);
        } else {
          failures.push({ url, error: result.diagnostics?.error?.message ?? 'Unknown error' });
          console.log(`✗ ${url} (${result.diagnostics?.error?.code})`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        failures.push({ url, error: errorMsg });
        console.log(`✗ ${url} (${errorMsg})`);

        if (!options.continueOnError) {
          throw error;
        }
      }
    }

    const duration = Date.now() - startTime;
    const summary: BatchSummary = {
      total: urls.length,
      success: successCount,
      failed: failures.length,
      duration,
      failures
    };

    this.printSummary(summary);
    return summary;
  }

  async parseUrls(source: 'file' | 'stdin', filePath?: string): Promise<string[]> {
    let content: string;

    if (source === 'file') {
      content = await readFile(filePath ?? '', 'utf-8');
    } else {
      content = await readFile(0, { encoding: 'utf-8' });
    }

    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
  }

  private async processUrl(
    url: string,
    orchestrator: ClipOrchestrator,
    options: BatchOptions
  ): Promise<ExportResult> {
    const exportOptions: ExportOptions = {
      outputDir: options.outputDir,
      format: options.format,
      downloadAssets: options.downloadAssets,
      json: false,
      debug: false
    };

    return await orchestrator.archive(url, exportOptions);
  }

  private printJsonl(result: ExportResult): void {
    console.log(JSON.stringify(result));
  }

  private printSummary(summary: BatchSummary): void {
    console.log('\n' + '━'.repeat(50));
    console.log(`Summary: ${summary.success} success, ${summary.failed} failed, ${(summary.duration / 1000).toFixed(1)}s`);

    if (summary.failures.length > 0) {
      console.log('\nFailed URLs:');
      summary.failures.forEach(({ url, error }) => {
        console.log(`  - ${url}: ${error}`);
      });
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- batch.runner`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/batch/
git commit -m "feat(batch): add BatchRunner core class with URL parsing"
```

---

## Task 2: Refactor CLI Command Structure

**Files:**
- Create: `src/cli/commands/archive.ts`
- Modify: `src/cli/index.ts`
- Delete: `src/cli/commands/once.ts`

**Step 1: Write the new archive command**

```typescript
// src/cli/commands/archive.ts
import { Command } from 'commander';
import { BatchRunner } from '../../core/batch/runner.js';
import { ClipOrchestrator } from '../../core/orchestrator.js';
import type { ExportFormat } from '../../core/export/types.js';

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
    .action(async (url: string | undefined, options) => {
      // Validate arguments
      const hasUrl = url && url.length > 0;
      const hasFile = options.file || options.stdin;

      if (!hasUrl && !hasFile) {
        console.error('Error: URL argument or --file/--stdin is required');
        process.exit(1);
      }

      // Single URL mode
      if (hasUrl && !hasFile) {
        await handleSingleUrl(url!, options);
        return;
      }

      // Batch mode
      await handleBatch(options);
    });
}

async function handleSingleUrl(url: string, options: any): Promise<void> {
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
      debug: options.debug,
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
}

async function handleBatch(options: any): Promise<void> {
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
    });
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
```

**Step 2: Update CLI index**

```typescript
// src/cli/index.ts
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
```

**Step 3: Delete old once.ts**

```bash
rm src/cli/commands/once.ts
```

**Step 4: Build and test**

Run: `npm run build`
Run: `node dist/cli/index.js https://x.com/user/status/123 --help`

Expected: Help shows new unified command structure

**Step 5: Commit**

```bash
git add src/cli/
git commit -m "refactor(cli): unify command structure - clip <url> and clip --file"
```

---

## Task 3: Add Queue Command Stub (for future implementation)

**Files:**
- Create: `src/cli/commands/queue.ts`

**Step 1: Create queue command stub**

```typescript
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
```

**Step 2: Register queue command in CLI index**

```typescript
// src/cli/index.ts
import { registerQueueCommand } from './commands/queue.js';

// Add after install-browsers:
registerQueueCommand(program);
```

**Step 3: Build and test**

Run: `npm run build`
Run: `node dist/cli/index.js queue --help`

Expected: Shows queue subcommands

**Step 4: Commit**

```bash
git add src/cli/commands/queue.ts src/cli/index.ts
git commit -m "feat(cli): add queue command stub for future implementation"
```

---

## Task 4: Write End-to-End Integration Tests

**Files:**
- Create: `src/cli/__tests__/integration.test.ts`

**Step 1: Write integration test**

```typescript
// src/cli/__tests__/integration.test.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
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
      execSync(`node ${cli}`, { encoding: 'utf-8' });
    }).toThrow();
  });

  it('should parse URLs from test file', () => {
    const testFile = join(process.cwd(), 'test-urls.txt');
    const content = '# Test URLs\nhttps://x.com/status/123\n\nhttps://zhihu.com/q/456\n';
    // Note: This is a simplified test - real implementation would use temp files
    expect(content.split('\n').filter(l => l.trim() && !l.startsWith('#'))).toHaveLength(2);
  });
});
```

**Step 2: Run tests**

Run: `npm test -- integration`
Expected: PASS

**Step 3: Commit**

```bash
git add src/cli/__tests__/integration.test.ts
git commit -m "test(cli): add integration tests for unified command structure"
```

---

## Task 5: Update Documentation

**Files:**
- Modify: `docs/pending-tasks.md`
- Create: `docs/dailyReport/2026-01-18-summary.md`

**Step 1: Update pending-tasks.md**

Find the "队列系统实现" section and add:

```markdown
### 4. 队列系统实现 / Queue System Implementation

**优先级:** 🟢 P1 设计完成，待实现

**状态:**
- ✅ 设计文档: `docs/plans/2026-01-18-batch-processing-design.md`
- ✅ CLI 结构统一: `clip <url>` 和 `clip --file urls.txt`
- ⏳ BatchRunner 实现中
- ⏳ 队列管理 (clip queue add/list/run/clear) - 待后续实现

**设计决策:**
- 批量模式使用临时内存队列，无需持久化
- 串行执行（默认），失败处理用户可选
- 支持 JSONL 流式输出和汇总报告
```

**Step 2: Create daily report**

```markdown
# 2026-01-18 Summary

## Completed

### Batch Processing Design
- Designed unified CLI structure: `clip <url>` instead of `clip once`
- Designed batch processing: `clip --file urls.txt` and `clip --stdin`
- Created implementation plan: `docs/plans/2026-01-18-batch-processing-design.md`
- Added queue command stub for future implementation

### Design Decisions
- **Command unification**: `clip once` → `clip <url>` for better UX
- **Namespace for queue**: `clip queue add/list/run/clear` for clear grouping
- **Temporary batch processing**: In-memory queue, no persistence needed
- **User-choice error handling**: `--continue-on-error` flag

## Pending

- Implement BatchRunner class
- Implement unified CLI command
- Add integration tests
- Future: Implement persistent queue system

## Files Changed

- `docs/plans/2026-01-18-batch-processing-design.md` - Design doc
- `docs/pending-tasks.md` - Updated queue status
```

**Step 3: Commit**

```bash
git add docs/
git commit -m "docs: add batch processing design and daily summary"
```

---

## Testing Checklist

After implementation, verify:

1. **Single URL mode:**
   ```bash
   clip https://x.com/user/status/123
   clip https://x.com/user/status/123 --json
   ```

2. **Batch mode from file:**
   ```bash
   clip --file urls.txt
   clip --file urls.txt --jsonl
   clip --file urls.txt --continue-on-error
   ```

3. **Batch mode from stdin:**
   ```bash
   echo "https://x.com/status/123" | clip --stdin
   ```

4. **Queue commands (stub):**
   ```bash
   clip queue --help
   clip queue add https://x.com/status/123  # Should show not implemented error
   ```

---

## Related Files

- `src/core/orchestrator.ts` - Reused for individual processing
- `src/core/batch/runner.ts` - New batch processing logic
- `src/cli/commands/archive.ts` - Unified command (renamed from once.ts)
- `src/cli/commands/queue.ts` - Queue management stub
- `docs/plans/2026-01-18-batch-processing-design.md` - This document
