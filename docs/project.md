# Project Overview

**Project:** Article Clip (CLI)
**Version:** 0.1.0
**Last Updated:** 2026-02-03
**Status:** Active (~97% complete)

## Purpose

Local content archiver for Twitter/X, Zhihu, and WeChat Official Accounts. Save web articles as Markdown (optionally HTML) with assets downloaded for offline use. Designed to be callable by AI skills and scripts via JSON/JSONL output.

## Goals

- Archive a URL to local Markdown + assets.
- Support batch processing with retry and deduplication.
- Provide JSON/JSONL output for automation.
- Use Playwright with persistent sessions for reliability.

## Non-Goals

- Bypassing paywalls or access controls.
- Site search, publishing, or content distribution.
- Cloud sync or multi-user collaboration.

## Supported Platforms

- Twitter/X (`x.com`, `twitter.com`)
- Zhihu (`zhihu.com`)
- WeChat Official Accounts (`mp.weixin.qq.com`)

## Sessions

Login state is stored in OS app data directories:
- Windows: `%LOCALAPPDATA%\article-clip\session-chrome` / `%LOCALAPPDATA%\article-clip\session-edge`
- macOS: `~/Library/Application Support/article-clip/session-chrome` / `~/Library/Application Support/article-clip/session-edge`
- Linux: `$XDG_DATA_HOME/article-clip/session-chrome` / `$XDG_DATA_HOME/article-clip/session-edge` (fallback `~/.local/share/article-clip/...`)

## CLI Summary

- Archive single URL: `article-clip "url"`
- Batch from file: `article-clip --file urls.txt`
- Optional browser install: `article-clip install-browsers`

## Output Structure

```
clips/
├── .archived.json
└── twitter/
    └── YYYY/
        └── MM/
            └── DD/
                └── slug-hash/
                    ├── content.md
                    └── assets/
```

## Current Status

Recent completed:
- Asset downloading with retries and tracking
- Batch processing with JSONL output
- WeChat adapter
- Twitter long-form and thread extraction improvements
- Two-level dedupe system
- Chrome/Edge multi-browser support

Pending tasks (top):
- Configuration file support (`clip.config.json`, user config)
- Queue command implementation
- Zhihu raw state parsing and tests

## npm Publish Checklist

Before publishing:
- Verify repository URLs in `package.json`.
- `npm login`
- `npm run build`
- `npm pack --dry-run`
- `npm publish --access public`

Post publish:
- Install check: `npm install -g article-clip` and `article-clip --help`
- Add npm badge to README (optional)
- Create GitHub release (optional)
