---
name: update-project-docs
description: Update project documentation after code changes. Use when user completes significant code changes (bug fixes, new features, config changes). Scans for affected docs, updates problem status, and syncs README/CLAUDE.md with actual implementation.
---

# Update Project Documentation

Automatically update project documentation after significant code changes.

## When to Use

Trigger this skill when:
- User completes a bug fix (e.g., "Twitter long-form tweet extraction fixed")
- User adds new features or configuration options
- User asks to "update docs" or "sync documentation"
- Major refactoring is completed

**NOT for**: typo fixes, minor style changes, or documentation-only updates.

## Workflow

### 1. Identify Changes

First, understand what was changed:

```bash
# Get recent commits
git log --oneline -10

# Get diff of recent changes
git diff HEAD~1

# Or ask user: "What did you change in this session?"
```

### 2. Classify Change Type

Determine if the change is **significant**:

| Change Type | Update Docs? | Examples |
|-------------|--------------|----------|
| **Bug Fix** | ✅ Yes | Twitter long-text extraction, login issues |
| **New Feature** | ✅ Yes | New CLI option, new adapter |
| **Config Change** | ✅ Yes | Environment variables, new settings |
| **Refactor** | ⚠️ Maybe | Major architecture changes |
| **Style/Typo** | ❌ No | Code formatting, comment fixes |
| **Doc-only** | ❌ No | README updates, grammar fixes |

**If unsure, ask the user**: "This change appears to be [type]. Should I update documentation?"

### 3. Map Changes to Docs

Identify which documents need updates:

| Change | Affected Docs |
|--------|---------------|
| Bug fix (Twitter/Zhihu) | `docs/pending-tasks.md`, `docs/dailyReport/YYYY-MM-DD-*.md` |
| New feature | `README.md`, `CLAUDE.md` |
| New CLI option | `README.md`, `CLAUDE.md` |
| Config change | `README.md`, `CLAUDE.md` |
| Architecture change | `CLAUDE.md`, `docs/` |
| Completed task | `docs/pending-tasks.md` |

### 4. Update Documents

#### 4.1 Update `docs/pending-tasks.md`

For bug fixes or completed tasks:

```markdown
### X. [Task Name]

**优先级:** High/Medium/Low

**状态:** ✅ 已完成 / ⏳ 进行中

**描述:**
...

**解决方案:**
[How it was fixed]

**相关 Commit:**
- `abc123` - fix: description
```

#### 4.2 Update Daily Report (if exists)

Add to `docs/dailyReport/YYYY-MM-DD-issues-summary.md`:

```markdown
### Bug Fix: [Issue Name]

**问题:** [What was broken]
**解决:** [How it was fixed]
**文件:** `path/to/file.ts:line-range`
```

#### 4.3 Update `README.md`

For new features or CLI options:

```bash
# Add new CLI options to Quick Start section
# Update Current Status if feature is complete
```

#### 4.4 Update `CLAUDE.md`

For architecture or implementation changes:

```bash
# Update "Critical Implementation Details" section
# Add to "Known Issues" or remove if fixed
# Update platform-specific notes
```

### 5. Verify and Confirm

After updates:

```bash
# Show what was changed
git diff docs/

# Ask user to review
echo "Documentation updated. Please review the changes:"
```

## Document Locations

```
docs/
├── pending-tasks.md          # TODO and task status
├── dailyReport/
│   └── YYYY-MM-DD-*.md      # Daily issue reports
├── plans/                    # Implementation plans (mostly static)
└── changes/                  # Change logs
├── Clip_Client_PRD.md        # Product requirements
└── ...

README.md                     # User-facing docs
CLAUDE.md                     # Architecture/dev docs
SKILL.md                      # Other skills
```

## Examples

### Example 1: Bug Fix

**User says**: "Fixed Twitter long-form tweet extraction"

**Action**:
1. Check `docs/pending-tasks.md` for related issues
2. Update task status to ✅ 已完成
3. Add solution details
4. Update `CLAUDE.md` "Critical Implementation Details"

### Example 2: New CLI Option

**User says**: "Added --browser option to select browser"

**Action**:
1. Update `README.md` Quick Start section with new option
2. Update `CLAUDE.md` Development Commands
3. Update `docs/pending-tasks.md` if this was a TODO item

### Example 3: Minor Change

**User says**: "Fixed a typo in variable name"

**Action**: Skip documentation update (not significant)

## Checklist

Before finishing, verify:

- [ ] Correct files were updated
- [ ] Status changed (pending → completed) where applicable
- [ ] Solutions documented with file/line references
- [ ] No stale references remain
- [ ] User has reviewed changes

## Tips

1. **Search first**: Use `Grep` to find all mentions of the changed feature
2. **Be specific**: Include file paths and line numbers in solutions
3. **Stay concise**: Don't repeat info, just update what changed
4. **Ask when unsure**: If a change seems borderline significant, ask the user
