# WeChat Official Account Adapter

## Summary
Implemented WeChat Official Account (mp.weixin.qq.com) extraction with HTML parsing, block conversion, and adapter registration. Added platform-aware login prompt handling and improved front matter canonical URL fallback.

## Changes

### New Features
- WeChat adapter with title/author/publishedAt/content/images extraction
- WeChat HTML → Blocks conversion for paragraphs, headings, lists, images, links, and videos
- WeChat-specific error types (login required, rate limit, parse failure)
- Unit tests for WeChat adapter

### Improvements
- Browser login prompt is now Twitter-only based on target URL
- canonical_url falls back to source_url in front matter
- WeChat author preference uses公众号昵称 (#js_name / .profile_nickname) first

### Verification
- Sample URL: https://mp.weixin.qq.com/s/WKJbdbdw_0MLt8RTikKWSw
- Output: clips/wechat/.../content.md
- Images: 7
- Tests: npm test (all green)

### Files Modified
- src/core/extract/adapters/wechat/errors.ts (new)
- src/core/extract/adapters/wechat/parser.ts (new)
- src/core/extract/adapters/wechat/html-to-blocks.ts (new)
- src/core/extract/adapters/wechat/index.ts (new)
- src/core/extract/adapters/__tests__/wechat.adapter.test.ts (new)
- src/core/extract/registry.ts (register WeChat adapter)
- src/core/extract/index.ts (export WeChat adapter)
- src/core/render/browser.ts (platform-aware login prompt)
- src/core/orchestrator.ts (pass target URL into BrowserManager)
- src/core/export/path.ts (canonical_url fallback)
