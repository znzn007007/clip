# npm Publish Preparation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare the `article-clip` package for npm publish by updating package.json, documentation, and verification.

**Architecture:** Direct file modifications - package.json configuration, .npmignore update, new README files (English + Chinese), verification steps.

**Tech Stack:** npm, Node.js, TypeScript (build output)

---

## Task 1: Update package.json with new name and metadata

**Files:**
- Modify: `package.json`

**Step 1: Update package.json**

Replace the entire `package.json` content with:

```json
{
  "name": "article-clip",
  "version": "0.1.0",
  "description": "Local content archiver for Twitter/X, Zhihu, and WeChat Official Accounts",
  "main": "dist/index.js",
  "bin": {
    "article-clip": "./dist/cli/index.js"
  },
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "jest",
    "clip": "node dist/cli/index.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "dist",
    "README.md",
    "README_zh.md",
    "LICENSE"
  ],
  "keywords": [
    "cli",
    "archiver",
    "article",
    "twitter",
    "x",
    "zhihu",
    "wechat",
    "weixin",
    "markdown",
    "web-clipper",
    "content-saver"
  ],
  "author": "nemo",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/znzn007007/clip.git"
  },
  "homepage": "https://github.com/znzn007007/clip#readme",
  "bugs": {
    "url": "https://github.com/znzn007007/clip/issues"
  },
  "dependencies": {
    "playwright": "^1.48.0",
    "commander": "^12.0.0",
    "cheerio": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.1.0"
  }
}
```

**Changes:**
- `name`: `clip-client` -> `article-clip`
- `bin`: `clip` -> `article-clip`
- Added: `engines`, `files`, `repository`, `homepage`, `bugs`
- Updated: `keywords` with more terms

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json'))"`
Expected: No output (no error)

**Step 3: Build to ensure no issues**

Run: `npm run build`
Expected: Build succeeds, `dist/` updated

**Step 4: Commit**

```bash
git add package.json
git commit -m "feat: update package.json for npm publish

- Rename package: clip-client -> article-clip
- Add engines (node >=18), files, repository fields
- Update keywords for better discoverability
- Update bin command: clip -> article-clip
"
```

---

## Task 2: Update .npmignore

**Files:**
- Modify: `.npmignore`

**Step 1: Add exception for README_zh.md**

Find the section:
```
# 文档（除 README）
docs/
*.md
!README.md
```

Replace with:
```
# 文档（除 README）
docs/
*.md
!README.md
!README_zh.md
```

**Step 2: Commit**

```bash
git add .npmignore
git commit -m "chore: include README_zh.md in npm package"
```

---

## Task 3: Write README.md (English)

**Files:**
- Create: `README.md` (backup current as `README.dev.md` first)

**Step 1: Backup current README**

Run: `mv README.md README.dev.md`

**Step 2: Create new README.md**

```markdown
# Article Clip

Local content archiver for Twitter/X, Zhihu, and WeChat Official Accounts. Save web articles as Markdown with images.

## Features

- **Multi-platform support**: Twitter/X, Zhihu, WeChat Official Accounts
- **Smart deduplication**: Skip already archived content automatically
- **Batch processing**: Process multiple URLs at once
- **Asset downloading**: Automatically download images
- **Persistent sessions**: Save login state across runs
- **Browser flexibility**: Support for Chrome and Edge

## Prerequisites

- Node.js 18 or higher
- Chrome or Edge browser (for rendering pages)

## Installation

```bash
npm install -g article-clip
```

## Quick Start

```bash
# Archive a single URL
article-clip "https://x.com/user/status/123"

# Archive with custom output directory
article-clip "https://x.com/user/status/123" --out ~/my-clips

# Batch processing from file
article-clip --file urls.txt
```

## Output Structure

```
clips/
├── .archived.json           # Deduplication database
└── twitter/
    └── 2026/
        └── 01/
            └── 24/
                └── slug-hash/
                    ├── content.md
                    └── assets/
                        ├── 001.jpg
                        └── 002.png
```

## Commands

### Archive Single URL

```bash
article-clip "url"
```

### Batch Processing

```bash
article-clip --file urls.txt
article-clip --stdin  # Read URLs from stdin
```

### Install Browsers (Optional Fallback)

```bash
article-clip install-browsers
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--out <dir>` | Output directory | `./clips` |
| `--format <format>` | Output format (`md` or `md+html`) | `md` |
| `--browser <browser>` | Browser to use (`chrome`, `edge`, `auto`) | `auto` |
| `--no-assets` | Skip asset downloads | - |
| `--force` | Force overwrite existing archives | - |
| `--verbose` | Show detailed deduplication info | - |
| `--json` | Output JSON to stdout | - |
| `--jsonl` | Output JSONL stream (batch mode) | - |
| `--debug` | Save debug artifacts | - |

## Browser & Login

### First Run

When you first run `article-clip`, it will:
1. Open a browser window
2. Navigate to the platform (Twitter/Zhihu)
3. Wait for you to log in
4. Save your session for future runs

### Session Persistence

Login state is saved in:
- Chrome: `~/.article-clip/session-chrome/`
- Edge: `~/.article-clip/session-edge/`

Close the browser when prompted to save your session properly.

### Browser Selection

```bash
# Auto-detect (Edge -> Chrome fallback)
article-clip "url"

