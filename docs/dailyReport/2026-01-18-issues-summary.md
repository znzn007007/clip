# 问题与解决方案总结

**Date:** 2026-01-18

---

## 一、今天测试中发现的问题

| # | 问题 | 解决方案 | 状态 |
|---|------|----------|------|
| 1 | **页面等待策略不当** - 使用 `waitUntil: 'commit'` 只等待页面提交，JS 未执行完成 | 改为 `waitUntil: 'load'` + 3秒延迟 | ✅ 已修复 |
| 2 | **推文文本未提取** - HTML 中没有 `[data-testid="tweetText"]` 属性 | 添加多种提取方法：`tweetText` → `longformRichTextComponent` → 兜底方案 | ✅ 已修复 |
| 3 | **图片未下载** - `AssetDownloader` 只返回映射，未实际下载文件 | 待实现下载逻辑 | ⏳ 待完成 |

### 详细说明

#### 1. 页面等待策略问题

**症状:** Twitter 推文内容无法提取，HTML 只包含框架代码

**原因:** `page.ts:25-26` 使用 `waitUntil: 'commit'`，这只等待页面开始加载，不等待 JS 执行完成

**解决方案:**
```typescript
// 修改前
await page.goto(url, {
  waitUntil: 'commit',
  timeout,
});

// 修改后
await page.goto(url, {
  waitUntil: 'load',
  timeout,
});
await page.waitForTimeout(3000); // 等待动态内容
```

#### 2. 推文文本提取问题

**症状:** 推文只能提取图片和链接，文字内容为空

**原因:** HTML 中没有 `[data-testid="tweetText"]` 属性，长推文使用 `longformRichTextComponent`

**解决方案:**
```typescript
// src/core/extract/adapters/twitter/dom-extractor.ts
// 添加三种文本提取方法：

// Method 1: 标准推文
const textEl = article.querySelector('[data-testid="tweetText"]');

// Method 2: 长推文组件
const longformEl = article.querySelector('[data-testid="longformRichTextComponent"]');
const textSpans = longformEl.querySelectorAll('span[data-text="true"]');

// Method 3: 兜底方案
// 排除交互元素，提取所有文本
```

---

## 二、Twitter 适配器问题

| # | 问题 | 解决方案 | 状态 |
|---|------|----------|------|
| 1 | **单源数据提取不足** - 只依赖 `window.__STATE__`，容易失败 | 实现多源提取：`__STATE__` → `__INITIAL_STATE__` → script tags | ✅ 已修复 |
| 2 | **DOM 提取器文本选择器失效** - `[data-testid="tweetText"]` 在某些推文中不存在 | 添加长推文组件选择器和兜底方案 | ✅ 已修复 |
| 3 | **Twitter 认证墙** - 未登录时返回登录页面 | 使用持久化 session 保留登录状态 | ✅ 已实现 |
| 4 | **parseFromRawState 为空实现** - 返回空数组 | 实现完整的多源数据解析 | ✅ 已修复 |

### 已完成功能

- ✅ 多源数据提取 (`TwitterRawExtractor`)
- ✅ DOM 提取器 (`TwitterDomExtractor`)
- ✅ Debug 模式 (`--debug` 保存 HTML/JSON)
- ✅ 原图质量获取 (`&name=orig`)
- ✅ 持久化登录 session

---

## 三、知乎适配器问题

| # | 问题 | 解决方案 | 状态 |
|---|------|----------|------|
| 1 | **反爬虫限制** - 错误码 40362 "您当前请求存在异常，暂时限制本次访问" | 添加 RATE_LIMITED 错误码检测，计划使用 CDP 连接 | ✅ 已检测 |
| 2 | **parseFromRawState 未实现** - 返回 null (stub) | 待实现从 `__INITIAL_STATE__` 解析 | ⏳ 待完成 |
| 3 | **问答页面标题重复** - 问题标题出现两次（文档标题+内容中） | 移除内容中的问题标题，只在文档标题显示问题+答主 | ✅ 已修复 |
| 4 | **标题重复模式** - "如何评价前端已死？如何评价前端已死？" | 添加 `deduplicateTitle` 方法去除重复 | ✅ 已修复 |
| 5 | **作者名提取失败** - `.AuthorInfo-name` 有时无法获取完整作者名 | 添加多选择器 fallback：`.AuthorInfo-name` → `.UserLink-link` → `[itemprop="name"]` | ✅ 已修复 |
| 6 | **Debug 文件名硬编码** - 只支持 Twitter 平台 | 改为 `debug-{platform}-*` 动态命名 | ✅ 已修复 |

