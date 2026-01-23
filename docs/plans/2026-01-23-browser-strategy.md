# 多浏览器支持实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 重构浏览器策略，支持 Chrome 和 Edge 两种浏览器，允许用户通过 CLI 选项指定，并实现自动检测降级机制。

**架构:** 新增 BrowserSelector 类负责浏览器检测和选择；BROWSER_CONFIGS 映射存储浏览器配置；修改 BrowserManager 使用配置化方式启动浏览器；CLI 添加 --browser 选项。

**Tech Stack:** TypeScript, Playwright, Jest, Commander.js

---

## Task 1: 添加类型定义

**Files:**
- Modify: `src/core/types/index.ts`

**Step 1: 添加 BrowserType 类型**

在 `src/core/types/index.ts` 的导出类型区域添加：

```typescript
export type BrowserType = 'chrome' | 'edge' | 'auto';

export interface BrowserConfig {
  channel: 'chrome' | 'msedge';
  name: string;
  sessionDir: string;
  cookiesPath: (platform: NodeJS.Platform) => string | null;
}
```

**Step 2: 运行构建验证类型**

```bash
npm run build
```

Expected: 构建成功，无类型错误

**Step 3: 提交**

```bash
git add src/core/types/index.ts
git commit -m "feat: add BrowserType and BrowserConfig types"
```

---

## Task 2: 创建浏览器配置映射

**Files:**
- Create: `src/core/config/browser-config.ts`

**Step 1: 创建配置文件**

```typescript
// src/core/config/browser-config.ts
import * as path from 'path';
import * as os from 'os';
import type { BrowserConfig, BrowserType, ConfigurableBrowser } from '../types/index.js';

export const BROWSER_CONFIGS: Record<ConfigurableBrowser, BrowserConfig> = {
  edge: {
    channel: 'msedge',
    name: 'Microsoft Edge',
    sessionDir: '.clip/session-edge',
    cookiesPath: (platform: NodeJS.Platform) => {
      const homedir = os.homedir();
      switch (platform) {
        case 'win32':
          return path.join(homedir, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Network', 'Cookies');
        case 'darwin':
          return path.join(homedir, 'Library', 'Application Support', 'Microsoft Edge', 'Default', 'Cookies');
        case 'linux':
          return path.join(homedir, '.config', 'microsoft-edge', 'Default', 'Cookies');
        default:
          return null;
      }
    },
  },
  chrome: {
    channel: 'chrome',
    name: 'Google Chrome',
    sessionDir: '.clip/session-chrome',
    cookiesPath: (platform: NodeJS.Platform) => {
      const homedir = os.homedir();
      switch (platform) {
        case 'win32':
          return path.join(homedir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies');
        case 'darwin':
          return path.join(homedir, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Cookies');
        case 'linux':
          return path.join(homedir, '.config', 'google-chrome', 'Default', 'Cookies');
        default:
          return null;
      }
    },
  },
};

export const DEFAULT_BROWSER: BrowserType = 'auto';
```

**Step 2: 运行构建验证**

```bash
npm run build
```

Expected: 构建成功

**Step 3: 提交**

```bash
git add src/core/config/browser-config.ts
git commit -m "feat: add browser configuration mapping"
```

---

## Task 3: 添加 BROWSER_NOT_FOUND 错误码

**Files:**
- Modify: `src/core/errors.ts`

**Step 1: 添加新的错误码**

在 `ErrorCode` enum 中添加：

```typescript
export enum ErrorCode {
  // ... 现有错误码
  BROWSER_NOT_FOUND = 'BROWSER_NOT_FOUND',
}
```

**Step 2: 运行构建验证**

```bash
npm run build
```

Expected: 构建成功

**Step 3: 提交**

```bash
git add src/core/errors.ts
git commit -m "feat: add BROWSER_NOT_FOUND error code"
```

---

## Task 4: 编写 BrowserSelector 单元测试（TDD - 先写测试）

**Files:**
- Create: `src/core/render/__tests__/browser-selector.test.ts`

**Step 1: 创建测试文件**

