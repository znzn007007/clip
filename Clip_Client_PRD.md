# PRD：Clip Client（NPM 发布的本地归档客户端）

- 版本：V0.2
- 日期：2026-01-17
- 负责人：nemo
- 发布形态：NPM 包 + CLI 客户端
- 支持平台：Twitter（X）知乎 公众号
- 核心定位：个人内容整理与本地归档，可开源分享，支持后续给 AI 调用

## 1 背景与动机

用户在 Twitter 知乎 公众号等平台阅读与收藏频繁，常见痛点：

- 内容分散在平台内，检索与复用成本高
- 复制粘贴易丢格式 丢图片 丢引用
- 内容多为动态渲染，纯 HTTP 抓取不稳定
- 希望形成长期可维护的本地知识资产，面向 Obsidian 等工具友好
- 希望未来能被 AI 在工作流中直接调用，实现批量归档与自动整理

## 2 产品目标

### 2.1 目标

- 将任意一条 URL 归档为本地 Markdown + assets（图片等资源可离线查看）
- 支持批量队列执行，失败可重试，具备去重能力
- 支持可选 HTML 备份，提升保真与回归调试能力
- 提供机器可读 JSON 或 JSONL 输出，便于 AI skills 或脚本消费
- 以 Playwright 作为渲染抓取底座，复用真实浏览器行为降低反爬压力

### 2.2 成功标准

- 常见网络环境下单条 URL 归档成功率达到 95%
- Obsidian 打开 Markdown 可读，图片可离线显示
- 批量 100 条 URL 稳定执行，失败任务可重试并输出明确错误码
- JSONL 输出可直接用于后续自动化索引 摘要 标签生成

## 3 非目标

- 绕过付费墙或访问控制
- 提供平台站内搜索、账号运营或自动发布能力
- 云端同步、多端实时协作
- 对第三方内容做集中分发或公开镜像站能力

## 4 用户画像与场景

### 4.1 用户画像

- 技术向用户为主，能接受命令行
- 有个人知识库或内容生产需求
- 需要批量归档与可复现导出结果
- 希望将工具作为开源项目分享给社区

### 4.2 核心场景

- 场景 A：阅读时归档  
  复制 URL 到命令行执行一次归档

- 场景 B：批量归档  
  收集一批 URL，写入 urls.txt，一次性跑完，输出 JSONL 供后续处理

- 场景 C：AI 调用  
  AI 在工作流中调用 CLI，读取 JSON 结果继续做摘要、标签、主题索引

## 5 开源发布与安装方式

### 5.1 主发布方式

- NPM 包发布，提供 CLI 命令 `clip`
- 支持全局安装与 npx 直接运行

示例：

```bash
npm i -g clip-client
clip install-browsers
clip once "https://..."
```

```bash
npx clip-client install-browsers
npx clip-client once "https://..."
```

### 5.2 Playwright 浏览器依赖策略

- 提供显式命令 `clip install-browsers` 触发 Playwright 浏览器安装
- README 明确首次安装步骤与常见失败处理
- 默认不在 npm install 阶段强制下载浏览器，减少安装阻力与不可控失败

### 5.3 可选发布方式（后续）

- GitHub Releases 提供二进制
- Homebrew 与 Scoop 分发
- Docker 镜像仅作为可选项，优先级较低

## 6 功能范围与优先级

### 6.1 P0 必做

- CLI：单条归档 `once`
- CLI：批量归档 `run`（支持 file 或 stdin）
- 队列与重试：`add list run retry-failed clear`
- Playwright 渲染抓取：获取渲染后 HTML
- 站点识别与适配器：twitter zhihu wechat
- 导出 Markdown：包含 front matter 与来源信息
- 资源落盘：图片下载到 assets 并重写为相对路径
- JSON 或 JSONL 输出：含 paths stats warnings error
- 去重：基于 canonical_url 或 normalize(url)

### 6.2 P1 增强

- Twitter 线程展开深度控制，引用推文处理
- 知乎回答展开全文与折叠内容处理
- 公众号导出保真增强，支持 md + html 双轨
- 本地索引 sqlite：元数据、去重、运行记录、错误记录
- 清洗规则可配置：移除推荐区、相关链接等

### 6.3 P2 可选

- 浏览器插件入口，仅负责发送 URL 到本地服务或队列
- 导出 EPUB PDF
- 集成 Notion 语雀 等同步能力

## 7 核心技术路线

### 7.1 反爬与稳定性策略

- 统一走 Playwright 渲染抓取路线
- 通过 persistent context 复用会话，减少账号密码管理
- 默认保守并发与限速，避免触发风控
- 资源下载优先在浏览器上下文内执行，减少防盗链问题

### 7.2 模块分层

1. Render 渲染层  
   输入：URL  
   输出：RenderedPage（渲染后 HTML 标题 canonical 等）

2. Extract 提取层  
   输入：RenderedPage  
   输出：ClipDoc（统一中间结构 blocks assets）

3. Export 导出层  
   输入：ClipDoc  
   输出：ExportResult（落盘路径、统计、警告与错误）

4. Orchestrator 编排层  
   输入：命令行参数、队列、并发、重试策略  
   输出：日志 + JSON 或 JSONL

## 8 数据结构与输出协议

### 8.1 RenderedPage

- url
- canonicalUrl 可选
- title 可选
- html
- platform: twitter zhihu wechat unknown
- screenshotPath 可选
- debugHtmlPath 可选

### 8.2 ClipDoc（统一中间结构）

