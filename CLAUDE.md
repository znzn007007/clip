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

# Batch processing with deduplication
npm run build
node dist/cli/index.js --file urls.txt

# Force override (re-archive existing content)
npm run build
node dist/cli/index.js once "https://x.com/user/status/123" --force

# Verbose mode (show detailed deduplication info)
npm run build
node dist/cli/index.js once "https://x.com/user/status/123" --verbose

# Install Playwright browsers (optional fallback)
node dist/cli/index.js install-browsers
```

## Development Guidelines

### Test-Driven Development (TDD)

**CRITICAL**: All feature development MUST follow TDD:

1. **Write tests first** - Create test cases before implementing functionality
2. **Run tests to verify failure** - Tests should fail initially (red)
3. **Implement minimal code** - Write just enough code to pass tests
4. **Run tests to verify success** - Tests should pass (green)
5. **Refactor** - Clean up code while keeping tests green

**Test file locations:**
- Place tests next to source files: `src/path/to/file.ts` → `src/path/to/__tests__/file.test.ts`
- Or co-located: `src/path/to/file.test.ts`

**Example workflow:**
```bash
# 1. Create test file first
touch src/core/extract/adapters/wechat/__tests__/index.test.ts

# 2. Write test cases (describe expected behavior)
# 3. Run tests (expect failures)
npm test -- wechat

# 4. Implement adapter code
# 5. Run tests again (expect success)
npm test

# 6. Refactor if needed
```

## Architecture Overview

The codebase follows a **pipeline architecture** with five main layers:

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                             │
│  (src/cli/) - Commands: once, batch, install-browsers       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Orchestrator Layer                         │
│  (src/core/orchestrator.ts) - ClipOrchestrator              │
│  Coordinates: dedupe → browser → render → extract → export   │
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
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │   Dedupe Layer       │
                                    │ (src/core/dedupe/)   │
                                    │                      │
                                    │ • DedupeManager      │
                                    │ • Strategy functions │
                                    │ • Archive database   │
                                    └──────────────────────┘
```

## Key Data Flow

1. **URL → Dedupe Check (Level 1)**: `DedupeManager` checks if URL already archived (before browser launch)
2. **URL → RenderedPage**: `PageRenderer` uses Playwright to load page, waits for content, extracts raw data and HTML
3. **RenderedPage → ClipDoc**: `Adapter` (Twitter/Zhihu/WeChat) parses content into structured blocks
4. **ClipDoc → Dedupe Check (Level 2)**: `DedupeManager` checks by canonical URL (after extraction)
5. **ClipDoc → Markdown/JSON**: Exporters generate final output files
6. **Success → Archive Record**: `DedupeManager` adds record to `.archived.json`

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

### Deduplication Strategy

The deduplication system uses **two-level checking** to efficiently avoid re-archiving content:

**Level 1 Check** (pre-render):
- Uses normalized URL (hash removed)
- Fast check that avoids expensive browser operations
- Performed in `ClipOrchestrator.archive()` before launching browser

**Level 2 Check** (post-extraction):
- Uses `canonicalUrl` when available (more accurate)
- Catches duplicates with different URLs pointing to same content
- Performed after adapter extracts the document

**Dedupe Key Priority:**
```typescript
// In src/core/dedupe/strategy.ts
getDedupeKey(doc): string {
  return doc.canonicalUrl || normalizeUrl(doc.sourceUrl);
}
```

**Storage Location:**
- File: `<output-dir>/.archived.json`
- Format: JSON with versioning support
- Tracks: firstSeen, lastUpdated, path, platform

**CLI Options:**
- `--force`: Override existing archive (deletes old record, creates new one)
- `--verbose`: Show detailed deduplication information during processing

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

1. ~~Asset downloading not implemented~~ - ✅ Completed (2026-01-18)
2. **Zhihu parseFromRawState** is stub (returns null)
3. **CDP connection** option exists but not fully implemented in `BrowserManager`
4. **Browser hardcoding** - only works with Edge currently
5. **Image position** - Twitter images appear at end of document instead of inline (2026-01-19)

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
