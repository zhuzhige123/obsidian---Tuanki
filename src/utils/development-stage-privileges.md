# 🚀 开发阶段特权说明书

## 📋 当前项目状态

**项目阶段**: 开发阶段 (未发布)
**用户数据**: 无生产用户数据
**兼容性负担**: 无历史版本兼容需求
**技术债务**: 可以完全清理

## 🎯 开发阶段特权清单

### 1. 🔄 代码替换特权

#### 立即删除权限
```typescript
// ✅ 发现更好方案时立即删除旧代码
// 旧实现
class OldCardManager {
  processCard() { /* 旧逻辑 */ }
}

// 直接替换，无需保留
class CardManager {
  processCard() { /* 新逻辑 */ }
}
```

#### 直接重写权限
```typescript
// ✅ 不满意的实现直接重写
// 从复杂的实现
class ComplexImplementation {
  method1() { /* 复杂逻辑 */ }
  method2() { /* 复杂逻辑 */ }
  method3() { /* 复杂逻辑 */ }
}

// 直接简化为
class SimpleImplementation {
  unifiedMethod() { /* 简化逻辑 */ }
}
```

### 2. 🏗️ 架构重构特权

#### 破坏性变更权限
```typescript
// ✅ 可以完全改变API设计
// 旧API
interface OldAPI {
  saveCard(data: string): void;
}

// 直接改为新API
interface NewAPI {
  saveCard(card: CardData): Promise<SaveResult>;
}
```

#### 数据结构重构权限
```typescript
// ✅ 可以完全重新设计数据结构
// 旧结构
interface OldCardData {
  id: string;
  content: string;
}

// 直接改为新结构
interface CardData {
  id: CardId;
  content: MarkdownContent;
  metadata: CardMetadata;
  fsrsData: FSRSCardData;
  templateData: TemplateData;
}
```

### 3. 📁 文件结构重组特权

#### 目录结构重新设计
```
// ✅ 可以完全重新组织文件结构
// 旧结构
src/
  components/
  utils/
  types/

// 直接改为新结构
src/
  core/
    algorithms/
    data/
  ui/
    components/
    themes/
  integrations/
    obsidian/
    anki/
```

#### 模块拆分合并权限
```typescript
// ✅ 可以自由拆分或合并模块
// 将多个小模块合并为一个
// 或将大模块拆分为多个小模块
```

### 4. ⚙️ 配置格式变更特权

#### 配置文件格式自由变更
```json
// 旧配置格式
{
  "settings": {
    "maxCards": 50
  }
}

// 直接改为新格式
{
  "fsrs": {
    "parameters": {...},
    "optimization": {...}
  },
  "ui": {
    "theme": "auto",
    "maxCardsPerSession": 50
  }
}
```

### 5. 🧪 实验性功能管理特权

#### 快速试错权限
```typescript
// ✅ 可以快速添加实验性功能
class ExperimentalFeature {
  // 如果实验失败，直接删除整个类
  // 无需考虑影响
}

// ✅ 可以快速移除失败的实验
// 直接删除，无需迁移逻辑
```

#### A/B测试权限
```typescript
// ✅ 可以同时实现多个方案进行对比
class AlgorithmA { /* 方案A */ }
class AlgorithmB { /* 方案B */ }

// 测试后直接选择最佳方案，删除其他方案
```

## 🚫 开发阶段应避免的过度设计

### 1. 避免假想的兼容性设计
```typescript
// ❌ 错误：为不存在的旧版本设计兼容
if (version === 'legacy') {
  // 处理不存在的旧格式
}

// ✅ 正确：专注当前最佳实现
// 直接实现最优方案
```

### 2. 避免过度抽象
```typescript
// ❌ 错误：为未来可能的需求过度抽象
abstract class AbstractCardProcessor {
  abstract process(): void;
}

// ✅ 正确：满足当前需求的简单实现
class CardProcessor {
  process() { /* 具体实现 */ }
}
```

### 3. 避免不必要的迁移逻辑
```typescript
// ❌ 错误：为开发阶段数据编写迁移
function migrateDevData() {
  // 开发阶段数据可以直接重置
}

// ✅ 正确：直接使用新格式
// 开发数据可以重置，无需迁移
```

## 📊 开发阶段质量保证

### 快速迭代质量检查
1. **功能完整性**: 确保核心功能正常工作
2. **代码清洁度**: 保持代码简洁和可读性
3. **性能基准**: 满足基本性能要求
4. **类型安全**: 保持TypeScript类型完整性

### 技术债务零容忍
- 发现问题立即修复
- 不满意的代码立即重写
- 过时的实现立即删除
- 复杂的逻辑立即简化

## 🎯 发布前准备阶段

### 何时开始考虑兼容性
- **Alpha版本**: 开始API稳定化
- **Beta版本**: 开始数据格式锁定
- **RC版本**: 开始向后兼容考虑
- **正式版本**: 完整兼容性保证

### 发布前检查清单
- [ ] API接口稳定
- [ ] 数据格式确定
- [ ] 配置结构固定
- [ ] 迁移工具准备
- [ ] 文档完整更新

## 💡 开发阶段最佳实践

### 1. 保持敏捷
- 快速试错，快速迭代
- 不满意就重来
- 简单有效优于复杂完美

### 2. 专注核心
- 实现核心功能
- 避免过度设计
- 满足当前需求即可

### 3. 质量优先
- 代码质量不妥协
- 架构清晰不妥协
- 性能标准不妥协

---

**文档版本**: v1.0  
**适用阶段**: 开发阶段 (未发布)  
**更新日期**: 2025年1月3日  
**核心理念**: 充分利用开发阶段的灵活性，快速迭代到最佳方案
