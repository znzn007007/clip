# 未完成任务 / Pending Tasks

**Date:** 2026-01-17
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

---

## 未完成任务 / Pending Tasks

### 1. 测试 CDP 连接功能 / Test CDP Connection

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

### 2. 修复可能的 Zhihu 选择器问题 / Fix Zhihu Selectors if Needed

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

### 3. 实现 parseFromRawState / Implement Raw State Parsing

**优先级:** 中 / Medium

**任务描述:**
当前 `ZhihuParser.parseFromRawState()` 返回 null（stub 实现）。实现从 Zhihu 的 `__INITIAL_STATE__` 解析数据。

**文件:**
- `src/core/extract/adapters/zhihu/parser.ts`

**参考:**
- Twitter adapter 的 `parseFromRawState` 实现
- Zhihu 的 `window.__INITIAL_STATE__` 数据结构

---

### 4. 微信公众号适配器 / WeChat Official Account Adapter

**优先级:** 待定 / TBD

**任务描述:**
用户最初提到的需求之一，尚未开始实现。

**考虑事项:**
- 微信公众号的反爬虫机制可能更严格
- 需要登录才能访问大部分内容
- 可能需要 CDP 连接作为基本要求

**文件结构:**
```
src/core/extract/adapters/wechat/
├── index.ts
├── parser.ts
├── html-to-blocks.ts
└── errors.ts
```

---

### 5. 单元测试 / Unit Tests

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

### 6. 改进浏览器指纹 / Improve Browser Fingerprinting

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
