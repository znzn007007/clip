# Article Clip

本地内容归档工具，支持 Twitter/X、知乎、微信公众号。将网页文章保存为 Markdown 格式，自动下载图片。

## 特性

- **多平台支持**：Twitter/X、知乎、微信公众号
- **智能去重**：自动跳过已归档的内容
- **批量处理**：一次处理多个链接
- **资源下载**：自动下载图片
- **会话持久化**：保存登录状态，下次运行自动使用
- **浏览器灵活**：支持 Chrome 和 Edge

## 环境要求

- Node.js 18 或更高版本
- Chrome 或 Edge 浏览器（用于渲染网页）

## 安装

```bash
npm install -g article-clip
```

## 快速开始

```bash
# 归档单个链接
article-clip "https://x.com/user/status/123"

# 指定输出目录
article-clip "https://x.com/user/status/123" --out ~/my-clips

# 批量处理
article-clip --file urls.txt
```

## 输出结构

```
clips/
├── .archived.json           # 去重数据库
└── twitter/
    └── 2026/
        └── 01/
            └── 24/
                └── slug-hash/
                    ├── content.md
                    └── assets/
                        ├── 001.jpg
                        └── 002.png
```

## 命令

### 归档单个链接

```bash
article-clip "链接"
```

### 批量处理

```bash
article-clip --file urls.txt
article-clip --stdin  # 从标准输入读取链接
```

### 安装浏览器（可选备用方案）

```bash
article-clip install-browsers
```

## 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--out <目录>` | 输出目录 | `./clips` |
| `--format <格式>` | 输出格式 (`md` 或 `md+html`) | `md` |
| `--browser <浏览器>` | 使用浏览器 (`chrome`, `edge`, `auto`) | `auto` |
| `--no-assets` | 跳过资源下载 | - |
| `--force` | 强制覆盖已存在的归档 | - |
| `--verbose` | 显示详细去重信息 | - |
| `--json` | 输出 JSON 到标准输出 | - |
| `--jsonl` | 输出 JSONL 流（批量模式） | - |
| `--debug` | 保存调试信息 | - |

## 浏览器与登录

### 首次运行

第一次运行 `article-clip` 时：
1. 会打开浏览器窗口
2. 导航到相应平台（Twitter/知乎）
3. 等待你登录
4. 保存会话供以后使用

### 会话持久化

登录状态保存在：
- Chrome: `~/.article-clip/session-chrome/`
- Edge: `~/.article-clip/session-edge/`

请在提示时关闭浏览器，以正确保存会话。

### 浏览器选择

```bash
# 自动检测（Edge -> Chrome 降级）
article-clip "链接"

# 强制使用 Chrome
article-clip "链接" --browser chrome

# 强制使用 Edge
article-clip "链接" --browser edge
```

## 去重机制

Article Clip 自动跳过已归档的内容：

```bash
# 第一次运行：归档该链接
article-clip "https://x.com/user/status/123"

# 第二次运行：跳过（已归档）
article-clip "https://x.com/user/status/123"
# 输出：⊘ Already archived: clips/twitter/2026/01/24/...

# 强制重新归档
article-clip "https://x.com/user/status/123" --force
```

输出目录中的 `.archived.json` 文件记录所有已归档的链接。

## 支持的平台

| 平台 | 链接格式 | 说明 |
|------|----------|------|
| Twitter/X | `x.com/*`, `twitter.com/*` | 需要登录获取完整内容 |
| 知乎 | `zhihu.com/*` | 支持回答和文章 |
| 微信公众号 | `mp.weixin.qq.com/*` | 公众号文章 |

## 开发

开发与贡献指南请参考 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

MIT
