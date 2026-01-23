# 多浏览器支持设计文档

**日期:** 2026-01-23
**状态:** 设计完成，待实现

## 概述

重构浏览器策略，让项目支持多种浏览器（Chrome、Edge）而不是只硬编码支持 Edge。

### 目标

1. **开源泛用性** - 让用户在没有 Edge 的系统（如 Linux/Mac）也能使用
2. **用户自由选择** - 允许用户根据偏好选择浏览器

---

## 架构设计

### 核心组件

```
┌─────────────────────────────────────────────────────────┐
│                    BrowserManager                        │
│                                                          │
│  • launch(targetUrl?, browserType?)                     │
│  • detectAvailableBrowsers(): BrowserType[]             │
│  • getBrowserCookiesPath(browserType): string | null    │
│  • shouldCheckLogin(targetUrl?, browserType): boolean   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  BrowserSelector                         │
│  (新增：负责浏览器检测和选择逻辑)                          │
│                                                          │
│  • select(browserType?): BrowserType                    │
│  • isAvailable(browserType): Promise<boolean>           │
│  • getAutoPriority(): BrowserType[]    // 仅 auto 时使用  │
└─────────────────────────────────────────────────────────┘
```

### 浏览器类型定义

```typescript
export type BrowserType = 'chrome' | 'edge' | 'auto';

export interface BrowserConfig {
  channel: 'chrome' | 'msedge';
  name: string;
  sessionDir: string;
  cookiesPath: (platform: NodeJS.Platform) => string | null;
}
```

### 选择策略

| 场景 | 策略 |
|------|------|
| `--browser chrome` | 只用 Chrome，不存在则报错 |
| `--browser edge` | 只用 Edge，不存在则报错 |
| 不指定（默认/auto） | Edge -> Chrome (降级) |

---

## BrowserSelector 类

```typescript
// src/core/render/browser-selector.ts (新增)

export class BrowserSelector {
  /**
   * 根据用户选择返回浏览器类型
   * - 用户指定：返回指定的，不可用则抛异常
   * - auto：按优先级返回第一个可用的
   */
  async select(browserType?: BrowserType): Promise<BrowserType> {
    if (browserType === 'chrome' || browserType === 'edge') {
      if (!(await this.isAvailable(browserType))) {
        throw new ClipError(
          ErrorCode.BROWSER_NOT_FOUND,
          `Browser '${browserType}' is not available on this system`,
          false,
          `Install ${browserType === 'chrome' ? 'Google Chrome' : 'Microsoft Edge'} or use --browser auto`
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

---

## BrowserConfig 映射

```typescript
// src/core/config/browser-config.ts (新增)

import * as path from 'path';
import * as os from 'os';

