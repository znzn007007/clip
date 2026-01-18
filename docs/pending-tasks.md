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

---

## 未完成任务 / Pending Tasks

## P0 阻塞任务（必须完成）

### 1. 资产下载实现 / Asset Download Implementation

**优先级:** 🔴 P0 阻塞

**问题描述:**
当前 `AssetDownloader.downloadImages()` 只返回 URL 映射，没有实际下载文件到本地。需要实现真实的图片下载。

**文件:**
- `src/core/export/assets.ts`

**实现步骤:**
1. 使用 Playwright 的 `context.download()` 或 `page.goto()` + fetch
2. 保留 cookie 和 referer 绕过防盗链
3. 下载到 `assets/` 目录，使用递增编号命名
4. 失败重试机制（3 次）
5. 返回下载结果（成功/失败/路径）

**示例代码:**
```typescript
async downloadImages(images: AssetImage[], assetsDir: string): Promise<Map<string, string>> {
  const mapping = new Map();

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const filename = `${String(i + 1).padStart(3, '0')}.jpg`;
    const filepath = join(assetsDir, filename);

    try {
      // 在浏览器上下文中下载（保留 cookie）
      const page = await this.context.newPage();
      await page.goto(image.url);
      const buffer = await page.screenshot({ fullPage: false }); // 或使用 fetch
      await fs.writeFile(filepath, buffer);
      await page.close();

      mapping.set(image.url, `./assets/${filename}`);
    } catch (error) {
      // 重试或记录失败
      mapping.set(image.url, null); // 标记失败
    }
  }

  return mapping;
}
```

---

### 2. 微信公众号适配器 / WeChat Official Account Adapter

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

### 3. 队列系统实现 / Queue System Implementation

**优先级:** 🔴 P0 阻塞

**问题描述:**
批量归档需要队列管理、状态跟踪、失败重试。

**文件结构:**
```
src/core/queue/
├── index.ts           # QueueManager 主类
├── storage.ts         # 持久化存储（JSON 文件或 SQLite）
├── task.ts            # Task 任务模型
└── errors.ts          # QueueError 错误类
```

**任务状态:**
```
pending → running → success
               └→ failed → pending (重试)
```

**CLI 命令:**
```bash
clip add <url>           # 添加到队列
clip list                # 列出队列状态
clip run                 # 执行队列
clip retry-failed        # 重试失败任务
clip clear               # 清空队列
```

**实现步骤:**
1. 定义 Task 数据结构（url, status, retryCount, error）
2. 实现 QueueManager（add, list, run, retry, clear）
3. 持久化存储（`~/.clip/queue.json`）
4. 并发控制（concurrency, rate）
5. 错误处理和重试逻辑

---

### 4. 批量归档功能 / Batch Archive Feature

**优先级:** 🔴 P0 阻塞

**问题描述:**
`clip run` 命令支持从文件或 stdin 批量处理 URL。

**文件:**
- `src/cli/commands/run.ts`

**CLI 选项:**
```bash
# 从文件读取
clip run --file urls.txt

# 从 stdin 读取
cat urls.txt | clip run --stdin

# 并发和限速
clip run --file urls.txt --concurrency 2 --rate 1.5

# JSONL 输出
clip run --file urls.txt --jsonl > results.jsonl

# 失败继续
clip run --file urls.txt --continue-on-error
```

**实现步骤:**
1. 解析 `--file` 或 `--stdin` 参数
2. 逐行读取 URL（跳过空行和注释）
3. 调用 ClipOrchestrator 处理每个 URL
4. 实时输出进度和结果
5. 支持 JSONL 流式输出

**urls.txt 格式:**
```
https://x.com/user/status/123
https://zhihu.com/question/456
# 这是注释，会被跳过
https://mp.weixin.qq.com/s/xxx
```

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
clip once "url"          # 遇到重复跳过
clip once "url" --force  # 强制覆盖
clip once "url" --version # 版本化保存 (v1, v2...)
```

---

### 6. JSONL 流式输出 / JSONL Stream Output

**优先级:** 🔴 P0 阻塞

**问题描述:**
AI 工具链需要流式 JSONL 输出，便于逐条处理。

**文件:**
- `src/core/export/jsonl.ts`

**JSONL 格式:**
```jsonl
{"status":"success","platform":"twitter","title":"Tweet 1","paths":{"markdown":"./twitter/..."}}
{"status":"success","platform":"zhihu","title":"Answer 1","paths":{"markdown":"./zhihu/..."}}
{"status":"failed","platform":"unknown","error":{"code":"extract_failed","message":"..."}}
```

**CLI 使用:**
```bash
# 单条输出 JSONL
clip once "url" --jsonl

# 批量输出
clip run --file urls.txt --jsonl > results.jsonl

# 流式处理
clip run --file urls.txt --jsonl | jq '.title'
```

**实现步骤:**
1. 定义 `formatJsonl(result: ExportResult): string`
2. 支持 `--jsonl` CLI 参数
3. 批量模式下逐行输出（不缓存全部结果）

---

## 常规待办任务

### 7. 重构浏览器策略 / Refactor Browser Strategy

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
clip once "https://x.com/.../status/123"

# 指定浏览器
clip once "https://x.com/...status/123" --browser chrome
clip once "https://x.com/...status/123" --browser playwright
clip once "https://x.com/...status/123" --browser edge
```

**考虑事项:**
- Playwright 浏览器需要首次安装 (`clip install-browsers`)
- 系统浏览器可复用登录状态 (persistent context)
- 跨平台兼容性 (Win/Mac/Linux)

---

### 8. 测试 CDP 连接功能 / Test CDP Connection

**优先级:** 高 / High

**任务描述:**
测试使用 CDP 连接到已登录的 Edge 浏览器是否能解决 Zhihu 和 Twitter 的反爬虫问题。

**步骤:**
1. 启动 Edge 浏览器: `msedge --remote-debugging-port=9222`
2. 在 Edge 中登录 Zhihu 和 Twitter
3. 测试命令:
   ```bash
   node dist/cli/index.js once "https://www.zhihu.com/question/592327756/answer/3379516907" --cdp http://localhost:9222
   node dist/cli/index.js once "https://x.com/thedankoe/status/2010042119121957316" --cdp http://localhost:9222
   ```

**预期结果:**
- 成功提取内容
- 不再出现 40362 错误（Zhihu）
- 不再出现 Twitter 认证墙

---

### 9. 配置文件支持 / Configuration File Support

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
clip once "url"
# → 输出到 ./archive/

# CLI 参数覆盖
clip once "url" --out "./custom"
# → 输出到 ./custom/ (CLI 优先)
```

---

### 10. 修复可能的 Zhihu 选择器问题 / Fix Zhihu Selectors if Needed

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

### 11. 实现 parseFromRawState / Implement Raw State Parsing

**优先级:** 中 / Medium

**任务描述:**
当前 `ZhihuParser.parseFromRawState()` 返回 null（stub 实现）。实现从 Zhihu 的 `__INITIAL_STATE__` 解析数据。

**文件:**
- `src/core/extract/adapters/zhihu/parser.ts`

**参考:**
- Twitter adapter 的 `parseFromRawState` 实现
- Zhihu 的 `window.__INITIAL_STATE__` 数据结构

---

### 12. 单元测试 / Unit Tests

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

### 13. 改进浏览器指纹 / Improve Browser Fingerprinting

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
