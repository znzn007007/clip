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

# Specify output directory
clip once "https://x.com/user/status/123" --out ~/my-clips

# Output JSON metadata
clip once "https://x.com/user/status/123" --json

# Skip asset downloads
clip once "https://x.com/user/status/123" --no-assets

# Debug mode (save screenshots and HTML)
clip once "https://x.com/user/status/123" --debug
```

## Output Structure

```
clips/
└── twitter/
    └── 2026/
        └── 0117/
            └── slug-hash/
                ├── content.md
                └── assets/
                    ├── 001.jpg
                    └── 002.png
```

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

**M1 - Twitter Basic (Complete)**
- Project structure
- Core type definitions
- Render layer with Playwright
- Extract layer (stub)
- Export layer (Markdown generation)
- Twitter adapter (needs full implementation)
- Asset downloading (needs implementation)

## TODO

- [ ] Complete Twitter adapter HTML parsing
- [ ] Implement actual image downloading
- [ ] Add thread expansion logic
- [ ] Add quote tweet handling
- [ ] Add error handling and retry logic