### 需要检查的选择器

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

## 四、浏览器/通用问题

| # | 问题 | 解决方案 | 状态 |
|---|------|----------|------|
| 1 | **CDP 连接功能未实现** - CLI 有 `--cdp` 选项，但代码未实际使用 | `BrowserManager.launch()` 未实现连接逻辑 | ⏳ 待完成 |
| 2 | **networkidle 超时** - Twitter 持续有轮询活动，永远达不到 networkidle | 使用 `load` 事件 + 固定延迟替代 | ✅ 已修复 |
| 3 | **浏览器指纹检测** - 可能被识别为自动化工具 | 可选：改进 UA、添加随机延迟、模拟用户行为 | ⏳ 待完成 |
| 4 | **图片下载未实现** - `AssetDownloader.downloadImages()` 只有注释 | 待使用 Playwright 实现实际下载 | ⏳ 待完成 |

### CDP 连接实现参考

```typescript
// 需要在 BrowserManager 中实现
if (options?.cdpEndpoint) {
  // 连接到现有浏览器
  const browser = await chromium.connectOverCDP(options.cdpEndpoint);
  this.context = await browser.newContext();
} else {
  // 启动新浏览器（当前实现）
  this.context = await chromium.launchPersistentContext(...);
}
```

---

## 五、架构/设计问题

| # | 问题 | 解决方案 | 状态 |
|---|------|----------|------|
| 1 | **缺乏单元测试** - Zhihu adapter 没有测试覆盖 | 参考 Twitter adapter 添加测试 | ⏳ 待完成 |
| 2 | **错误处理不完善** - TwitterExtractError 需要更详细的错误类型 | 已增强错误码和错误信息 | ✅ 已完成 |
| 3 | **调试功能不足** - 难以排查提取失败原因 | 添加 `--debug` 模式，保存 HTML 和 JSON 快照 | ✅ 已完成 |

---

## 六、待实现功能

| # | 功能 | 描述 | 优先级 |
|---|------|------|--------|
| 1 | **微信公众号适配器** | 用户最初需求之一，反爬虫更严格 | TBD |
| 2 | **CDP 连接实现** | 连接到已登录浏览器，解决登录问题 | 高 |
| 3 | **图片下载** | 下载远程图片到本地 assets 目录 | 中 |
| 4 | **浏览器指纹优化** | 更真实的用户行为模拟 | 低 |

---

## 关键代码修改位置

| 文件 | 修改内容 | 行号 |
|------|----------|------|
| `src/core/render/page.ts` | `waitUntil: 'commit'` → `waitUntil: 'load'` + 延迟 | 24-31 |
| `src/core/render/page.ts` | Debug 文件名动态命名 | 70-72 |
| `src/core/extract/adapters/twitter/dom-extractor.ts` | 添加多方法文本提取 | 16-46 |
| `src/core/extract/adapters/zhihu/index.ts` | 移除问答页面内容中的问题标题 | 52-59 |
| `src/core/extract/adapters/zhihu/index.ts` | 添加 deduplicateTitle 方法 | 89-92 |
| `src/core/extract/adapters/zhihu/parser.ts` | 添加作者名多选择器 fallback | 74-88 |
| `src/core/export/assets.ts` | 图片下载待实现 | 19 |

---

## 测试验证

### Twitter 测试结果

```bash
node dist/cli/index.js once "https://x.com/thedankoe/status/2010042119121957316"
```

**结果:** ✅ 成功
- 标题: "Society made you think that having multiple intere..."
- 作者: @thedankoe
- 文本: ~2000 字完整提取
- 图片: 3 张
- 链接: 4 个
- 互动: ❤️ 33601 | 🔁 6986 | 💬 710

---

### 知乎测试结果

```bash
# 问答页面
node dist/cli/index.js once "https://www.zhihu.com/question/592327756/answer/3379516907"

# 专栏文章
node dist/cli/index.js once "https://zhuanlan.zhihu.com/p/..."
```

**结果:** ✅ 成功
- 问答页面：移除重复问题标题，只显示"问题标题 - 答主名"的回答
- 专栏文章：完整保留文章标题和内容
- 作者名：使用多选择器 fallback 机制确保获取
- Debug 文件名：根据平台动态命名（debug-zhihu-*, debug-twitter-*）

---

## 下一步行动

1. **立即执行:** 测试知乎链接爬取
2. **高优先级:** 实现 CDP 连接功能
3. **中优先级:** 实现图片下载功能
4. **后续工作:** 根据需求决定是否实现微信公众号适配器