# Force Chrome
article-clip "url" --browser chrome

# Force Edge
article-clip "url" --browser edge
```

## Deduplication

Article Clip automatically skips already archived content:

```bash
# First run: archives the URL
article-clip "https://x.com/user/status/123"

# Second run: skips (already archived)
article-clip "https://x.com/user/status/123"
# Output: ⊘ Already archived: clips/twitter/2026/01/24/...

# Force re-archive
article-clip "https://x.com/user/status/123" --force
```

The `.archived.json` file in your output directory tracks all archived URLs.

## Supported Platforms

| Platform | URL Pattern | Notes |
|----------|-------------|-------|
| Twitter/X | `x.com/*`, `twitter.com/*` | Requires login for full content |
| Zhihu | `zhihu.com/*` | Answers and articles |
| WeChat | `mp.weixin.qq.com/*` | Official Account articles |

## Development

For development and contributing guidelines, see [README.dev.md](README.dev.md).

## License

MIT
```

**Step 3: Commit**

```bash
git add README.md README.dev.md
git commit -m "docs: write user-facing README.md for npm publish

- Clear installation and quick start
- Organized commands and options
- Browser and login guidance
- Deduplication explanation
- Link to dev README for contributors
"
```

---

## Task 4: Write README_zh.md (Chinese)

**Files:**
- Create: `README_zh.md`

**Step 1: Create README_zh.md**

```markdown
# Article Clip

本地内容归档工具，支持 Twitter/X、知乎、微信公众号。将网页文章保存为 Markdown 格式，自动下载图片。

## 特性

- **多平台支持**：Twitter/X、知乎、微信公众号
- **智能去重**：自动跳过已归档的内容
- **批量处理**：一次处理多个链接
- **资源下载**：自动下载图片
- **会话持久化**：保存登录状态，下次运行自动使用
- **浏览器灵活**：支持 Chrome 和 Edge

## 环境要求

- Node.js 18 或更高版本
- Chrome 或 Edge 浏览器（用于渲染网页）

## 安装

```bash
npm install -g article-clip
```

## 快速开始

```bash
# 归档单个链接
article-clip "https://x.com/user/status/123"

# 指定输出目录
article-clip "https://x.com/user/status/123" --out ~/my-clips

# 批量处理
article-clip --file urls.txt
```

## 输出结构

```
clips/
├── .archived.json           # 去重数据库
└── twitter/
    └── 2026/
        └── 01/
            └── 24/
                └── slug-hash/
                    ├── content.md
                    └── assets/
                        ├── 001.jpg
                        └── 002.png
```

## 命令

### 归档单个链接

```bash
article-clip "链接"
```

### 批量处理

```bash
article-clip --file urls.txt
article-clip --stdin  # 从标准输入读取链接
```

### 安装浏览器（可选备用方案）

```bash
article-clip install-browsers
```

## 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--out <目录>` | 输出目录 | `./clips` |
| `--format <格式>` | 输出格式 (`md` 或 `md+html`) | `md` |
| `--browser <浏览器>` | 使用浏览器 (`chrome`, `edge`, `auto`) | `auto` |
| `--no-assets` | 跳过资源下载 | - |
| `--force` | 强制覆盖已存在的归档 | - |
| `--verbose` | 显示详细去重信息 | - |
| `--json` | 输出 JSON 到标准输出 | - |
| `--jsonl` | 输出 JSONL 流（批量模式） | - |
| `--debug` | 保存调试信息 | - |

## 浏览器与登录

### 首次运行

第一次运行 `article-clip` 时：
1. 会打开浏览器窗口
2. 导航到相应平台（Twitter/知乎）
3. 等待你登录
4. 保存会话供以后使用

### 会话持久化

登录状态保存在：
- Chrome: `~/.article-clip/session-chrome/`
- Edge: `~/.article-clip/session-edge/`

请在提示时关闭浏览器，以正确保存会话。

### 浏览器选择

```bash
# 自动检测（Edge -> Chrome 降级）
article-clip "链接"

# 强制使用 Chrome
article-clip "链接" --browser chrome

# 强制使用 Edge
article-clip "链接" --browser edge
```

## 去重机制

Article Clip 自动跳过已归档的内容：

```bash
# 第一次运行：归档该链接
article-clip "https://x.com/user/status/123"

# 第二次运行：跳过（已归档）
article-clip "https://x.com/user/status/123"
# 输出：⊘ Already archived: clips/twitter/2026/01/24/...

# 强制重新归档
article-clip "https://x.com/user/status/123" --force
```

输出目录中的 `.archived.json` 文件记录所有已归档的链接。

## 支持的平台

| 平台 | 链接格式 | 说明 |
|------|----------|------|
| Twitter/X | `x.com/*`, `twitter.com/*` | 需要登录获取完整内容 |
| 知乎 | `zhihu.com/*` | 支持回答和文章 |
| 微信公众号 | `mp.weixin.qq.com/*` | 公众号文章 |

## 开发

开发与贡献指南请参考 [README.dev.md](README.dev.md)。

## 许可证

MIT
```

**Step 2: Commit**

```bash
git add README_zh.md
git commit -m "docs: add Chinese README (README_zh.md)

Complete Chinese translation of user documentation.
"
```

---

## Task 5: Verify LICENSE file

**Files:**
- Verify: `LICENSE`

**Step 1: Check LICENSE content**

Run: `head -5 LICENSE`
Expected: MIT License text

**Step 2: Verify matches package.json**

Run: `grep '"license"' package.json`
Expected: `"license": "MIT"`

If both match, no action needed. If not, update to match.

---

## Task 6: Verify shebang in CLI entry point

**Files:**
- Verify: `src/cli/index.ts`

**Step 1: Check shebang exists**

Run: `head -1 src/cli/index.ts`
Expected: `#!/usr/bin/env node`

Already exists, no action needed.

---

## Task 7: Build and verify package contents

**Step 1: Build the project**

Run: `npm run build`
Expected: TypeScript compiles successfully, `dist/` directory updated

**Step 2: Verify CLI shebang in compiled output**

Run: `head -1 dist/cli/index.js`
Expected: `#!/usr/bin/env node`

**Step 3: Dry-run npm pack**

Run: `npm pack --dry-run`
Expected output:
```
npm notice
npm notice 📦 article-clip@0.1.0
npm notice === Tarball Contents ===
npm notice 1.2kB  dist/cli/index.js
npm notice ... (more dist files)
npm notice 1.5kB  README.md
npm notice 1.5kB  README_zh.md
npm notice 1.1kB  LICENSE
npm notice === Tarball Contents ===
...
npm notice === Package Metadata ===
npm notice name: article-clip
...
```

**Verify:**
- Package name is `article-clip`
- `dist/` files are included
- `README.md` and `README_zh.md` are included
- `LICENSE` is included
- Source files (`src/`, tests) are NOT included

**Step 4: Clean up dry-run tarball**

Run: `rm -f article-clip-*.tgz` (if created)

**Step 5: Commit final verification**

```bash
git add -A
git commit -m "chore: verify npm package preparation

- Built dist/ successfully
- Verified package contents with npm pack --dry-run
- Confirmed shebang in CLI entry point
- Package includes: dist/, README.md, README_zh.md, LICENSE
- Package excludes: src/, tests, docs/, .git/
"
```

---

## Task 8: Create publish preparation summary

**Files:**
- Create: `docs/npm-publish-checklist.md`

```markdown
# npm Publish Checklist

**Date:** 2026-01-24
**Package:** article-clip@0.1.0

## Completed Preparation

- [x] Package name updated to `article-clip`
- [x] package.json: added engines, files, repository, homepage, bugs
- [x] package.json: keywords updated
- [x] CLI command renamed: `clip` -> `article-clip`
- [x] .npmignore: includes README_zh.md
- [x] README.md: User-facing documentation (English)
- [x] README_zh.md: User-facing documentation (Chinese)
- [x] README.dev.md: Developer documentation (preserved)
- [x] LICENSE: MIT license verified
- [x] Shebang: Present in `dist/cli/index.js`
- [x] Build: Successful
- [x] npm pack --dry-run: Verified contents

## Before Publishing

1. **Create npm account** (if not exists)
   - Visit https://www.npmjs.com/signup
   - Verify email

2. **Login to npm**
   ```bash
   npm login
   ```

3. **Final verification**
   ```bash
   npm pack --dry-run
   # Review the output carefully
   ```

4. **Publish**
   ```bash
   npm publish --access public
   ```

5. **Verify installation**
   ```bash
   npm install -g article-clip
   article-clip --help
   ```

## Post-Publish

- [ ] Update GitHub repository description
- [ ] Add npm badge to README
- [ ] Create GitHub release (optional)
```

**Commit:**

```bash
git add docs/npm-publish-checklist.md
git commit -m "docs: add npm publish checklist

Step-by-step guide for actual npm publishing process.
"
```

---

## Summary

This plan prepares `article-clip` for npm publishing by:

1. **Updating package.json** with proper metadata and configuration
2. **Updating .npmignore** to include Chinese README
3. **Writing README.md** (English) focused on end users
4. **Writing README_zh.md** (Chinese) translation
5. **Verifying LICENSE and shebang**
6. **Building and validating** the package with `npm pack --dry-run`
7. **Creating publish checklist** for future reference

**Total estimated time:** 30-45 minutes

**Files to modify/create:**
- `package.json` (modify)
- `.npmignore` (modify)
- `README.md` (backup current, create new)
- `README.dev.md` (backup of old README)
- `README_zh.md` (create)
- `docs/npm-publish-checklist.md` (create)
