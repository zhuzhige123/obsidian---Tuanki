# 🚀 Augment编程助手规则快速参考 (开发阶段版)

## 🔥 P0级关键规则 (必须严格遵循)

> **开发阶段特权**: 项目尚未发布，无用户数据负担，可进行破坏性变更和直接替换

### 1. 反简化原则 🚫
```
❌ 绝对禁止：因复杂性而采用简化方案
✅ 必须做到：保持现有功能完整性和技术水准
✅ 优先选择：符合项目最佳实践的复杂方案
```

**典型场景**:
- FSRS算法 → 不得简化为基础间隔算法
- CodeMirror 6 → 不得退回到简单文本框
- Svelte 5 Runes → 不得降级到旧式响应式

### 2. 深度分析机制 🔍
```
触发条件：同一问题 > 2次修改失败
强制要求：暂停快速响应，进行全面分析
分析维度：技术/架构/业务/环境
输出格式：结构化分析报告
```

**分析模板**:
```
🔍 深度分析报告
问题描述: [详细描述]
失败历史: [前两次失败原因]
根因分析: [四维度分析]
系统性问题: [深层问题识别]
解决策略: [综合方案]
风险评估: [实施风险]
```

### 3. 避免硬编码原则 🔒
```
❌ 绝对禁止：硬编码路径、配置、业务逻辑、文本
✅ 必须做到：配置化、常量化、环境变量化
✅ 支持特性：运行时可调整、用户个性化
```

**代码示例**:
```typescript
// ❌ 错误：硬编码
const maxCards = 50;
const apiUrl = "https://api.tuanki.com";

// ✅ 正确：配置化
const maxCards = this.settings.maxCardsPerSession;
const apiUrl = this.settings.syncEndpoint || DEFAULT_SYNC_ENDPOINT;
```

### 4. 开发阶段直接替换 🔄
```
开发阶段特权：无用户数据和兼容性负担
核心策略：立即删除旧代码，直接替换为新方案
允许操作：破坏性变更、结构重构、API修改
```

**直接替换模式**:
```typescript
// ❌ 错误：开发阶段还保留旧代码
class DataManager {
  @deprecated("使用newMethod")
  oldMethod() { /* 不必要的保留 */ }
  newMethod() { /* 新实现 */ }
}

// ✅ 正确：直接替换
class DataManager {
  newMethod() { /* 新实现，直接删除旧代码 */ }
}

// ✅ 允许破坏性变更
interface CardData {
  // 直接修改结构，无需兼容旧格式
  id: string;
  content: string;
  fsrsData: FSRSCardData; // 新增字段
}
```

## 🎯 工作模式快速切换

### 模式声明格式
```
[模式: 研究分析] - 深度理解代码和需求
[模式: 创新构思] - 探索技术方案
[模式: 规划设计] - 制定详细实施计划
[模式: 执行实施] - 严格按计划实施
[模式: 审查验证] - 验证实施质量
```

### 切换信号
```
"进入研究模式" / "ENTER RESEARCH MODE"
"进入创新模式" / "ENTER INNOVATE MODE"
"进入规划模式" / "ENTER PLAN MODE"
"进入执行模式" / "ENTER EXECUTE MODE"
"进入审查模式" / "ENTER REVIEW MODE"
```

## 🏗️ Tuanki项目核心约束

### 技术栈要求
```typescript
// Svelte 5 Runes模式
let count = $state(0);
let doubled = $derived(count * 2);

// TypeScript严格模式
interface CardData {
  id: string;
  content: string;
  fsrsData: FSRSCardData;
}

// 统一错误处理
try {
  const result = await operation();
  return { success: true, data: result };
} catch (error) {
  return { success: false, error: error.message };
}
```

### 核心不变特性
1. **CodeMirror 6独立编辑器** - UnifiedCodeMirrorEditor
2. **Markdown双向解析** - 完整Obsidian语法支持
3. **三元组模板系统** - Anki兼容映射
4. **FSRS6标准算法** - 个性化优化支持
5. **Obsidian深度集成** - 主题自适应
6. **本地数据优先** - 隐私保护策略

### 性能指标
```
响应时间: < 100ms
内存使用: < 100MB
缓存命中率: > 80%
错误率: < 1%
类型覆盖: 100%
```

## ⚠️ 常见违规示例

### ❌ 错误做法
```typescript
// 简化FSRS算法
const nextInterval = lastInterval * 2;

// 使用any类型
const data: any = {};

// 硬编码配置
const maxCards = 50;
const apiUrl = "https://api.tuanki.com";

// 开发阶段保留无用旧代码
@deprecated("旧方法") // 开发阶段应该直接删除
oldMethod() { /* 不必要的保留 */ }

// 快速给出答案（2次失败后）
// 直接提供解决方案而不深度分析
```

### ✅ 正确做法
```typescript
// 保持FSRS复杂性
const nextInterval = fsrs.calculateNextInterval(card, rating, params);

// 严格类型定义
interface CardData { id: string; content: string; }

// 配置化设计
const maxCards = this.settings.maxCardsPerSession;
const apiUrl = this.settings.syncEndpoint || DEFAULT_SYNC_ENDPOINT;

// 开发阶段直接替换
// 直接删除旧方法，只保留新实现
newMethod() { /* 新实现 */ }

// 深度分析（2次失败后）
// 进行四维度全面分析
```

## 🎨 代码质量检查清单

### 提交前检查
- [ ] TypeScript编译无错误
- [ ] ESLint检查通过
- [ ] 使用Svelte 5 Runes模式
- [ ] 包含适当的错误处理
- [ ] 遵循项目命名约定
- [ ] 添加必要的注释
- [ ] 更新相关文档

### 架构检查
- [ ] 遵循分层架构原则
- [ ] 避免循环依赖
- [ ] 使用依赖注入模式
- [ ] 实现适当的缓存策略
- [ ] 包含资源清理机制

## 🌐 语言和交流

**默认语言**: 简体中文
**模式声明**: 每次响应必须声明当前模式
**专业术语**: 使用Tuanki项目特定术语
**代码注释**: 关键逻辑必须有中文注释

---

## 🎯 开发阶段特殊优势

### 快速迭代权限
- ✅ 立即删除不满意的代码
- ✅ 直接重写整个模块
- ✅ 破坏性API变更
- ✅ 数据结构完全重构
- ✅ 文件结构重新组织

### 无负担开发
- 🚫 无需考虑向后兼容
- 🚫 无需数据迁移逻辑
- 🚫 无需保留旧接口
- 🚫 无需渐进式升级

---

**快速参考版本**: v2.3 (开发阶段优化版)
**对应规则集**: augment-ai-rules.md v2.3
**更新日期**: 2025年1月3日
**开发阶段特权**: 直接替换、破坏性变更、无兼容性负担
**使用建议**: 开发前必读，充分利用开发阶段的灵活性