```typescript
// src/core/render/__tests__/browser-selector.test.ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BrowserSelector } from '../browser-selector.js';
import type { BrowserType } from '../../types/index.js';

describe('BrowserSelector', () => {
  let selector: BrowserSelector;

  beforeEach(() => {
    selector = new BrowserSelector();
  });

  describe('select() - 用户指定浏览器', () => {
    it('chrome 可用时应返回 chrome', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(true);
      const result = await selector.select('chrome');
      expect(result).toBe('chrome');
    });

    it('edge 可用时应返回 edge', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(true);
      const result = await selector.select('edge');
      expect(result).toBe('edge');
    });

    it('chrome 不可用时应抛 BROWSER_NOT_FOUND 异常', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(false);
      await expect(selector.select('chrome')).rejects.toThrow('BROWSER_NOT_FOUND');
    });

    it('edge 不可用时应抛 BROWSER_NOT_FOUND 异常', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(false);
      await expect(selector.select('edge')).rejects.toThrow('BROWSER_NOT_FOUND');
    });
  });

  describe('select() - auto 模式', () => {
    it('edge 可用时应返回 edge', async () => {
      jest.spyOn(selector, 'isAvailable')
        .mockImplementation(async (b: BrowserType) => b === 'edge');
      const result = await selector.select('auto');
      expect(result).toBe('edge');
    });

    it('edge 不可用但 chrome 可用时应返回 chrome', async () => {
      jest.spyOn(selector, 'isAvailable')
        .mockImplementation(async (b: BrowserType) => b === 'chrome');
      const result = await selector.select('auto');
      expect(result).toBe('chrome');
    });

    it('两者都可用时应返回 edge（优先级）', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(true);
      const result = await selector.select('auto');
      expect(result).toBe('edge');
    });

    it('两者都不可用时应抛异常', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(false);
      await expect(selector.select('auto')).rejects.toThrow('No supported browser found');
    });

    it('undefined 参数等同于 auto', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(true);
      const result = await selector.select();
      expect(result).toBe('edge');
    });
  });

  describe('isAvailable()', () => {
    it('应该检测浏览器是否可用', async () => {
      const result = await selector.isAvailable('chrome');
      expect(typeof result).toBe('boolean');
    });
  });
});
```

**Step 2: 运行测试确认失败**

```bash
npm test -- browser-selector
```

Expected: FAIL - "Cannot find module '../browser-selector.js'"

**Step 3: 提交测试文件**

```bash
git add src/core/render/__tests__/browser-selector.test.ts
git commit -m "test: add BrowserSelector unit tests (TDD - failing first)"
```

---

## Task 5: 实现 BrowserSelector 类

**Files:**
- Create: `src/core/render/browser-selector.ts`

**Step 1: 创建 BrowserSelector 实现**

```typescript
// src/core/render/browser-selector.ts
import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import { ClipError } from '../errors.js';
import { ErrorCode } from '../../export/types.js';
import type { BrowserType } from '../types/index.js';

export class BrowserSelector {
  /**
   * 根据用户选择返回浏览器类型
   * - 用户指定：返回指定的，不可用则抛异常
   * - auto/undefined：按优先级返回第一个可用的
   */
  async select(browserType?: BrowserType): Promise<BrowserType> {
    // 用户指定浏览器
    if (browserType === 'chrome' || browserType === 'edge') {
      if (!(await this.isAvailable(browserType))) {
        const browserName = browserType === 'chrome' ? 'Google Chrome' : 'Microsoft Edge';
        throw new ClipError(
          ErrorCode.BROWSER_NOT_FOUND,
          `Browser '${browserType}' is not available on this system`,
          false,
          `Install ${browserName} or use --browser auto`
        );
      }
      return browserType;
    }

    // auto 模式：按优先级尝试
    for (const type of this.getAutoPriority()) {
      if (await this.isAvailable(type)) {
        return type;
      }
    }

    // 都不可用
    throw new ClipError(
      ErrorCode.BROWSER_NOT_FOUND,
      'No supported browser found',
      false,
      'Install Google Chrome or Microsoft Edge'
    );
  }

  /**
   * 自动模式的优先级：edge -> chrome
   */
  private getAutoPriority(): BrowserType[] {
    return ['edge', 'chrome'];
  }

  /**
   * 检查浏览器是否可用
   */
  async isAvailable(browserType: BrowserType): Promise<boolean> {
    const channel = browserType === 'chrome' ? 'chrome' : 'msedge';
    try {
      const executablePath = await chromium.executablePath(channel);
      if (!executablePath) return false;
      await fs.access(executablePath);
      return true;
    } catch {
      return false;
    }
  }
}
```