- platform
- sourceUrl
- canonicalUrl 可选
- title
- author 可选
- publishedAt 可选
- fetchedAt
- blocks: 内容块数组
  - paragraph
  - heading
  - quote
  - code
  - list
  - image
- assets
  - images: [{ url, alt, filenameHint }]

### 8.3 ExportResult（JSON 输出）

- status: success failed
- platform
- canonical_url
- title
- paths
  - markdown_path
  - html_path 可选
  - assets_dir
- meta
  - author 可选
  - published_at 可选
  - fetched_at
- stats
  - word_count
  - image_count
- diagnostics
  - warnings: []
  - error 可选
    - code
    - message
    - retryable

### 8.4 Front matter（Markdown 顶部）

- title
- source_url
- canonical_url
- platform
- author 可选
- published_at 可选
- fetched_at
- tags: []

## 9 CLI 设计

### 9.1 命令集合

- `clip once <url> [--out <dir>] [--format md|md+html] [--json|--jsonl] [--debug]`
- `clip add <url>`
- `clip list`
- `clip run [--file <path>] [--stdin] [--concurrency <n>] [--rate <seconds>] [--retry <n>] [--jsonl]`
- `clip retry-failed`
- `clip clear`
- `clip install-browsers`
- `clip doctor`（P1）输出环境检查与依赖建议

### 9.2 默认参数建议

- concurrency: 2
- rate: 1.0 秒到 2.0 秒抖动
- retry: 2
- format: md，公众号推荐 md+html（可配置）

## 10 站点适配器逻辑

### 10.1 平台识别

- x.com twitter.com -> twitter adapter
- zhihu.com -> zhihu adapter
- mp.weixin.qq.com -> wechat adapter

### 10.2 Twitter adapter

- 目标：提取线程结构与每条 tweet 的文本图片引用
- 行为：滚动加载 + 点击展开更多
- 输出：按 DOM 顺序组织 blocks
- 引用推文：quote 或 embed block
- 去噪：移除侧栏与推荐区域

### 10.3 知乎 adapter

- 文章：正文容器提取 + Readability 兜底
- 回答：展开全文与折叠处理，移除推荐混入
- 图片：收集并落盘

### 10.4 公众号 adapter

- 正文容器稳定
- 重点：图片落盘与链接重写
- 建议：md + html 双轨输出，html 作为保真备份

### 10.5 通用兜底

- 当选择器失效：Readability 兜底正文抽取
- 输出 warnings 提示提取质量下降
- 保存 debug html 便于回归修复

## 11 资源下载与链接重写

### 11.1 下载策略

- 默认在 Playwright 页面上下文内 fetch 资源
- 保留 cookie 与 referer
- 下载失败按策略重试，失败给出 asset_download_failed

### 11.2 命名与去重

- assets 内采用递增编号或 hash 命名
- 同一 URL 同一运行内只下载一次，使用映射表复用

### 11.3 Markdown 重写

- 将图片链接重写为相对路径 `./assets/xxx.ext`
- 保留 alt 文本

## 12 落盘目录结构

推荐结构：

- root/
  - twitter/
  - zhihu/
  - wechat/
    - YYYY/
      - YYYYMMDD/
        - slug-or-hash/
          - content.md
          - content.html 可选
          - assets/
            - 001.jpg
            - 002.png

slug 生成规则建议：

- title 规范化 + 短 hash
- 过滤 Windows 非法字符

## 13 去重 重试 错误码

### 13.1 去重键

- 优先 canonicalUrl
- 其次 normalize(sourceUrl)

### 13.2 错误码建议

- network_error
- timeout
- login_required
- rate_limited
- dom_changed
- extract_failed
- asset_download_failed
- export_failed

每个错误返回 retryable 字段，用于队列策略。

## 14 合规与风险约束

- 工具定位为个人备份与整理
- 默认保留来源链接与抓取时间
- 默认限速与低并发，减少对平台压力
- 不提供绕过访问控制的能力
- 开源分发以工具为主，避免传播第三方内容成品包

## 15 里程碑

- M0：设计冻结  
  CLI 参数、JSON schema、目录结构、错误码列表

- M1：P0 基础可用  
  clip once 三平台基础归档，图片落盘，JSON 输出

- M2：P0 批量与队列  
  clip run add list retry-failed，去重与重试策略，JSONL 流式输出

- M3：P1 质量提升  
  Twitter 线程增强，知乎回答展开，公众号双轨导出，本地 sqlite 索引

- M4：P2 可选入口  
  浏览器插件一键发送 URL 到本地队列

## 16 开源仓库建议结构

- /src
  - /cli
  - /core
    - /render
    - /extract
      - /adapters
        - twitter.ts
        - zhihu.ts
        - wechat.ts
    - /export
    - /queue
    - /errors
    - /types
- /examples
- /docs
- package.json
- README.md
- LICENSE
- CONTRIBUTING.md
- CODE_OF_CONDUCT.md

## 17 README 需要写清楚的内容

- 快速开始  
  npm 全局安装与 npx 两种方式

- 首次安装依赖  
  clip install-browsers 的说明与常见问题

- 基本用法  
  once run jsonl 输出示例

- 登录态说明  
  persistent context 的会话目录位置与如何重新登录

- 输出结构说明  
  目录结构、front matter、JSON 字段

- 常见错误  
  login_required rate_limited dom_changed 的处理建议

## 18 验收清单

- 三平台各 20 条 URL 归档成功，正文完整，图片可离线查看
- 批量 100 条 URL 稳定执行，失败可重试，输出 JSONL 可被脚本消费
- 去重生效，重复 URL 不重复写入或按策略版本化
- 错误码覆盖并可定位问题，debug 模式可输出 html 与截图
