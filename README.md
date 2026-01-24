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
