# 去重逻辑设计文档

**Date:** 2026-01-19
**Status:** Design Approved

---

## 概述

为 clip 项目添加去重逻辑，避免重复归档同一内容。支持批量模式自动跳过、单次模式交互式控制，以及强制覆盖选项。

---

## 架构设计

### 核心组件

```
src/core/dedupe/
├── index.ts           # 导出
├── manager.ts         # DedupeManager 类
├── strategy.ts        # getDedupeKey 等工具函数
├── types.ts           # ArchiveRecord 接口
└── __tests__/
    ├── manager.test.ts
    └── strategy.test.ts
```

### 数据结构

```typescript
// .archived.json
{
  "archived": {
    "https://x.com/user/status/123": {
      "firstSeen": "2026-01-19T10:00:00Z",
      "lastUpdated": "2026-01-19T10:00:00Z",
      "path": "./twitter/2026/01/19/abc/",
      "platform": "twitter"
    }
  },
  "version": 1
}
```

---

## 去重策略

### 去重键优先级

```typescript
function getDedupeKey(doc: ClipDoc): string {
  // 优先：canonicalUrl
  // 其次：normalizeUrl(sourceUrl)
  return doc.canonicalUrl || normalizeUrl(doc.sourceUrl);
}
```

### 两级检查（解决鸡蛋问题）

1. **第一级**：用 URL 预检查（快速，过滤大部分重复）
2. **第二级**：render 后用 canonicalUrl 精确确认

---

## CLI 集成

### 选项

```bash
# 默认：遇到重复跳过
clip "url"

# 强制覆盖
clip "url" --force

# 详细输出
clip "url" --verbose
```

### 批量模式

```bash
clip --file urls.txt
# ✓ https://x.com/user/status/456
# ⊘ https://x.com/user/status/123 (already archived)
```

---

## 工作流程

### 单次归档

```
1. 检查去重（非 --force）
   ├─ 读取 <output-dir>/.archived.json
   ├─ 计算 dedupeKey
   ├─ 如果存在：返回 ALREADY_ARCHIVED
   └─ 否则：继续
2. 执行归档（render → extract → export）
3. 添加记录到 .archived.json
```

### 批量归档

```
1. 创建共享 DedupeManager
2. 遍历 URLs，检查去重
3. 跳过已归档，处理新内容
4. 统计包含跳过数量
```

---

## 错误处理

### 边界情况

| 场景 | 处理方式 |
|------|----------|
| 文件不存在 | 正常创建 |
| 文件损坏 | 备份为 .bak，重建 |
| 并发写入 | 3 次重试，间隔 100ms |
| 路径变更 | 每个目录独立记录 |
| canonicalUrl 变化 | 支持别名映射 |

---

## ExportOptions 扩展

```typescript
export interface ExportOptions {
  outputDir: string;
  format: 'md' | 'md+html';
  downloadAssets: boolean;
  json?: boolean;
  debug?: boolean;

  // 新增
  force?: boolean;      // 强制覆盖
  verbose?: boolean;    // 详细输出
}
```

---

## 错误码

```typescript
enum ErrorCode {
  // ... existing
  ALREADY_ARCHIVED = 'ALREADY_ARCHIVED',
}
```
