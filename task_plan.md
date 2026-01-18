# Task Plan: WeChat Official Account Adapter

## Goal
Implement a WeChat Official Account adapter that extracts title/author/date/body/images from mp.weixin.qq.com articles and registers cleanly in the adapter registry with clear error handling.

## Current Phase
Phase 3

## Phases

### Phase 1: Requirements & Discovery
- [x] Understand user intent (start WeChat adapter work from pending tasks)
- [x] Identify constraints and requirements (login/CDP likely; anti-bot; selectors)
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define technical approach (raw HTML → parser → blocks; CDP/login handling)
- [x] Create project structure if needed (wechat adapter folder + errors)
- [x] Document decisions with rationale (image handling, output format)
- **Status:** complete

### Phase 3: Implementation
- [x] Create WeChat adapter files (index.ts, parser.ts, html-to-blocks.ts, errors.ts)
- [x] Implement canHandle for mp.weixin.qq.com
- [x] Parse title/author/date/body/images; map to ClipDoc blocks
- [x] Register adapter in AdapterRegistry
- [ ] Add/adjust image handling (anti-hotlinking headers/cookies as needed)
- **Status:** in_progress

### Phase 4: Testing & Verification
- [ ] Verify extraction on sample WeChat article (CDP session if needed)
- [ ] Document test results in progress.md
- [ ] Fix any issues found
- **Status:** pending

### Phase 5: Delivery
- [ ] Review output files and docs
- [ ] Ensure deliverables are complete
- [ ] Deliver to user
- **Status:** pending

## Key Questions
1. Do we need any additional WeChat edge cases besides the provided sample URL?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Best-effort without CDP; use CDP if available | CDP may exist but not required; fallback should still work |
| Output format: md only | Align with user request; follow Zhihu/X style |
| Images: keep original URLs | Asset download not implemented yet |
| Author = 公众号名称 | User requirement |
| publishedAt = parse from page, else omit | User requirement |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |

## Notes
- Update phase status as you progress: pending → in_progress → complete
- Re-read this plan before major decisions (attention manipulation)
- Log ALL errors - they help avoid repetition