**Step 2: 运行测试**

```bash
npm test -- browser-selector
```

Expected: PASS（或部分失败，根据实际情况调整 mock）

**Step 3: 如果测试失败，调整并重新运行**

**Step 4: 运行完整测试套件**

```bash
npm test
```

Expected: 所有测试通过

**Step 5: 提交**

```bash
git add src/core/render/browser-selector.ts
git commit -m "feat: implement BrowserSelector with detection and selection"
```

---

## Task 6: 修改 BrowserManager 使用 BrowserSelector

**Files:**
- Modify: `src/core/render/browser.ts`

**Step 1: 修改构造函数和属性**

更新导入和构造函数：

```typescript
import { chromium, type BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DEFAULT_USER_AGENT } from '../config/constants.js';
import { ClipError } from '../errors.js';
import { ErrorCode } from '../export/types.js';
import { detectPlatform } from './utils.js';
import { BrowserSelector } from './browser-selector.js';
import { BROWSER_CONFIGS } from '../config/browser-config.js';
import type { BrowserType } from '../types/index.js';

export interface BrowserOptions {
  cdpEndpoint?: string;
  browserType?: BrowserType;  // 新增
}

export class BrowserManager {
  private context?: BrowserContext;
  private sessionDir: string;
  private options?: BrowserOptions;

  constructor(
    sessionDir: string = path.join(process.cwd(), '.clip', 'session'),
    options?: BrowserOptions
  ) {
    this.sessionDir = sessionDir;
    this.options = options;
  }
```

**Step 2: 重写 launch 方法**

替换整个 `launch` 方法：

```typescript
  async launch(targetUrl?: string): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    // 步骤 1: 选择浏览器
    const selector = new BrowserSelector();
    const selectedBrowser = await selector.select(this.options?.browserType);

    // 步骤 2: 获取配置
    const config = BROWSER_CONFIGS[selectedBrowser];
    this.sessionDir = path.join(process.cwd(), config.sessionDir);

    // 步骤 3: 创建 session 目录
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });
    } catch (error) {
      throw new ClipError(
        ErrorCode.EXPORT_FAILED,
        `Failed to create session directory: ${this.sessionDir}`,
        false,
        `Check permissions for directory: ${this.sessionDir}`
      );
    }

    // 步骤 4: 检查系统 cookies
    const cookiesPath = config.cookiesPath(os.platform());
    if (cookiesPath) {
      try {
        await fs.access(cookiesPath);
        console.error(`[INFO] Found ${config.name} cookies at: ${cookiesPath}`);
        console.error(`[INFO] Note: ${config.name} must be closed to use its cookies directly`);
        console.error('[INFO] Alternatively, use a persistent session that will remember logins');
      } catch {
        console.error(`[INFO] ${config.name} cookies not found, starting fresh session`);
      }
    }

    // 步骤 5: 启动浏览器
    try {
      console.error(`[INFO] Launching ${config.name} with persistent session: ${this.sessionDir}`);
      this.context = await chromium.launchPersistentContext(this.sessionDir, {
        channel: config.channel,
        headless: false,
        userAgent: DEFAULT_USER_AGENT,
        viewport: { width: 1920, height: 1080 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--no-default-browser-check',
        ],
      });

      // 步骤 6: 登录检测
      await this.checkLoginIfNeeded(targetUrl, selectedBrowser);

    } catch (error) {
      throw new ClipError(
        ErrorCode.NETWORK_ERROR,
        `Failed to launch browser: ${error instanceof Error ? error.message : 'Unknown error'}`,
        false,
        `Ensure ${config.name} is installed on your system`
      );
    }

    return this.context;
  }
```

