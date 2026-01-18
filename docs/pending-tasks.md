# 未完成任务 / Pending Tasks

**Date:** 2026-01-18
**Status:** Work in Progress

---

## 当前状态 / Current Status

### 已完成 / Completed

1. **Zhihu Adapter 完整实现** (commit `0b598d4`)
   - 创建目录结构
   - ZhihuExtractError 错误类
   - ZhihuHtmlToBlocks HTML转换器
   - ZhihuParser 解析器
   - ZhihuAdapter 适配器
   - 注册到适配器注册表
   - PageRenderer 更新
   - 端到端测试

2. **Zhihu 反爬虫错误检测** (commit `b0314c3`)
   - 添加 RATE_LIMITED 错误码
   - 检测 Zhihu 40362 错误

3. **CDP 浏览器连接功能** (commit `41f3fe9`)
   - 添加 `--cdp` CLI 选项
   - 支持连接到现有浏览器会话
   - 保留登录状态

4. **Twitter 长推文文本提取修复** (2026-01-18)
   - 添加多种 DOM 提取方法处理长推文
   - 支持标准 tweetText、longformRichTextComponent、兜底方案
   - 文件: `src/core/extract/adapters/twitter/dom-extractor.ts:16-46`

5. **Twitter 页面等待策略修复** (2026-01-18)
   - 从 `waitUntil: 'commit'` 改为 `waitUntil: 'load'` + 3秒延迟
   - 解决 SPA 内容未加载完成的问题
   - 文件: `src/core/render/page.ts:24-31`

6. **知乎爬取功能验证** (2026-01-18)
   - 测试问答页面和专栏文章，功能正常
   - 移除问答页面的问题标题，只保留答主内容
   - 修复标题重复问题
   - 文件: `src/core/extract/adapters/zhihu/index.ts`, `parser.ts`

7. **Debug 文件名硬编码修复** (2026-01-18)
   - 从 `debug-twitter-*` 改为 `debug-{platform}-*`
   - 文件: `src/core/render/page.ts:70-72`

8. **资产下载实现** (2026-01-18)
   - 实际图片下载（两层 fallback: page.goto → page.evaluate fetch）
   - 重试机制（指数退避: 1s → 2s → 4s）
   - 失败追踪（ExportResult.assetFailures + Markdown 尾注）
   - 文件: `src/core/export/assets.ts`

---

## 未完成任务 / Pending Tasks

## P0 阻塞任务（必须完成）

### 1. 资产下载实现 / Asset Download Implementation

**优先级:** ✅ 已完成 (2026-01-18)

**实现内容:**
- **类型定义:** `DownloadResult` (含 status, path, attempts, error) 和 `DownloadError`
- **两层 fallback:** 尝试 `page.goto()` → 失败则用 `context.request.get()` (带 headers)
- **重试机制:** 指数退避 (1s → 2s → 4s)，最多 3 次尝试
- **失败追踪:** `ExportResult.assetFailures` + Markdown 尾注显示
- **CLI 选项:** `--no-assets` 可跳过下载（默认启用）
- **类型安全:** 返回 `Map<url, DownloadResult>` 包含实际尝试次数
- **测试覆盖:** 97/97 测试通过，新增失败追踪测试

**关键 Commits:**
- `e7bf3ab` - 类型定义 + JSDoc
- `e95ce10` - 下载方法实现
- `c9e40fb` - downloadImages 主方法
- `f2937cc` - 追踪实际重试次数
- `530d3fe` - ExportResult 类型更新
- `f955f35` - buildExportResult 函数
- `01bca4f` - ClipOrchestrator 集成
- `9f31332` - MarkdownGenerator 失败提示
- `efd6b95` - 测试更新
- `61cfdd9` - 修复测试失败
- `5ab2134` - **最终修复:** context.request.get + CLI 选项修复

**实际测试结果:**
- ✅ Twitter: 成功下载 9 张图片 (1.9 MB)
- ✅ 文件名: 001.jpg, 002.jpg, ... 009.jpg
- ✅ 失败时使用原始 URL 作为回退

