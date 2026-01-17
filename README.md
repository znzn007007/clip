# Clip Client

Local content archiver for Twitter, Zhihu, and WeChat Official Accounts.

## Installation

```bash
npm install -g clip-client
```

## Quick Start

```bash
# Install browsers (optional, uses system Chrome by default)
clip install-browsers

# Archive a single URL
clip once "https://x.com/user/status/123"
```

## Output

```
clips/
└── twitter/
    └── 2026/
        └── 0117/
            └── abc123/
                ├── content.md
                └── assets/
                    ├── 001.jpg
                    └── 002.png
```