**Step 3: 修改 shouldCheckTwitterLogin 方法**

更新方法签名和实现：

```typescript
  private shouldCheckTwitterLogin(targetUrl?: string, browserType?: BrowserType): boolean {
    // 对于两种浏览器都执行 Twitter 登录检测
    if (!targetUrl) {
      return true;
    }
    try {
      const url = new URL(targetUrl);
      return detectPlatform(url) === 'twitter';
    } catch {
      return true;
    }
  }
```

**Step 4: 删除 getEdgeCookiesPath 方法**

由于现在使用 `BROWSER_CONFIGS`，删除旧的 `getEdgeCookiesPath` 方法。

**Step 5: 运行测试**

```bash
npm test
```

Expected: 所有测试通过

**Step 6: 运行构建**

```bash
npm run build
```

Expected: 构建成功

**Step 7: 提交**

```bash
git add src/core/render/browser.ts
git commit -m "refactor: integrate BrowserSelector into BrowserManager"
```

---

## Task 7: 修改 CLI 添加 --browser 选项

**Files:**
- Modify: `src/cli/commands/archive.ts`

**Step 1: 添加 parseBrowserType 函数**

在文件顶部添加：

```typescript
import type { BrowserType } from '../../core/types/index.js';

function parseBrowserType(value: string): BrowserType {
  if (value === 'chrome' || value === 'edge' || value === 'auto') {
    return value;
  }
  throw new Error(`Invalid browser: ${value}. Use chrome, edge, or auto`);
}
```

**Step 2: 添加 --browser 选项**

在 `registerArchiveCommand` 函数的选项链中添加：

```typescript
export function registerArchiveCommand(program: Command): void {
  program
    .argument('[url]', 'URL to archive (optional if using --file or --stdin)')
    .option('--out <dir>', 'Output directory (default: "./clips")', './clips')
    .option('--format <format>', 'Output format (md|md+html) (default: "md")', 'md')
    .option('--browser <browser>', 'Browser to use (chrome|edge|auto) (default: "auto")', 'auto')
    // ... 其他选项
    .action(async (url: string, options) => {
      const browserType = parseBrowserType(options.browser);
      await archiveUrl(url, { ...options, browserType });
    });
}
```

**Step 3: 更新 archiveUrl 函数签名**

确保 `archiveUrl` 接受 `browserType` 参数：

```typescript
interface ArchiveOptions {
  out: string;
  format: 'md' | 'md+html';
  browserType?: BrowserType;
  // ... 其他选项
}

async function archiveUrl(url: string, options: ArchiveOptions): Promise<void> {
  const orchestrator = new ClipOrchestrator({
    outputDir: options.out,
    format: options.format,
    browserType: options.browserType,
    // ... 其他选项
  });
  // ...
}
```

**Step 4: 运行构建验证**

```bash
npm run build
```

Expected: 构建成功

**Step 5: 测试 CLI 帮助输出**

```bash
node dist/cli/index.js --help
```

Expected: 看到 `--browser <browser>` 选项

**Step 6: 提交**

```bash
git add src/cli/commands/archive.ts
git commit -m "feat: add --browser CLI option"
```

---

## Task 8: 更新 ClipOrchestrator 传递 browserType

**Files:**
- Modify: `src/core/orchestrator.ts`

**Step 1: 更新 OrchestratorOptions 接口**

```typescript
export interface OrchestratorOptions {
  outputDir: string;
  format: 'md' | 'md+html';
  browserType?: BrowserType;
  // ... 其他选项
}
```

**Step 2: 更新构造函数**

```typescript
export class ClipOrchestrator {
  private browserManager: BrowserManager;
  private options: OrchestratorOptions;

  constructor(options: OrchestratorOptions) {
    this.options = options;
    this.browserManager = new BrowserManager(
      undefined,
      { browserType: options.browserType }
    );
    // ...
  }
```

**Step 3: 运行测试和构建**

