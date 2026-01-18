# Image Position Fix Design

> **Date:** 2026-01-18
> **Status:** Design Complete

## Problem Statement

当前实现的图片归档功能存在位置错乱问题：

**现象：**
- Twitter: 图片全部追加在文章末尾
- 实际应该是：图片嵌入在文字的原始位置

**示例：**
```
原始推文: 文字第一段 [图1] 文字第二段 [图2]
当前输出: 文字第一段 文字第二段 [图1] [图2]
期望输出: 文字第一段 [图1] 文字第二段 [图2]
```

---

## Root Cause Analysis

### Twitter Adapter

**blocks 生成顺序** (`src/core/extract/adapters/twitter/block-builder.ts:29-35`):

```typescript
// 1. Tweet text (paragraph)
if (tweet.text) {
  blocks.push({ type: 'paragraph', content: text });
}

// 2. Hashtags
for (const hashtag of tweet.hashtags) {
  blocks.push({ type: 'hashtag', ... });
}

// 3. Images - 所有图片在这里！
for (const media of tweet.media) {
  blocks.push({ type: 'image', ... });
}
```

**问题根源：**
- Twitter API 的 `tweet.text` 是纯文字，不含图片
- `tweet.media` 是独立的数组，丢失了位置信息
- 图片被批量添加，而不是在原始位置

### Markdown Generator

**当前实现是正确的** (`src/core/export/markdown.ts:34-35`):

```typescript
private blocksToMarkdown(blocks: Block[], ...): string {
  return blocks.map(block => this.blockToMarkdown(block, ...)).join('\n\n');
}

case 'image':
  return `![${block.alt}](${filename})`;  // 正确处理 ImageBlock
```

Markdown 生成器没有问题，问题在 adapter 层面。

---

## Solution: Two-Phase Approach

### Phase 1: Fix Current Implementation (Immediate)

#### Twitter: Use DOM Order Parsing

**修改文件:** `src/core/extract/adapters/twitter/html-to-blocks.ts`

**策略:** 放弃先提取 text 再提取 media 的方式，改为按 DOM 顺序遍历

**新实现:**

```typescript
async buildBlocks($: CheerioAPI, tweet: ParsedTweet): Promise<Block[]> {
  const blocks: Block[] = [];

  // 找到推文的主容器
  const tweetBody = tweetElement.find('[data-testid="tweetText"]');

  // 按 DOM 顺序遍历所有子元素
  tweetBody.contents().each((_, elem) => {
    if (elem.type === 'text') {
      // 文本节点
      const text = $(elem).text().trim();
      if (text) {
        // 合并到上一个 paragraph 或创建新的
        // ... 处理文本
      }
    } else if ($(elem).is('img')) {
      // 图片：直接在当前位置创建 ImageBlock
      blocks.push({
        type: 'image',
        url: $(elem).attr('src'),
        alt: $(elem).attr('alt') || ''
      });
    } else if ($(elem).is('br')) {
      // 换行符
      // ... 处理换行
    }
  });

  return blocks;
}
```

**关键改进:**
- 图片在它们原始的 DOM 位置
- 保留推文的自然流结构

#### Zhihu: Verify Current Implementation

**检查文件:** `src/core/extract/adapters/zhihu/html-to-blocks.ts`

**当前实现已经使用 DOM 顺序**:

```typescript
// zhihu/html-to-blocks.ts (行 80)
blocks.push({ type: 'image', url: src, alt: $(node).attr('alt') || '' });
```

**行动:** 验证知乎图片位置是否正确，如果不正确则应用类似修复

---

### Phase 2: Add `blockId` Support (Future-Proofing)

#### Data Structure Changes

**修改文件:** `src/core/types/index.ts`

```typescript
export interface AssetImage {
  url: string;
  alt: string;
  filenameHint?: string;
  blockId?: string;      // 新增：关联的 block ID
  position?: number;     // 新增：位置索引（fallback）
}
```

#### Extraction with blockId

**修改文件:** `src/core/extract/adapters/twitter/parser.ts`

```typescript
const mediaWithPosition: AssetImage[] = media.map((img, index) => ({
  url: img.url,
  alt: img.alt || '',
  blockId: `media_${Date.now()}_${index}`,  // 唯一 ID
  position: index
}));
```

#### Use Cases for `blockId`

- **复杂嵌套结构:** 图片在引用推文内部
- **富文本平台:** WeChat 公众号（未来）
- **调试:** 追踪图片来源

---

## Implementation Tasks

### Task 1: Refactor Twitter HTML Parsing

**Priority:** 🔴 P0

**Files:**
- `src/core/extract/adapters/twitter/html-to-blocks.ts`

**Steps:**
1. 按子元素顺序遍历 DOM
2. 文本节点 → 累积到 paragraph
3. `<img>` → 立即创建 ImageBlock
4. `<br>` → 换行符
5. 其他元素 → 相应处理

### Task 2: Add blockId to AssetImage

**Priority:** 🟡 P1

**Files:**
- `src/core/types/index.ts`
- `src/core/extract/adapters/twitter/index.ts`

**Steps:**
1. 添加 `blockId?: string` 到 AssetImage
2. 提取时生成唯一 blockId
3. 更新测试

### Task 3: Verify Zhihu Image Position

**Priority:** 🟢 P2

**Files:**
- `src/core/extract/adapters/zhihu/html-to-blocks.ts`

**Steps:**
1. 检查当前实现
2. 用真实知乎文章测试
3. 如有问题，应用类似修复

### Task 4: Integration Testing

**Priority:** 🟢 P2

**Test URLs:**
- Twitter with interleaved images
- Zhihu article with images
- Long-form content

**Expected Result:**
```
原文: 段落1 [图1] 段落2 [图2]
输出: 段落1 [图1] 段落2 [图2]
```

---

## Cross-Platform Impact

| Platform | Current Status | Action Required |
|----------|---------------|-----------------|
| Twitter | ❌ 图片在末尾 | ✅ Phase 1 修复 |
| Zhihu | ⚠️ 需验证 | 验证，可能需要修复 |
| WeChat | ⏳ 未实现 | 使用 DOM 顺序策略 |

---

## Backward Compatibility

**数据结构变化:**
- `blockId` 和 `position` 是可选字段
- 未使用的平台继续工作
- 现有 API 不受影响

**测试要求:**
- 回归测试确保不破坏现有功能
- 多平台内容验证

---

## Success Criteria

1. ✅ Twitter 图片在正确位置
2. ✅ Zhihu 图片在正确位置
3. ✅ 数据结构扩展（`blockId`）
4. ✅ 所有测试通过
5. ✅ 向后兼容保持
