# npm Publish Preparation Design

**Date:** 2026-01-24
**Status:** Approved
**Author:** nemo

---

## Overview

Prepare the `article-clip` package for npm publish. This design covers package.json updates, documentation, and verification steps.

**Note:** This is preparation only. Actual publishing will be done separately.

---

## Package Name

- **New name:** `article-clip`
- **Old name:** `clip-client`
- **Reason:** More descriptive, available on npm

---

## 1. package.json Changes

### Required Fields to Add

```json
{
  "name": "article-clip",
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "dist",
    "README.md",
    "README_zh.md",
    "LICENSE"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/znzn007007/clip.git"
  },
  "homepage": "https://github.com/znzn007007/clip#readme",
  "bugs": {
    "url": "https://github.com/znzn007007/clip/issues"
  },
  "keywords": [
    "cli",
    "archiver",
    "article",
    "twitter",
    "zhihu",
    "wechat",
    "markdown",
    "web-clipper",
    "content-saver"
  ]
}
```

**Field Descriptions:**
- `engines`: Minimum Node.js version requirement
- `files`: Files to include in npm package (excludes source, tests, etc.)
- `repository`: Git repository URL
- `homepage`: Project homepage
- `bugs`: Issue tracker URL
- `keywords`: Search terms for npm discoverability

---

## 2. README Structure

### README.md (English)

```markdown
# Article Clip

Local content archiver for Twitter/X, Zhihu, and WeChat Official Accounts.
Save web articles as Markdown with images.

## Features

- Multi-platform support
- Smart deduplication
- Batch processing
- Asset downloading
- Persistent sessions

## Installation

npm install -g article-clip

## Quick Start

[Usage examples]

## Commands

[Command list]

## Options

[Option descriptions]

## Browser & Login

[Browser setup and login info]

## Development

[Contributing guide for developers]
```

### README_zh.md (Chinese)

Same structure, translated to Chinese.

**Rationale:**
- Dual-language approach serves wider audience
- Prioritizes regular users, developers section at the end
- No screenshots initially (can be added later)

---

## 3. .npmignore Update

Add exception for Chinese README:

```
# Preserve Chinese README
!README_zh.md
```

---

## 4. Other Checklist Items

- [ ] Verify LICENSE file (MIT)
- [ ] Check shebang in `dist/cli/index.js` (`#!/usr/bin/env node`)
- [ ] Run `npm pack --dry-run` to verify package contents

---

## Implementation Tasks

1. Update `package.json` with new name and fields
2. Update `.npmignore` to include `README_zh.md`
3. Write new `README.md` (English)
4. Write new `README_zh.md` (Chinese)
5. Verify with `npm pack --dry-run`