```bash
npm test && npm run build
```

Expected: 所有测试通过，构建成功

**Step 4: 提交**

```bash
git add src/core/orchestrator.ts
git commit -m "feat: pass browserType to ClipOrchestrator"
```

---

## Task 9: 更新集成测试

**Files:**
- Modify: `src/core/render/__tests__/browser.test.ts`

**Step 1: 添加多浏览器测试用例**

在测试文件中添加新的 describe 块：

```typescript
describe('BrowserManager - 多浏览器支持', () => {
  it('应使用指定的浏览器启动', async () => {
    // Mock BrowserSelector 返回 chrome
    const mockSelect = jest.spyOn(BrowserSelector.prototype, 'select')
      .mockResolvedValue('chrome');

    const manager = new BrowserManager('./test-session', { browserType: 'chrome' });
    // 注意：实际测试中需要 mock chromium.launchPersistentContext
    // 这里只验证调用逻辑
    expect(mockSelect).toHaveBeenCalledWith('chrome');

    mockSelect.mockRestore();
  });

  it('auto 模式应使用默认优先级', async () => {
    const mockSelect = jest.spyOn(BrowserSelector.prototype, 'select')
      .mockResolvedValue('edge');

    const manager = new BrowserManager('./test-session', { browserType: 'auto' });
    expect(mockSelect).toHaveBeenCalledWith('auto');

    mockSelect.mockRestore();
  });
});
```

**Step 2: 修复 os.platform spy 问题**

找到并修复现有测试中 `os.platform` 的 spy 问题（第 303 行）：

```typescript
// 修复前
jest.spyOn(os, 'platform').mockReturnValue('freebsd' as NodeJS.Platform);

// 修复后 - 使用 spyOn 的正确方式
const platformSpy = jest.spyOn(os, 'platform') as jest.SpyInstance<() => NodeJS.Platform>;
platformSpy.mockReturnValue('freebsd');

// 在 afterAll 中恢复
afterAll(() => {
  platformSpy.mockRestore();
});
```

**Step 3: 运行测试**

```bash
npm test -- browser.test.ts
```

Expected: 所有测试通过

**Step 4: 提交**

```bash
git add src/core/render/__tests__/browser.test.ts
git commit -m "test: add multi-browser integration tests and fix os.platform spy"
```

---

## Task 10: 手动测试验证

**Files:**
- None (手动测试)

**Step 1: 构建项目**

```bash
npm run build
```

**Step 2: 测试默认行为（auto 模式）**

```bash
node dist/cli/index.js "https://x.com/status/123"
```

Expected:
- 使用 Edge（如果可用）或 Chrome（如果 Edge 不可用）
- 日志显示 "Launching Microsoft Edge" 或 "Launching Google Chrome"

**Step 3: 测试指定 Chrome**

```bash
node dist/cli/index.js "https://x.com/status/123" --browser chrome
```

Expected:
- 使用 Chrome
- 日志显示 "Launching Google Chrome"

**Step 4: 测试指定 Edge**

```bash
node dist/cli/index.js "https://x.com/status/123" --browser edge
```

Expected:
- 使用 Edge
- 日志显示 "Launching Microsoft Edge"

**Step 5: 验证 session 目录**

检查是否创建了对应的 session 目录：
- `.clip/session-chrome/`（使用 Chrome 时）
- `.clip/session-edge/`（使用 Edge 时）

**Step 6: 测试错误处理（如果只有一种浏览器）**

```bash
# 如果只有 Edge，测试指定 Chrome
node dist/cli/index.js "https://x.com/status/123" --browser chrome
```

Expected: 抛出 BROWSER_NOT_FOUND 错误

---

## Task 11: 更新文档

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/pending-tasks.md`

**Step 1: 更新 CLAUDE.md**

在 "Development Commands" 部分添加：

```bash
# Specify browser
node dist/cli/index.js "https://x.com/user/status/123" --browser chrome
node dist/cli/index.js "https://x.com/user/status/123" --browser edge
```

在 "## Critical Implementation Details" 部分的 "Browser Strategy" 小节更新：

```markdown
### Browser Strategy

