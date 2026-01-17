# Clip Client

Local content archiver for Twitter, Zhihu, and WeChat Official Accounts.

## Installation

```bash
npm install -g clip-client
```

## Quick Start

```bash
# Archive a single URL
clip once "https://x.com/user/status/123"

# Specify output directory
clip once "https://x.com/user/status/123" --out ~/my-clips

# Output JSON
clip once "https://x.com/user/status/123" --json
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
