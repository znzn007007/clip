# Clip Client 架构设计文档

- 版本：V0.2
- 日期：2026-01-17
- 负责人：nemo

## 1. 项目概述

Clip Client 是一个本地内容归档工具，通过 NPM 发布，支持 Twitter、知乎、公众号的内容归档为本地 Markdown 文件。

**核心目标：**
- 单条/批量 URL 归档为 Markdown + assets
- 支持长线程、长文章等复杂内容
- 提供 JSON/JSONL 索引供 AI 集成
- 基于 Playwright 的渲染抓取

## 2. 开发优先级

**第一迭代（M1 - Twitter 基础版）**
- clip once 单条归档
- Twitter adapter（含长线程、长文章）
- 图片下载与落盘
- Markdown + JSON 输出
- 基础错误处理（重试次数初始为 0）

**第二迭代（M2 - 队列与批量）**
- clip add、list、run
- 本地去重机制
- 失败重试策略
- JSONL 流式输出

**第三迭代（M3 - 其他平台）**
- 知乎 adapter
- 公众号 adapter

## 3. 项目结构

```
clip/
├── src/
│   ├── cli/                    # CLI 入口与命令定义
│   │   ├── index.ts           # CLI 主入口
│   │   ├── commands/          # 各命令实现
│   │   │   ├── once.ts
│   │   │   ├── run.ts
│   │   │   ├── add.ts
│   │   │   ├── list.ts
│   │   │   └── install-browsers.ts
│   │   └── utils.ts           # CLI 辅助函数
│   │
│   ├── core/                   # 核心业务逻辑
│   │   ├── render/            # 渲染层 - Playwright 抓取
│   │   │   ├── browser.ts     # 浏览器管理
│   │   │   ├── page.ts        # 页面加载与渲染
│   │   │   └── types.ts       # RenderedPage 类型
│   │   │
│   │   ├── extract/           # 提取层 - HTML 解析
│   │   │   ├── adapters/      # 平台适配器
│   │   │   │   ├── base.ts    # 适配器基类
│   │   │   │   ├── twitter.ts # Twitter 适配器
│   │   │   │   ├── zhihu.ts
│   │   │   │   └── wechat.ts
│   │   │   ├── types.ts       # ClipDoc, Block 类型
│   │   │   └── registry.ts    # 适配器注册与路由
│   │   │
│   │   ├── export/            # 导出层 - 文件写入
│   │   │   ├── markdown.ts    # Markdown 生成
│   │   │   ├── assets.ts      # 资源下载与重写
│   │   │   ├── json.ts        # JSON/JSONL 输出
│   │   │   └── types.ts       # ExportResult 类型
│   │   │
│   │   ├── queue/             # 队列管理（M2）
│   │   │   ├── store.ts       # 队列存储
│   │   │   ├── processor.ts   # 任务处理器
│   │   │   └── dedupe.ts      # 去重逻辑
│   │   │
│   │   └── errors.ts          # 错误类型与错误码
│   │
│   └── config/                # 配置管理
│       ├── constants.ts       # 常量定义
│       └── defaults.ts        # 默认参数
│
├── package.json
├── README.md
└── tsconfig.json
```

## 4. 核心架构

### 4.1 分层设计

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLI 层                                                              │
│  - 解析命令行参数                                                     │
│  - 编排核心流程                                                       │
│  - 输出结果                                                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  RENDER 层 - Playwright 渲染                                         │
│  输入：URL                                                           │
│  输出：RenderedPage { html, title, canonicalUrl, platform }          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  EXTRACT 层 - 内容提取                                                │
│  输入：RenderedPage                                                   │
│  输出：ClipDoc { platform, blocks, assets, metadata }                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  EXPORT 层 - 文件导出                                                  │
│  输入：ClipDoc                                                        │
│  输出：ExportResult { paths, stats, diagnostics }                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 数据流

```
CLI: clip once "https://x.com/user/status/123"
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  RENDER 层                                                           │
│  BrowserManager.launchBrowser() → PageRenderer.render(url)          │
│  - 启动 Playwright（优先系统 Chrome）                                │
│  - 加载已保存会话                                                     │
│  - Twitter: 滚动展开线程（仅原作者推文）                               │
│  - 输出: RenderedPage                                                │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  EXTRACT 层                                                          │
│  AdapterRegistry.select() → TwitterAdapter.extract()                │
│  - 解析 HTML 提取元数据                                               │
│  - 识别内容类型（推文/线程/长文章）                                    │
│  - 转换为 Block[]                                                    │
│  - 收集图片 assets                                                   │
│  - 输出: ClipDoc                                                     │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  EXPORT 层                                                           │
│  AssetDownloader → MarkdownGenerator → JsonExporter                 │
│  - 在浏览器上下文下载图片（避免防盗链）                                │
│  - 生成 Markdown（front matter + 内容）                               │
│  - 重写图片链接为 ./assets/xxx                                       │
│  - 输出: ExportResult                                                │
└─────────────────────────────────────────────────────────────────────┘
```

