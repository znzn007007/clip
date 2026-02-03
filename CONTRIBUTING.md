# Clip Client

Local content archiver for Twitter, Zhihu, and WeChat Official Accounts.

## Prerequisites

- Node.js 18 or higher

## Installation

### For Users (Coming Soon)

```bash
npm install -g clip-client
```

### For Development

```bash
git clone <repo>
cd clip
npm install
npm run build
npm link  # Optional: for local testing
```

## Browser Setup

The tool uses your system Chrome by default. If needed, install Playwright browsers:

```bash
clip install-browsers
```

## Quick Start

```bash
# Archive a single URL
clip once "https://x.com/user/status/123"

# Archive a WeChat Official Account article
clip once "https://mp.weixin.qq.com/s/xxxx"

# Specify output directory
clip once "https://x.com/user/status/123" --out ~/my-clips

# Output JSON metadata
clip once "https://x.com/user/status/123" --json

# Skip asset downloads
clip once "https://x.com/user/status/123" --no-assets

# Debug mode (save screenshots and HTML)
clip once "https://x.com/user/status/123" --debug

# Deduplication (skip already archived content)
clip once "https://x.com/user/status/123"  # Skips if already archived

# Force overwrite (re-archive existing content)
clip once "https://x.com/user/status/123" --force

# Verbose mode (show detailed deduplication info)
clip once "https://x.com/user/status/123" --verbose

# Batch processing with deduplication
clip --file urls.txt  # Automatically skips duplicates
```

## Output Structure

```
clips/
├── .archived.json           # Deduplication database
└── twitter/
    └── 2026/
        └── 0117/
            └── slug-hash/
                ├── content.md
                └── assets/
                    ├── 001.jpg
                    └── 002.png
```

**Deduplication:**
- The `.archived.json` file tracks all archived URLs to prevent duplicates
- Stored in the output directory, one file per archive collection
- Uses canonical URL when available, otherwise normalized source URL

## Contributing

### Project Structure

- Source: `src/` (CLI in `src/cli/`, core pipeline in `src/core/`)
- Tests: `src/**/__tests__/**/*.test.ts`
- Build output: `dist/`
- Runtime output: `clips/` (debug artifacts in `debug/`)
- Docs: `docs/` (daily reports in `docs/dailyReport/`)

### Commands

- `npm run build` compiles TypeScript to `dist/`.
- `npm run dev` runs TypeScript in watch mode.
- `npm test` runs Jest (`ts-jest`).

### Style & Naming

- TypeScript ESM with `.js` import specifiers (even in `.ts`).
- 2-space indentation, semicolons, strict type checking.
- `PascalCase` for classes, `camelCase` for functions/variables.

### Tests

- Place tests under `__tests__/` with `*.test.ts` names.
- Use realistic HTML fixtures when parsing DOM-heavy sources.

### Commits & PRs

- Use Conventional Commits: `feat(scope): ...`, `fix: ...`, `docs: ...`, `chore: ...`, `test: ...`.
- PRs should include a short summary and the validation commands run.
- If output changes, include a small example of the `clips/` layout or snippet.

### Daily Reports

Create one file per day in `docs/dailyReport/` named `YYYY-MM-DD-summary.md`. Do not edit or rename past entries.

## Current Status

**M1 - Core Adapters (Complete)**
- Project structure
- Core type definitions
- Render layer with Playwright
- Export layer (Markdown generation)
- Twitter adapter (raw + DOM + HTML fallback)
- Zhihu adapter (HTML parsing)
- WeChat adapter (HTML parsing)
- Asset downloading ✅
- Batch processing ✅
- Deduplication system ✅

**M2 - Enhancement Features (In Progress)**
- Image position fixing for Twitter
- Browser strategy refactoring
- Config file support

## TODO

- [ ] Image position fixing (Twitter images appear at end instead of inline)
- [ ] Browser strategy refactoring (currently Edge-only)
- [ ] Config file support (~/.article-clip/config.json)
- [ ] Queue command implementation
