# npm Publish Checklist

**Date:** 2026-01-24
**Package:** article-clip@0.1.0

## Completed Preparation

- [x] Package name updated to `article-clip`
- [x] package.json: added engines, files, repository, homepage, bugs
- [x] package.json: keywords updated
- [x] CLI command renamed: `clip` -> `article-clip`
- [x] .npmignore: includes README_zh.md
- [x] README.md: User-facing documentation (English)
- [x] README_zh.md: User-facing documentation (Chinese)
- [x] CONTRIBUTING.md: Developer documentation (preserved)
- [x] LICENSE: MIT license verified
- [x] Shebang: Present in `dist/cli/index.js`
- [x] Build: Successful
- [x] npm pack --dry-run: Verified contents

## Package Contents

**Included:**
- `dist/` - Compiled JavaScript files
- `README.md` - English user documentation
- `README_zh.md` - Chinese user documentation
- `CONTRIBUTING.md` - Developer documentation
- `LICENSE` - MIT license
- `package.json` - Package metadata

**Excluded:**
- `src/` - TypeScript source files
- Tests and test fixtures
- `docs/` - Development documentation
- `.git/`, `.github/` - Git files
- Development configuration files

## Before Publishing

1. **Update repository URLs** (if migrating)
   - Update `repository.url` in package.json
   - Update `homepage` in package.json
   - Update `bugs.url` in package.json

2. **Create npm account** (if not exists)
   - Visit https://www.npmjs.com/signup
   - Verify email

3. **Login to npm**
   ```bash
   npm login
   ```

4. **Final verification**
   ```bash
   npm pack --dry-run
   # Review the output carefully
   ```

5. **Publish**
   ```bash
   npm publish --access public
   ```

6. **Verify installation**
   ```bash
   npm install -g article-clip
   article-clip --help
   ```

## Post-Publish

- [ ] Update GitHub repository description
- [ ] Add npm badge to README: `![npm](https://img.shields.io/npm/v/article-clip)`
- [ ] Create GitHub release (optional)
- [ ] Update documentation with actual package name

## Migration Notes

If migrating to a new repository:

1. Update all URLs in `package.json`
2. Run `npm run build` to ensure fresh build
3. Run `npm pack --dry-run` to verify package contents
4. Follow "Before Publishing" checklist above

## Commands Reference

```bash
# Build
npm run build

# Dry-run pack (verify contents)
npm pack --dry-run

# Actual pack (creates .tgz)
npm pack

# Publish to npm
npm publish --access public

# Install globally for testing
npm install -g article-clip

# Uninstall global test version
npm uninstall -g article-clip
```
