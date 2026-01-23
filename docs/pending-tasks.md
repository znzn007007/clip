# 未完成任务 / Pending Tasks

**Date:** 2026-01-24
**Status:** Active
**Project Completion:** ~97%

---

## 当前状态 / Current Status

### 最近已完成

1. **资产下载实现** - 两层 fallback、3 次重试、失败追踪 (2026-01-18)
2. **批量处理系统** - BatchRunner、CLI 统一重构、JSONL 输出 (2026-01-18)
3. **微信公众号适配器** - 完整解析实现 (2026-01-18)
4. **Twitter 长推文修复** - 多种 DOM 提取方法 (2026-01-18)
5. **页面等待策略优化** - waitUntil: 'load' + 3s 延迟 (2026-01-19)
6. **去重逻辑实现** - DedupeManager、两级检查、--force 选项 (2026-01-19)
7. **图片位置修复** - Twitter 图片内联显示、DOM 顺序解析 (2026-01-20)
8. **多浏览器支持** - Chrome/Edge 双浏览器支持、--browser 选项 (2026-01-23)
9. **移除 CDP 功能** - 持久化 session 已足够使用 (2026-01-24)

---

## 未完成任务 / Pending Tasks

## P1 高优先级

### 1. ~~图片位置修复 / Image Position Fix~~

**优先级:** 🟡 P1 ✅ **已完成 (2026-01-20)**

**解决方案:**
- 重构 `html-to-blocks.ts` 按 DOM 顺序遍历
- Twitter 图片现在内联显示在正确位置
- 测试覆盖完整验证 (27 tests passing)

**参考:** `docs/plans/2026-01-18-image-position-fix-design.md`

---

### 2. ~~重构浏览器策略 / Refactor Browser Strategy~~

**优先级:** 高 / High ✅ **已完成 (2026-01-23)**

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

**CLI 选项示例:**
```bash
# 自动选择（默认）
clip "https://x.com/.../status/123"

# 指定浏览器
clip "url" --browser chrome
clip "url" --browser playwright
clip "url" --browser edge
```

---

### 3. 配置文件支持 / Configuration File Support

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

**CLI 优先级示例:**
```bash
# 配置文件设置 outputDir: "./archive"
clip "url"  # → 输出到 ./archive/

# CLI 参数覆盖
clip "url" --out "./custom"  # → 输出到 ./custom/
```

---

## P2 中优先级

### 4. npm 发布准备 / Prepare for npm Publishing

**优先级:** 🟢 P2

**任务描述:**
完成项目发布到 npm 的准备工作。

**检查清单:**
1. **包名检查** - 确认 `clip-client` 名称可用，或确定替代名称
2. **package.json 补充** - 添加 `files`、`repository`、`bugs`、`homepage`、`engines` 字段
3. **.npmignore 文件** - 排除不需要发布的文件（src、tests、*.ts 等）
4. **README.md 完善** - 添加 npm 安装说明、使用示例
5. **预发布测试** - `npm pack --dry-run` 验证打包内容

**发布命令:**
```bash
npm login
npm run build
npm publish --access public
```

**参考:**
- https://docs.npmjs.com/cli/v9/commands/npm-publish
- https://docs.npmjs.com/cli/v9/configuring-npm/package-json

---

### 5. 修复可能的 Zhihu 选择器问题 / Fix Zhihu Selectors if Needed

**优先级:** 中 / Medium

**任务描述:**
如果提取失败，可能需要更新 Zhihu HTML 选择器。

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

### 6. 实现 parseFromRawState / Implement Raw State Parsing

**优先级:** 中 / Medium

**任务描述:**
当前 `ZhihuParser.parseFromRawState()` 返回 null（stub 实现）。实现从 Zhihu 的 `__INITIAL_STATE__` 解析数据。

**文件:**
- `src/core/extract/adapters/zhihu/parser.ts:26`

**参考:**
- Twitter adapter 的 `parseFromRawState` 实现
- Zhihu 的 `window.__INITIAL_STATE__` 数据结构

---

### 7. 单元测试 / Unit Tests

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

### 8. 队列命令实现 / Queue Commands Implementation

**优先级:** 中 / Medium

**任务描述:**
当前 `clip queue` 命令只是 stub，需要实现完整的队列管理功能。

**文件:**
- `src/cli/commands/queue.ts`

**待实现子命令:**
```bash
clip queue add <url>     # 添加到队列
clip queue list          # 列出队列
clip queue run           # 执行队列
clip queue clear         # 清空队列
```

---

## P3 低优先级

### 9. 改进浏览器指纹 / Improve Browser Fingerprinting

**优先级:** 低 / Low

**任务描述:**
如果遇到反爬虫问题，可能需要改进浏览器指纹以更接近真实用户。

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
- 使用持久化 session 保存登录状态
- 首次使用时在打开的浏览器中登录

### Twitter 认证墙 / Twitter Auth Wall

**症状:**
- 返回登录页面
- 无法提取 tweet 内容

**当前解决方案:**
- 使用持久化 session 保存登录状态
- 首次使用时在打开的浏览器中登录

---

## 下一步行动 / Next Steps

1. **配置文件支持** - 实现配置文件加载和合并逻辑
2. **npm 发布准备** - 完善 package.json 和 README.md
3. **后续优先级:** 队列命令 → Zhihu raw state 解析 → 单元测试补充

---

## 项目完成度评估

| 模块 | 完成度 | 状态 |
|------|--------|------|
| CLI 层 | 90% | archive ✅ / install-browsers ✅ / queue ❌ |
| 编排层 | 100% | ✅ ClipOrchestrator 完整实现 |
| 渲染层 | 100% | ✅ Playwright / Chrome & Edge 双浏览器支持 |
| 提取层 | 96% | Twitter ✅ / Zhihu 90% / WeChat ✅ |
| 导出层 | 100% | ✅ Markdown / JSON / 资源下载 |
| 批处理 | 100% | ✅ BatchRunner 完整实现 |
| 去重系统 | 100% | ✅ DedupeManager 完整实现 |

**整体完成度: ~97%**
**测试覆盖: 415+ 测试通过**