**文件:**
- `src/core/export/assets.ts` - 核心实现
- `src/core/export/types.ts` - 类型定义
- `src/core/export/json.ts` - ExportResult
- `src/core/export/markdown.ts` - 失败提示
- `src/core/orchestrator.ts` - 集成
- `src/cli/commands/once.ts` - CLI 选项
- `src/core/export/__tests__/assets.test.ts` - 测试

---

### 2. 图片位置修复 / Image Position Fix

**优先级:** 🟡 P1

**问题描述:**
当前 Twitter 和可能其他平台的图片全部追加在文章末尾，而不是在原始位置。例如：
- 原文: "文字第一段 [图1] 文字第二段 [图2]"
- 当前: "文字第一段 文字第二段 [图1] [图2]"
- 期望: "文字第一段 [图1] 文字第二段 [图2]"

**根本原因:**
- Twitter adapter 的 `block-builder.ts` 先提取文字，再批量添加图片
- 图片位置信息在 API 中丢失
- 需要从原始 HTML 中按 DOM 顺序解析

**实现方案:**
1. **Phase 1 - 修复 Twitter**: 重构 `html-to-blocks.ts` 按 DOM 顺序遍历
2. **Phase 2 - 添加 blockId**: 给 `AssetImage` 添加 `blockId` 和 `position` 字段
3. **Phase 3 - 验证 Zhihu**: 检查知乎图片位置是否正确

**文件:**
- `src/core/extract/adapters/twitter/html-to-blocks.ts`
- `src/core/extract/adapters/twitter/block-builder.ts`
- `src/core/types/index.ts` (AssetImage 接口)

**设计文档:**
- `docs/plans/2026-01-18-image-position-fix-design.md`

---

### 3. 微信公众号适配器 / WeChat Official Account Adapter

**优先级:** 🔴 P0 阻塞

**问题描述:**
PRD 三平台核心之一，尚未实现。微信公众号反爬虫严格，需要登录态。

**考虑事项:**
- 微信公众号的反爬虫机制严格
- 需要登录才能访问大部分内容
- 可能需要 CDP 连接作为基本要求
- 支持 md + html 双轨输出（保真）

**文件结构:**
```
src/core/extract/adapters/wechat/
├── index.ts          # WeChatAdapter 主适配器
├── parser.ts         # HTML 解析器
├── html-to-blocks.ts # HTML 转 Blocks
└── errors.ts         # WeChatExtractError 错误类
```

**关键选择器:**
```typescript
// 微信公众号正文
$('.rich_media_title')           // 标题
$('#js_content')                 // 正文内容
$('.rich_media_meta_text')       // 作者/日期
```

**实现步骤:**
1. 创建 WeChatAdapter 继承 BaseAdapter
2. 实现 `canHandle()` 识别 `mp.weixin.qq.com`
3. 实现内容提取（标题、作者、正文、图片）
4. 实现图片下载（防盗链处理）
5. 注册到 AdapterRegistry

---

### 4. 批量处理与队列系统 / Batch Processing & Queue System

**优先级:** 🟡 P1 设计完成，待实现

**状态:**
- ✅ 设计文档: `docs/plans/2026-01-18-batch-processing-design.md`
- ⏳ BatchRunner 实现中
- ⏳ CLI 统一重构: `clip <url>` 代替 `clip`
- ⏳ 批量处理: `clip --file urls.txt` 和 `clip --stdin`
- ⏳ 队列管理 (clip queue add/list/run/clear) - 后续实现

**设计决策:**
- **CLI 统一**: `clip` → `clip <url>`，`clip run` → `clip --file`
- **命令分组**: `clip queue` 子命令管理队列
- **批量模式**: 临时内存队列，无需持久化
- **失败处理**: `--continue-on-error` 用户可选
- **输出**: JSONL 流式 + 汇总报告

**CLI 结构:**
```bash
# 单个 URL（位置参数）
clip https://x.com/user/status/123

# 批量 URL
clip --file urls.txt
clip --stdin < urls.txt

# 队列管理（后续实现）
clip queue add <url>
clip queue list
clip queue run
clip queue clear
```

**文件结构:**
```
src/core/batch/
├── runner.ts           # BatchRunner 主类
└── __tests__/
    └── runner.test.ts  # 测试

src/cli/commands/
├── archive.ts          # 统一命令（原 once.ts）
└── queue.ts            # 队列管理 stub
```