export const BROWSER_CONFIGS: Record<BrowserType, BrowserConfig> = {
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

---

## 数据流

### 启动流程

```
CLI 解析
   │
   ├── --browser edge  -> browserType: 'edge'
   ├── --browser chrome -> browserType: 'chrome'
   └── 无参数 -> browserType: undefined (auto)
   │
   ▼
BrowserSelector.select(browserType)
   │
   ├── 指定 chrome/edge:
   │    ├── isAvailable(browserType)
   │    ├── true -> 返回 browserType
   │    └── false -> 抛异常 BROWSER_NOT_FOUND
   │
   └── auto (未指定):
        ├── isAvailable('edge')  -> true? 返回 'edge'
        ├── isAvailable('chrome') -> true? 返回 'chrome'
        └── 都 false -> 抛异常 BROWSER_NOT_FOUND
   │
   ▼
BrowserManager.launch(targetUrl, selectedBrowserType)
   ├── 从 BROWSER_CONFIGS 获取配置
   ├── 使用对应的 sessionDir
   ├── 检查系统 cookies 路径
   └── 启动指定浏览器
```

### 修改后的 BrowserManager.launch()

```typescript
async launch(targetUrl?: string, browserType?: BrowserType): Promise<BrowserContext> {
  if (this.context) {
    return this.context;
  }

  // 步骤 1: 选择浏览器
  const selector = new BrowserSelector();
  const selectedBrowser = await selector.select(browserType);

  // 步骤 2: 获取配置
  const config = BROWSER_CONFIGS[selectedBrowser];
  this.sessionDir = path.join(process.cwd(), config.sessionDir);

  // 步骤 3: 创建 session 目录
  await fs.mkdir(this.sessionDir, { recursive: true });

  // 步骤 4: 检查系统 cookies
  const cookiesPath = config.cookiesPath(os.platform());
  if (cookiesPath) {
    try {
      await fs.access(cookiesPath);
      console.error(`[INFO] Found ${config.name} cookies at: ${cookiesPath}`);
    } catch {
      console.error(`[INFO] ${config.name} cookies not found, starting fresh session`);
    }
  }

  // 步骤 5: 启动浏览器
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

  // 步骤 6: 登录检测（保持原有逻辑）
  await this.checkLoginIfNeeded(targetUrl, selectedBrowser);

  return this.context;
}
```

---

## 错误处理

### 错误码定义

```typescript
// src/core/errors.ts (新增)

export enum ErrorCode {
  // ... 现有错误码
  BROWSER_NOT_FOUND = 'BROWSER_NOT_FOUND',
}
```

### 错误处理场景

| 场景 | 错误类型 | 用户提示 |
|------|----------|----------|
| `--browser chrome` 但 Chrome 未安装 | `BROWSER_NOT_FOUND` | "Browser 'chrome' is not available. Install Google Chrome or use --browser auto" |
| `--browser edge` 但 Edge 未安装 | `BROWSER_NOT_FOUND` | "Browser 'edge' is not available. Install Microsoft Edge or use --browser auto" |
| auto 模式但两者都未安装 | `BROWSER_NOT_FOUND` | "No supported browser found. Install Google Chrome or Microsoft Edge" |
| 浏览器安装但启动失败 | `NETWORK_ERROR` | "Failed to launch browser: {error}. Ensure the browser is properly installed" |

### 降级日志（auto 模式）

```
[INFO] Detecting available browsers...
[INFO] Trying Edge... not found
[INFO] Trying Chrome... found!
[INFO] Launching Google Chrome with persistent session: .clip/session-chrome
```

---

## CLI 集成

### CLI 选项修改

```typescript
// src/cli/commands/archive.ts (修改)

export function registerArchiveCommand(program: Command): void {
  program
    .argument('[url]', 'URL to archive')
    .option('--out <dir>', 'Output directory', './clips')
    .option('--format <format>', 'Output format (md|md+html)', 'md')
    .option('--browser <browser>', 'Browser to use (chrome|edge|auto)', 'auto')
    .option('--debug', 'Save debug artifacts', false)
    // ... 其他选项
    .action(async (url: string, options) => {
      const browserType = parseBrowserType(options.browser);
      await archiveUrl(url, { ...options, browserType });
    });
}

function parseBrowserType(value: string): BrowserType {
  if (value === 'chrome' || value === 'edge' || value === 'auto') {
    return value;
  }
  throw new Error(`Invalid browser: ${value}. Use chrome, edge, or auto`);
}
```

### CLI 帮助输出

```bash
$ clip --help

Options:
  --browser <browser>  Browser to use (chrome|edge|auto)  [default: auto]
  ...
```

### 使用示例

```bash
# 默认（auto）：Edge -> Chrome 降级
clip "https://x.com/user/status/123"

# 指定 Chrome
clip "https://x.com/user/status/123" --browser chrome

# 指定 Edge
clip "https://x.com/user/status/123" --browser edge

# 指定但不存在 -> 报错
clip "https://x.com/user/status/123" --browser firefox
# Error: Invalid browser: firefox. Use chrome, edge, or auto
```

---

## 测试策略

### 单元测试

**文件：** `src/core/render/__tests__/browser-selector.test.ts`

```typescript
describe('BrowserSelector', () => {
  describe('select() - 用户指定浏览器', () => {
    it('chrome 可用时应返回 chrome', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(true);
      const result = await selector.select('chrome');
      expect(result).toBe('chrome');
    });

    it('chrome 不可用时应抛异常', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(false);
      await expect(selector.select('chrome')).rejects.toThrow('BROWSER_NOT_FOUND');
    });
  });

  describe('select() - auto 模式', () => {
    it('edge 可用时应返回 edge', async () => {
      jest.spyOn(selector, 'isAvailable')
        .mockImplementation(async (b) => b === 'edge');
      const result = await selector.select('auto');
      expect(result).toBe('edge');
    });

    it('edge 不可用但 chrome 可用时应返回 chrome', async () => {
      jest.spyOn(selector, 'isAvailable')
        .mockImplementation(async (b) => b === 'chrome');
      const result = await selector.select('auto');
      expect(result).toBe('chrome');
    });

    it('都不可用时应抛异常', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(false);
      await expect(selector.select('auto')).rejects.toThrow('No supported browser found');
    });
  });
});
```

### 集成测试

**文件：** `src/core/render/__tests__/browser-manager.test.ts` (修改)

```typescript
describe('BrowserManager - 多浏览器支持', () => {
  it('应使用指定的浏览器启动', async () => {
    const manager = new BrowserManager('./test-session');
    await manager.launch('https://x.com/status/1', 'chrome');
    // 验证使用的是 chrome session
    expect(manager.getSessionDir()).toContain('session-chrome');
  });

  it('指定浏览器不存在时应抛异常', async () => {
    const manager = new BrowserManager('./test-session');
    await expect(manager.launch(undefined, 'chrome'))
      .rejects.toThrow('BROWSER_NOT_FOUND');
  });
});
```

---

## 文件清单

| 操作 | 文件路径 |
|------|----------|
| **新增** | `src/core/render/browser-selector.ts` |
| **新增** | `src/core/config/browser-config.ts` |
| **新增** | `src/core/render/__tests__/browser-selector.test.ts` |
| **修改** | `src/core/render/browser.ts` |
| **修改** | `src/core/errors.ts` (添加 BROWSER_NOT_FOUND) |
| **修改** | `src/cli/commands/archive.ts` (添加 --browser 选项) |
| **修改** | `src/core/types/index.ts` (添加 BrowserType) |

---

## 关键设计决策

### 为什么只支持 Chrome 和 Edge？

- **用户需求** - 项目主要用户使用这两个浏览器
- **简洁性** - 避免过度设计，YAGNI 原则
- **覆盖面** - Chrome 和 Edge 覆盖了大多数用户

### 为什么用户指定时不降级？

- **明确性** - 用户明确指定了浏览器，应该遵循其意图
- **可预测性** - 避免用户不知道使用的是哪个浏览器
- **调试友好** - 问题更容易定位

### 为什么 auto 模式优先 Edge？

- **兼容性** - 保持当前默认行为，不破坏现有用户体验
