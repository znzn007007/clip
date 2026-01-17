# Twitter/X Extraction Improvement

## Summary
Improved Twitter/X content extraction with multi-source raw data parsing and DOM-based fallback.

## Changes

### New Features
- Multi-source raw data extraction (window.__STATE__, __INITIAL_STATE__, script tags)
- DOM-based extraction using page.evaluate
- Debug mode with HTML and JSON snapshots
- Prioritized pbs.twimg.com image handling with original quality (&name=orig)

### Bug Fixes
- Implemented empty parseFromRawState method
- Improved image URL extraction with priority handling

### Technical Details
- Added TwitterRawData abstraction layer (types.ts)
- Implemented TwitterRawExtractor for multi-source extraction
- Implemented TwitterDomExtractor for DOM-based fallback
- Added page reference to RenderedPage for advanced extraction
- Added debug files output to debug/ directory

### Files Modified
- src/core/extract/adapters/twitter/types.ts (new)
- src/core/extract/adapters/twitter/raw-extractor.ts (new)
- src/core/extract/adapters/twitter/dom-extractor.ts (new)
- src/core/extract/adapters/twitter/parser.ts (enhanced)
- src/core/extract/adapters/twitter/errors.ts (enhanced)
- src/core/extract/adapters/twitter.ts (enhanced)
- src/core/render/page.ts (enhanced)
- src/core/render/types.ts (enhanced)