**实现步骤:**
1. 创建 BatchRunner 类（URL 解析、串行执行、输出）
2. 重构 once.ts → archive.ts（支持位置参数和 --file）
3. 添加 queue.ts 命令 stub
4. 集成测试和文档更新

---

### 5. 去重逻辑实现 / Deduplication Logic

**优先级:** 🔴 P0 阻塞

**问题描述:**
避免重复归档同一内容，基于 canonical_url 或 normalize(url)。

**文件:**
- `src/core/dedupe/index.ts`
- `~/.clip/archived.json` (去重记录)

**去重键:**
```typescript
// 优先 canonicalUrl
if (doc.canonicalUrl && hasArchived(doc.canonicalUrl)) {
  return 'duplicate';
}

// 其次 normalize(sourceUrl)
const normalized = normalizeUrl(doc.sourceUrl);
if (hasArchived(normalized)) {
  return 'duplicate';
}
```

**存储格式:**
```json
{
  "archived": {
    "https://x.com/user/status/123": {
      "firstSeen": "2026-01-18T10:00:00Z",
      "path": "./twitter/2026/01/18/abc/"
    }
  }
}
```

**CLI 选项:**
```bash
clip "url"          # 遇到重复跳过
clip "url" --force  # 强制覆盖
clip "url" --version # 版本化保存 (v1, v2...)
```

---

## 常规待办任务

### 6. 重构浏览器策略 / Refactor Browser Strategy

**优先级:** 高 / High

**问题描述:**
当前代码硬编码使用 `channel: 'msedge'`，不利于开源泛用性。需要重构为更灵活的浏览器选择策略。

**设计目标:**
```
优先级顺序:
1. Playwright Chromium (默认，版本固定兼容性好)
2. Chrome (系统浏览器，最普遍)
3. Edge (Windows)
4. Chromium (Linux fallback)
```

**文件:**
- `src/core/render/browser.ts`
- `src/core/config/constants.ts`

**实现步骤:**
1. 移除硬编码的 `channel: 'msedge'`
2. 添加浏览器自动检测逻辑
3. 实现 fallback 机制
4. 添加 `--browser` CLI 选项允许用户指定
5. 更新错误提示信息

**CLI 选项示例:**
```bash
# 自动选择（默认）
clip "https://x.com/.../status/123"

# 指定浏览器
clip "https://x.com/...status/123" --browser chrome
clip "https://x.com/...status/123" --browser playwright
clip "https://x.com/...status/123" --browser edge
```

**考虑事项:**
- Playwright 浏览器需要首次安装 (`clip install-browsers`)
- 系统浏览器可复用登录状态 (persistent context)
- 跨平台兼容性 (Win/Mac/Linux)

---

### 7. 测试 CDP 连接功能 / Test CDP Connection

**优先级:** 高 / High

**任务描述:**
测试使用 CDP 连接到已登录的 Edge 浏览器是否能解决 Zhihu 和 Twitter 的反爬虫问题。

**步骤:**
1. 启动 Edge 浏览器: `msedge --remote-debugging-port=9222`
2. 在 Edge 中登录 Zhihu 和 Twitter
3. 测试命令:
   ```bash
   node dist/cli/index.js "https://www.zhihu.com/question/592327756/answer/3379516907" --cdp http://localhost:9222
   node dist/cli/index.js "https://x.com/thedankoe/status/2010042119121957316" --cdp http://localhost:9222
   ```

**预期结果:**
- 成功提取内容
- 不再出现 40362 错误（Zhihu）
- 不再出现 Twitter 认证墙

---

### 8. 配置文件支持 / Configuration File Support

**优先级:** 高 / High

**问题描述:**
当前所有参数需要通过 CLI 传递，无法设置默认值。需要支持配置文件来预设常用参数。

**设计目标:**
```
配置文件搜索顺序:
1. 当前目录: ./clip.config.json
2. 用户目录: ~/.clip/config.json
3. 默认配置内置
```

**配置文件示例:**
```json
{
  "outputDir": "./archive",
  "format": "md+html",
  "concurrency": 2,
  "rate": 1.5,
  "retry": 2,
  "browser": "chrome"
}
```

