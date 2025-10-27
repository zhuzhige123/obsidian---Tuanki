# 文档写入逻辑 - 待完善事项

**创建时间**: 2025-10-20  
**优先级**: P1  
**状态**: 框架已完成，核心逻辑待实现

## 📋 概述

`TuankiIdentifierService` 中的文档写入方法已有框架，但核心写入逻辑标记为TODO。这些方法负责将UUID和BlockID精确写入Obsidian Markdown文档。

## ✅ 已完成

### 方法框架
- ✅ `writeUUIDToDocument()`: UUID写入方法声明
- ✅ `writeBlockIDToDocument()`: BlockID写入方法声明
- ✅ 写入格式定义（constants.ts）
- ✅ 错误处理框架

### 格式规范
```typescript
// UUID写入格式
HTML_COMMENT: (uuid) => `<!-- tuanki-uuid: ${uuid} -->`
YAML_FIELD: (uuid) => `tuanki-uuid: ${uuid}`

// BlockID写入格式
STANDARD: (blockId) => `^${blockId}`  // Obsidian标准格式
```

## 🔧 待实现功能

### 1. 精确定位插入位置 ⭐⭐⭐
**复杂度**: 高  
**依赖**: `SimplifiedCardParser`, `AnnotationDetector`

**需求**:
- 批量解析场景：
  - 找到卡片内容在文档中的确切位置
  - 在卡片内容末尾（分隔符`---div---`之前）插入UUID
  - 避免破坏卡片结构
  
- 标注块场景：
  - 定位标注块的YAML frontmatter位置
  - 插入`tuanki-uuid`字段
  - 保持YAML格式正确

- BlockID插入：
  - 在段落或块的末尾追加`^blockId`
  - 确保符合Obsidian块引用规范

**参考代码**:
```typescript
// 示例：定位卡片内容
function findCardPosition(content: string, cardContent: string): {
  start: number;
  end: number;
  insertPosition: number;
} {
  // 1. 搜索卡片内容的起始位置
  const start = content.indexOf(cardContent);
  
  // 2. 找到分隔符位置
  const dividerPos = content.indexOf('---div---', start);
  
  // 3. UUID插入点：分隔符之前
  return {
    start,
    end: dividerPos > 0 ? dividerPos : start + cardContent.length,
    insertPosition: dividerPos > 0 ? dividerPos - 1 : start + cardContent.length
  };
}
```

### 2. 文档修改服务（DocumentModifier）⭐⭐
**复杂度**: 中  
**新文件**: `src/services/document/DocumentModifier.ts`

**功能需求**:
- 原子性文档修改
- 冲突检测（文件是否被其他进程修改）
- 行号计算
- 批量写入优化

**接口设计**:
```typescript
interface DocumentModifier {
  /**
   * 在指定位置插入文本
   */
  insertAt(
    file: TFile,
    position: number,
    text: string,
    options?: {
      atomicWrite?: boolean;
      backupFirst?: boolean;
    }
  ): Promise<{
    success: boolean;
    lineNumber: number;
    error?: string;
  }>;
  
  /**
   * 批量插入
   */
  insertBatch(
    file: TFile,
    insertions: Array<{ position: number; text: string }>
  ): Promise<{
    success: boolean;
    count: number;
    errors: string[];
  }>;
  
  /**
   * 检测文件修改冲突
   */
  detectConflict(file: TFile, expectedHash: string): Promise<boolean>;
}
```

### 3. 重复检测与去重 ⭐
**复杂度**: 低  
**位置**: `TuankiIdentifierService`

**需求**:
- 检查文档中是否已存在UUID/BlockID
- 避免重复写入
- 提供覆盖选项

**实现思路**:
```typescript
async function checkExistingUUID(content: string, uuid: string): Promise<boolean> {
  // 正则匹配UUID标记
  const uuidRegex = /<!-- tuanki-uuid: ([a-z0-9-]+) -->/g;
  const matches = content.matchAll(uuidRegex);
  
  for (const match of matches) {
    if (match[1] === uuid) {
      return true; // 已存在
    }
  }
  
  return false;
}
```

### 4. 行号计算 ⭐
**复杂度**: 低  
**位置**: `DocumentModifier`

**需求**:
- 根据字符位置计算行号
- 返回准确的行号用于日志和错误报告

**实现**:
```typescript
function getLineNumber(content: string, position: number): number {
  const before = content.substring(0, position);
  return before.split('\n').length;
}
```

### 5. 写入验证 ⭐
**复杂度**: 低  
**位置**: `TuankiIdentifierService`

**需求**:
- 写入后读取验证
- 确保写入成功且格式正确
- 记录失败日志

## 📊 实施优先级

### Phase 1: 核心功能（P0）
1. [ ] 实现`DocumentModifier`基础服务
2. [ ] 完成`findCardPosition()`精确定位
3. [ ] 实现批量解析场景的UUID写入
4. [ ] 添加重复检测逻辑

### Phase 2: 增强功能（P1）
5. [ ] 实现标注块场景的YAML写入
6. [ ] 完善BlockID写入逻辑
7. [ ] 添加原子性保证和冲突检测
8. [ ] 实现写入验证

### Phase 3: 优化（P2）
9. [ ] 批量写入性能优化
10. [ ] 错误恢复机制
11. [ ] 单元测试
12. [ ] 性能测试

## 🔗 相关文件

**需要修改**:
- `src/services/identifier/TuankiIdentifierService.ts`
- `src/services/batch-parsing/UUIDManager.ts`（可能需要重构）

**需要创建**:
- `src/services/document/DocumentModifier.ts`（新建）
- `src/services/document/types.ts`（新建）
- `src/services/document/index.ts`（新建）

**需要集成**:
- `src/utils/simplifiedParser/SimplifiedCardParser.ts`
- `src/services/AnnotationDetector.ts`

## 📌 注意事项

1. **Obsidian文件系统限制**:
   - 需要使用`app.vault.modify()`或`app.vault.adapter.write()`
   - 考虑文件锁和并发写入问题
   - 大文件性能优化

2. **Markdown格式兼容性**:
   - 不破坏现有Markdown语法
   - BlockID符合Obsidian规范
   - HTML注释不影响渲染

3. **向后兼容性**:
   - 支持旧UUID格式识别
   - 不强制迁移现有文档
   - 提供可选的升级工具

4. **用户体验**:
   - 写入操作应该是透明的
   - 失败时提供清晰的错误提示
   - 支持撤销（通过Obsidian的undo机制）

## 🎯 成功标准

- [ ] UUID和BlockID能够精确写入到文档指定位置
- [ ] 不破坏现有文档结构和内容
- [ ] 写入操作原子性，不会导致文件损坏
- [ ] 性能满足要求（单文件写入 < 100ms）
- [ ] 通过所有单元测试和集成测试

---

**负责人**: 待分配  
**预计工时**: 8-10小时  
**最后更新**: 2025-10-20