## 5. Twitter Adapter 设计

### 5.1 内容类型识别

| 类型 | 判断依据 | 处理策略 |
|------|---------|---------|
| 单条推文 | 无"显示更多线程"按钮 | 直接提取 |
| 线程 | 有"显示更多 N 条推文" | 滚动展开，仅提取原作者 |
| 长文章 | URL 包含 `/notes/` | 作为单篇文章提取 |
| 引用推文 | 包含"引用推文"区块 | 转换为链接引用 block |

### 5.2 线程处理策略

- 自动滚动加载直到线程完全展开
- 仅抓取原作者的推文，排除他人回复
- 按时间顺序拼接所有推文内容
- 引用推文转换为链接引用

### 5.3 Block 类型映射

| Twitter 元素 | Block 类型 | Markdown 输出 |
|-------------|-----------|--------------|
| 推文正文 | paragraph | 纯文本 |
| 图片 | image | `![](./assets/xxx.jpg)` |
| 引用推文 | quote | `> 来自 @user: [查看原推](url)` |
| 链接卡片 | link | `[标题](url)` |
| 视频 | video | `[视频: 缩略图](url) + 警告` |

### 5.4 线程处理伪代码

```typescript
async extractThread(html: string): Promise<Block[]> {
  const blocks: Block[] = [];
  const author = this.extractAuthor(html);

  // 滚动直到线程完全加载
  while (hasMoreTweets()) {
    await scrollDown();
    await waitForLoad();
  }

  // 选择所有推文，过滤仅原作者
  const tweets = $$('[data-testid="tweet"]')
    .filter(el => el.author === author);

  // 按时间顺序拼接
  for (const tweet of tweets) {
    blocks.push(...this.extractTweetBlocks(tweet));
  }

  return blocks;
}
```

## 6. 数据结构与类型

### 6.1 RenderedPage（渲染层输出）

```typescript
interface RenderedPage {
  url: string;
  canonicalUrl?: string;
  title?: string;
  html: string;
  platform: 'twitter' | 'zhihu' | 'wechat' | 'unknown';
  screenshotPath?: string;  // debug 模式
  debugHtmlPath?: string;   // debug 模式
}
```

### 6.2 ClipDoc（提取层输出）

```typescript
type Block =
  | { type: 'paragraph'; content: string }
  | { type: 'heading'; level: number; content: string }
  | { type: 'quote'; content: string; author?: string }
  | { type: 'code'; content: string; language?: string }
  | { type: 'list'; items: string[]; ordered: boolean }
  | { type: 'image'; url: string; alt: string }
  | { type: 'link'; url: string; title: string };

interface ClipDoc {
  platform: string;
  sourceUrl: string;
  canonicalUrl?: string;
  title: string;
  author?: string;
  publishedAt?: string;  // ISO 8601
  fetchedAt: string;     // ISO 8601
  blocks: Block[];
  assets: {
    images: Array<{ url: string; alt: string; filenameHint?: string }>;
  };
}
```

### 6.3 ExportResult（导出层输出）

```typescript
interface ExportResult {
  status: 'success' | 'failed';
  platform: string;
  canonical_url?: string;
  title?: string;
  paths?: {
    markdown_path: string;
    html_path?: string;      // 可选
    assets_dir: string;
  };
  meta?: {
    author?: string;
    published_at?: string;
    fetched_at: string;
  };
  stats?: {
    word_count: number;
    image_count: number;
  };
  diagnostics?: {
    warnings: string[];
    error?: {
      code: ErrorCode;
      message: string;
      retryable: boolean;
      suggestion?: string;
    };
  };
}
```

## 7. 输出格式

### 7.1 Markdown Front Matter

```yaml
---
title: "推文标题"
source_url: "https://x.com/user/status/123"
canonical_url: "https://x.com/user/status/123"
platform: twitter
author: "@username"
published_at: "2026-01-17T10:00:00Z"
fetched_at: "2026-01-17T12:00:00Z"
tags: []
---

# 正文内容
```

### 7.2 JSON/JSONL 关系

| 维度 | Markdown | JSON |
|------|----------|------|
| 目标受众 | 人类阅读 | AI/脚本消费 |
| 包含内容 | 完整文章内容 + front matter | 仅元数据，不含正文 |
| 使用场景 | Obsidian 阅读、个人知识库 | 自动化索引、批量处理、AI 工作流 |