**文件:**
- `src/core/config/loader.ts` - 配置加载器
- `src/core/config/schema.ts` - 配置类型定义

**实现步骤:**
1. 定义配置类型结构
2. 实现配置文件加载逻辑（支持 json/js 格式）
3. CLI 参数与配置文件合并（CLI 优先级更高）
4. 添加 `--config` 选项指定配置文件路径
5. 添加 `clip config` 命令管理配置

**CLI 优先级示例:**
```bash
# 配置文件设置 outputDir: "./archive"
clip "url"
# → 输出到 ./archive/

# CLI 参数覆盖
clip "url" --out "./custom"
# → 输出到 ./custom/ (CLI 优先)
```

---

### 9. 修复可能的 Zhihu 选择器问题 / Fix Zhihu Selectors if Needed

**优先级:** 中 / Medium

**任务描述:**
如果 CDP 连接成功但仍无法提取内容，可能需要更新 Zhihu HTML 选择器。

**可能的问题:**
- Zhihu DOM 结构可能已变化
- 选择器不匹配实际页面结构

**文件:**
- `src/core/extract/adapters/zhihu/parser.ts`

**需要检查的选择器:**
```typescript
// Answer page
$('h1.QuestionHeader-title')
$('.RichContent-inner')
$('.AuthorInfo-name')
$('.VoteButton--up .VoteCount')

// Article page
$('.Post-Title')
$('.Post-RichText')
```

---

### 10. 实现 parseFromRawState / Implement Raw State Parsing

**优先级:** 中 / Medium

**任务描述:**
当前 `ZhihuParser.parseFromRawState()` 返回 null（stub 实现）。实现从 Zhihu 的 `__INITIAL_STATE__` 解析数据。

**文件:**
- `src/core/extract/adapters/zhihu/parser.ts`

**参考:**
- Twitter adapter 的 `parseFromRawState` 实现
- Zhihu 的 `window.__INITIAL_STATE__` 数据结构

---

### 11. 单元测试 / Unit Tests

**优先级:** 中 / Medium

**任务描述:**
为 Zhihu adapter 添加单元测试，参考 Twitter adapter 的测试结构。

**文件:**
- `src/core/extract/adapters/__tests__/zhihu.adapter.test.ts`

**测试覆盖:**
- URL pattern matching (`canHandle`)
- HTML 解析（各种内容类型）
- 错误处理
- Block 转换

---

### 12. 改进浏览器指纹 / Improve Browser Fingerprinting

**优先级:** 低 / Low

**任务描述:**
如果 CDP 连接仍有问题，可能需要改进浏览器指纹以更接近真实用户。

**可能的改进:**
- 调整 user-agent
- 添加随机延迟
- 模拟真实用户行为（滚动、鼠标移动）
- 设置更真实的视口大小

---

## 已知问题 / Known Issues

### Zhihu 反爬虫 / Zhihu Anti-Bot

**错误码:** 40362
**错误消息:** "您当前请求存在异常，暂时限制本次访问"

**当前解决方案:**
- 使用 CDP 连接到已登录浏览器
- 理论上可以绕过检测

**需要验证:**
- 实际测试 CDP 是否有效

### Twitter 认证墙 / Twitter Auth Wall

**症状:**
- 返回登录页面
- 无法提取 tweet 内容

**当前解决方案:**
- 使用 CDP 连接到已登录浏览器
- 理论上可以保留登录状态

---

## 下一步行动 / Next Steps

1. **立即执行:** 测试 CDP 连接功能
2. **根据测试结果:**
   - 如果成功: 提取用户请求的 Zhihu 内容
   - 如果失败: 调试选择器或进一步优化浏览器指纹
3. **后续工作:** 根据用户需求决定是否实现微信公众号

---

## 相关 Commits

- `0b598d4` - docs: complete Zhihu content parsing implementation plan
- `b0314c3` - feat(zhihu): add rate limit error detection for Zhihu anti-bot protection
- `41f3fe9` - feat(browser): add CDP connection to existing browser sessions
- `415fec4` - docs: complete Zhihu content parsing implementation (Task 8 - End-to-End Testing)