Supports multiple browsers with auto-detection:

**Browsers supported:**
- Google Chrome (`--browser chrome`)
- Microsoft Edge (`--browser edge`)
- Auto detection (`--browser auto` or default)

**Auto priority:** Edge → Chrome (fallback)

**Session directories:**
- Chrome: `.clip/session-chrome/`
- Edge: `.clip/session-edge/`
```

**Step 2: 更新 pending-tasks.md**

标记 "重构浏览器策略" 为已完成：

```markdown
### 2. ~~重构浏览器策略 / Refactor Browser Strategy~~

**优先级:** 高 / High ✅ **已完成 (2026-01-23)**
```

**Step 3: 提交文档更新**

```bash
git add CLAUDE.md docs/pending-tasks.md
git commit -m "docs: update browser strategy documentation"
```

---

## Task 12: 创建每日报告

**Files:**
- Create: `docs/dailyReport/2026-01-23-summary.md`

**Step 1: 创建每日报告**

```markdown
# 2026-01-23 工作总结

**Date:** 2026-01-23
**Status:** 多浏览器支持功能完整实现 ✅

## 完成的工作

### 多浏览器支持 (P1)

**目标:** 重构浏览器策略，支持 Chrome 和 Edge

**实施过程:**
1. 添加 BrowserType 和 BrowserConfig 类型定义
2. 创建 BROWSER_CONFIGS 配置映射
3. 实现 BrowserSelector 类（检测和选择）
4. 重构 BrowserManager 使用配置化方式
5. 添加 --browser CLI 选项
6. 更新集成测试

**核心功能:**
- ✅ 支持 Chrome 和 Edge 两种浏览器
- ✅ 用户指定模式：只使用指定浏览器，不存在则报错
- ✅ Auto 模式：Edge → Chrome 降级策略
- ✅ 独立的 session 目录（session-chrome / session-edge）
- ✅ 系统 cookies 检测（两种浏览器都支持）

**CLI 使用示例:**
```bash
# 默认（auto）
clip "https://x.com/user/status/123"

# 指定 Chrome
clip "url" --browser chrome

# 指定 Edge
clip "url" --browser edge
```

## 技术细节

**新增文件:**
- `src/core/render/browser-selector.ts` - 浏览器检测和选择
- `src/core/config/browser-config.ts` - 浏览器配置映射
- `src/core/render/__tests__/browser-selector.test.ts` - 单元测试

**修改文件:**
- `src/core/render/browser.ts` - 集成 BrowserSelector
- `src/core/types/index.ts` - 添加 BrowserType
- `src/core/errors.ts` - 添加 BROWSER_NOT_FOUND 错误码
- `src/cli/commands/archive.ts` - 添加 --browser 选项
- `src/core/orchestrator.ts` - 传递 browserType

**关键设计决策:**
- 用户指定时不降级（明确性优先）
- Auto 模式优先 Edge（保持兼容性）
- 独立 session 目录（避免冲突）

## 测试

- 单元测试：BrowserSelector（7 个测试用例）
- 集成测试：BrowserManager 多浏览器支持
- 修复：os.platform spy 问题

## 下一步

- [ ] 测试 CDP 连接功能
- [ ] 配置文件支持
```

**Step 2: 提交**

```bash
git add docs/dailyReport/2026-01-23-summary.md
git commit -m "docs: add daily report for 2026-01-23"
```

---

## 最终验证

**Step 1: 运行完整测试套件**

```bash
npm test
```

Expected: 所有测试通过

**Step 2: 运行构建**

```bash
npm run build
```

Expected: 构建成功，无错误

**Step 3: 检查 git 状态**

```bash
git status
git log --oneline -15
```

Expected:
- 所有更改已提交
- 看到完整的提交历史

---

## 相关文档

- 设计文档：`docs/plans/2026-01-23-browser-strategy-design.md`
- 项目指引：`CLAUDE.md`
- 类型定义：`src/core/types/index.ts`
- 浏览器配置：`src/core/config/browser-config.ts`