**批量场景：**

```
batch_output.jsonl (索引文件)
├── { "markdown_path": "twitter/2026/0117/abc123/content.md", ... }
├── { "markdown_path": "zhihu/2026/0117/def456/content.md", ... }
└── ...

twitter/2026/0117/abc123/         (实际内容)
├── content.md
└── assets/
    ├── 001.jpg
    └── 002.jpg
```

### 7.3 输出目录结构

```
clips/
├── twitter/
│   └── 2026/
│       └── 0117/
│           └── abc123/
│               ├── content.md
│               └── assets/
│                   ├── 001.jpg
│                   └── 002.png
├── zhihu/
└── wechat/
```

## 8. 错误处理

### 8.1 错误码定义

```typescript
enum ErrorCode {
  // Render 层错误
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  LOGIN_REQUIRED = 'login_required',

  // Extract 层错误
  DOM_CHANGED = 'dom_changed',
  EXTRACT_FAILED = 'extract_failed',

  // Export 层错误
  ASSET_DOWNLOAD_FAILED = 'asset_download_failed',
  EXPORT_FAILED = 'export_failed',

  // 业务错误
  RATE_LIMITED = 'rate_limited',
  INVALID_URL = 'invalid_url',
  UNSUPPORTED_PLATFORM = 'unsupported_platform',
}
```

### 8.2 重试策略（初始为 0，调试后启用）

| 错误码 | 可重试 | 默认重试次数 |
|-------|--------|-------------|
| network_error | 是 | 0 → 3 |
| timeout | 是 | 0 → 2 |
| login_required | 否 | 0 |
| rate_limited | 是 | 0 → 3 |
| dom_changed | 否 | 0 |
| asset_download_failed | 是 | 0 → 2 |
| export_failed | 否 | 0 |

### 8.3 错误输出格式

```json
{
  "status": "failed",
  "platform": "twitter",
  "canonical_url": "https://x.com/...",
  "error": {
    "code": "login_required",
    "message": "此内容需要登录后才能查看",
    "retryable": false,
    "suggestion": "请使用 clip install-browsers 后在浏览器中登录"
  }
}
```

## 9. CLI 设计（M1 范围）

### 9.1 命令列表

```bash
# 安装 Playwright 浏览器（可选，作为 fallback）
clip install-browsers

# 单条归档
clip once <url> [options]
```

### 9.2 选项说明

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--out <dir>` | 输出目录 | `./clips` |
| `--format md\|md+html` | 输出格式 | `md` |
| `--json` | 输出 JSON 到 stdout | false |
| `--debug` | 保存截图和 debug html | false |
| `--no-assets` | 跳过资源下载 | false |

### 9.3 使用示例

```bash
# 基础用法
clip once "https://x.com/user/status/123"

# 指定输出目录
clip once "https://x.com/user/status/123" --out ~/my-clips

# 仅获取元数据，不下载图片
clip once "https://x.com/user/status/123" --json --no-assets

# 调试模式
clip once "https://x.com/user/status/123" --debug
```

### 9.4 输出示例

```bash
$ clip once "https://x.com/user/status/123"

✓ Rendered page
✓ Extracted 5 tweets, 2 images
✓ Downloaded assets
✓ Exported to: twitter/2026/0117/abc123/

{
  "status": "success",
  "platform": "twitter",
  "title": "...",
  "paths": {
    "markdown_path": "twitter/2026/0117/abc123/content.md",
    "assets_dir": "twitter/2026/0117/abc123/assets"
  },
  "stats": {
    "word_count": 320,
    "image_count": 2
  },
  "fetched_at": "2026-01-17T12:00:00Z"
}
```

## 10. 浏览器依赖策略

### 10.1 优先使用系统浏览器

```typescript
// 启动时优先尝试系统浏览器
const browser = await playwright.chromium.launch({
  channel: 'chrome',  // 优先使用系统 Chrome
  headless: true
}).catch(async () => {
  // 失败时回退到 Playwright 浏览器
  return await playwright.chromium.launch({ headless: true });
});
```

### 10.2 策略说明

- 大多数用户无需额外安装，直接用系统 Chrome
- `clip install-browsers` 作为可选的 fallback
- 兼顾便利性和版本兼容性

## 11. 技术栈

| 组件 | 技术选型 |
|------|---------|
| 语言 | TypeScript |
| 运行时 | Node.js |
| 浏览器自动化 | Playwright |
| CLI 框架 | Commander.js 或 CAC |
| 队列存储 | 本地文件 (M2) |

## 12. 待确认事项

- [ ] 知乎、公众号的具体需求细节
- [ ] M2 队列存储的具体实现方式
- [ ] 是否需要本地 SQLite 索引（P1 功能）
