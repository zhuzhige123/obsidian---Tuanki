# Tuanki 简化卡片解析系统

## 📋 系统概述

Tuanki 简化卡片解析系统（SimplifiedCardParser）是插件的核心解析引擎，负责将 Markdown 内容转换为结构化的学习卡片。该系统采用基于可配置符号的解析方案，支持多种卡片类型和灵活的内容格式。

## 🎯 设计理念

### 核心原则
- **简化优先**：摒弃复杂的模板系统，采用直观的符号标记
- **配置灵活**：所有解析符号都可以用户自定义
- **内容保真**：保持 Markdown 原有格式，确保渲染质量
- **类型智能**：自动识别卡片类型，无需手动指定

### 技术优势
- **高性能**：轻量级解析引擎，响应迅速
- **易维护**：简洁的代码结构，便于扩展
- **用户友好**：符合用户直觉的操作方式
- **兼容性强**：支持各种 Markdown 语法和扩展

## 🔧 核心组件

### 1. SimplifiedCardParser
**功能**：主解析引擎，负责内容解析和卡片生成
- 解析 Markdown 内容为卡片数据
- 自动识别卡片类型（问答、选择、挖空）
- 提取标签和元数据信息
- 处理批量解析和单卡解析

### 2. CardParsingEngine
**功能**：解析规则引擎，管理解析逻辑
- 管理可配置的解析符号
- 实现解析规则的动态切换
- 提供解析结果的验证机制
- 支持自定义解析模板

### 3. SimplifiedParsingSettings
**功能**：配置界面组件，管理解析设置
- 符号配置管理（分隔符、标记符等）
- 解析选项设置（标签触发、模式选择等）
- 模板管理和编辑功能
- 实时预览和测试工具

## 📊 支持的卡片类型

### 1. 问答题（Q&A）
**格式特征**：使用 `---div---` 分隔正反面
```markdown
这是问题内容 #tag1
---div---
这是答案内容
```

**解析结果**：
- Front：问题内容
- Back：答案内容
- Tags：提取的标签

### 2. 选择题（Multiple Choice）
**格式特征**：包含选项列表
```markdown
Java 中基本类型不包括哪一个？ #quiz
- [ ] int
- [ ] boolean
- [x] string
- [ ] double
---div---
string 不是 Java 基本类型
```

**解析结果**：
- Front：题干 + 选项
- Back：答案解析
- 自动标记正确答案

### 3. 挖空题（Cloze）
**格式特征**：使用 `==高亮文本==` 标记挖空
```markdown
艾宾浩斯遗忘曲线提出者是 ==艾宾浩斯==。 #memory
```

**解析结果**：
- 自动生成挖空卡片
- 支持多个挖空点
- 智能编号管理

## ⚙️ 配置选项

### 核心符号配置
```typescript
interface ParsingConfig {
  // 批量扫描范围
  rangeStart: string;        // 默认: "---start---"
  rangeEnd: string;          // 默认: "---end---"
  
  // 卡片分隔
  cardDelimiter: string;     // 默认: "---卡片---"
  faceDelimiter: string;     // 默认: "---div---"
  
  // 特殊标记
  clozeMarker: string;       // 默认: "==文本=="
  triggerTag: string;        // 默认: "#tuanki"
  
  // 解析选项
  enableTagTrigger: boolean; // 默认: true
  preserveFormatting: boolean; // 默认: true
}
```

### 高级选项
- **标签触发**：可选择是否需要特定标签才解析
- **格式保留**：保持原始 Markdown 格式
- **错误容错**：解析失败时的处理策略
- **批量优化**：大量卡片的性能优化

## 🚀 使用示例

### 单卡解析
```typescript
const parser = new SimplifiedCardParser(config);
const card = await parser.parseCard(markdownContent);
```

### 批量解析
```typescript
const cards = await parser.parseBatch(documentContent);
```

### 配置管理
```typescript
const settings = new SimplifiedParsingSettings(plugin);
await settings.updateConfig(newConfig);
```

## 📈 性能特性

### 解析性能
- **单卡解析**：< 10ms
- **批量解析**：< 100ms（100张卡片）
- **内存占用**：< 50MB（大型文档）
- **错误恢复**：< 1ms

### 优化策略
- **懒加载**：按需加载解析规则
- **缓存机制**：智能缓存解析结果
- **并行处理**：支持多线程解析
- **增量更新**：只解析变更内容

## 🔮 未来规划

### 短期目标
- 增加更多卡片类型支持
- 优化解析性能和准确性
- 完善错误处理机制
- 扩展配置选项

### 长期愿景
- AI 辅助解析优化
- 社区模板分享
- 多语言内容支持
- 云端配置同步

---

**版本**：v1.0  
**状态**：正式发布  
**维护**：活跃开发中
