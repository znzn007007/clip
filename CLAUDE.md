# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Build TypeScript to dist/
npm run build

# Watch mode for development
npm run dev

# Run tests
npm test

# Run the CLI (after building)
npm run build
node dist/cli/index.js once "https://x.com/user/status/123"

# Install Playwright browsers (optional fallback)
node dist/cli/index.js install-browsers
```

## Architecture Overview

The codebase follows a **pipeline architecture** with four main layers:

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                             │
│  (src/cli/) - Commands: once, install-browsers              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Orchestrator Layer                         │
│  (src/core/orchestrator.ts) - ClipOrchestrator              │
│  Coordinates: browser → render → extract → export            │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        ▼                                     ▼
┌─────────────────────┐            ┌──────────────────────┐
│   Render Layer       │            │   Extract Layer      │
│  (src/core/render/)  │            │ (src/core/extract/)  │
│                      │            │                      │
│ • BrowserManager     │            │ • AdapterRegistry    │
│ • PageRenderer       │            │ • BaseAdapter        │
│   - Playwright       │            │ • TwitterAdapter     │
│   - waitUntil:'load' │            │ • ZhihuAdapter       │
│                      │            │ • WeChatAdapter      │
│   - 3s delay for SPA │            │                      │
└─────────────────────┘            │ • Multi-source        │
                                     │   extraction:       │
                                     │   - window.__STATE__│
                                     │   - DOM selectors  │
                                     │   - cheerio HTML   │
                                     └──────────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │    Export Layer      │
                                    │ (src/core/export/)   │
                                    │                      │
                                    │ • MarkdownGenerator  │
                                    │ • AssetDownloader    │
                                    │ • PathGenerator      │
                                    └──────────────────────┘
```

## Key Data Flow

1. **URL → RenderedPage**: `PageRenderer` uses Playwright to load page, waits for content, extracts raw data and HTML
2. **RenderedPage → ClipDoc**: `Adapter` (Twitter/Zhihu/WeChat) parses content into structured blocks
3. **ClipDoc → Markdown/JSON**: Exporters generate final output files

## Critical Implementation Details

### Twitter Adapter Multi-Source Extraction

Twitter/X uses heavily JS-driven rendering. The adapter tries extraction in priority order:

1. `page.rawData` (from `TwitterRawExtractor`) - searches `window.__STATE__`, `__INITIAL_STATE__`, script tags
2. `TwitterDomExtractor` - uses `page.evaluate()` to extract from DOM
3. Cheerio HTML parsing as final fallback

**Important**: Twitter long-form tweets may not have `[data-testid="tweetText"]`. The DOM extractor has fallback methods for `longformRichTextComponent`.

### Page Rendering Strategy

`src/core/render/page.ts`:
- Uses `waitUntil: 'load'` (not `commit` or `networkidle`)
- Adds 3 second fixed delay for SPA content
- Waits for `article, main, [role="main"]` selector with 10s timeout
- Twitter-specific: scrolls to load thread content

### Browser Strategy (TODO: Refactor)

Currently hardcoded to `channel: 'msedge'` in `BrowserManager`. For open-source compatibility, needs:
1. Playwright Chromium as default
2. System browsers (Chrome/Edge) as fallback
3. `--browser` CLI option

### Adapter Pattern

All adapters extend `BaseAdapter`:
- `canHandle(url)`: checks if URL matches adapter's domains
- `extract(page)`: returns `ExtractResult` with `doc` and `warnings`
- `cleanText(text)`: utility for text normalization

### Type System

Core types in `src/core/types/index.ts`:
- `ClipDoc`: unified document format
- `Block`: union type for all content blocks (paragraph, heading, image, link, video, tweet_meta, hashtag, etc.)
- Each adapter produces `ClipDoc` → exporter consumes it

### Error Handling

- `ClipError` with `ErrorCode` enum in `src/core/errors.ts`
- Platform-specific errors extend base (e.g., `TwitterExtractError`, `ZhihuExtractError`)
- Errors include retryable flag and user-facing suggestions

## Known Issues

1. **Asset downloading not implemented** - `AssetDownloader.downloadImages()` only returns mappings, doesn't download files
2. **Zhihu parseFromRawState** is stub (returns null)
3. **CDP connection** option exists but not implemented in `BrowserManager`
4. **Browser hardcoding** - only works with Edge currently

## Platform-Specific Notes

### Twitter/X
- Domains: `x.com`, `twitter.com`
- Auth detection: checks for `auth_token` cookie
- Long-form tweets use different DOM structure
- Output includes tweet metadata (likes, retweets, replies, views)

### Zhihu
- Domains: `zhihu.com`
- Anti-bot: error code 40362 ("您当前请求存在异常，暂时限制本次访问")
- Supports answer pages and article pages

### WeChat Official Account
- Domains: `mp.weixin.qq.com`
- Primary selectors: `.rich_media_title`, `#js_content`, `.rich_media_meta_text`
- Author preference: `#js_name` / `.profile_nickname` → script `nickname` → meta author
- `published_at` parsed when available; otherwise omitted

## Documentation Guidelines

### Daily Report Files

**Location:** `docs/dailyReport/`

**Naming Rule:** `YYYY-MM-DD-summary.md` (e.g., `2026-01-18-summary.md`)

**Rules:**
1. **Create a new file for each day** - Never append to or modify previous day's file
2. **Never rename existing files** - Historical files must keep their original names
3. **Date must match the actual work date** - Use the current date when creating

**Purpose:** Maintain a chronological record of daily progress and issues.
