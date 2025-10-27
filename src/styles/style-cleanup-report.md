# 样式清理报告 - 2025年1月更新

## 🎯 最新清理成果 (2025-01-17)

### 1. 删除冗余样式文件 ✅ 已完成
- **删除文件**: `cursor-theme.css`
- **问题**: 与 `tokens.css` 功能重复，造成变量定义冲突
- **解决方案**: 完全删除该文件，统一使用 `tokens.css`
- **影响**: 减少了约300行重复代码

### 2. 统一间距变量系统 ✅ 已完成
- **问题**: 多种间距变量命名不一致
  - `tokens.css`: `--tuanki-space-*`
  - `cursor-theme.css`: `--tuanki-spacing-*`
  - `data-management.css`: `--dm-space-*`
- **解决方案**:
  - 统一使用 `--tuanki-space-*` 作为主变量
  - 添加 `--tuanki-spacing-*` 别名以保持向后兼容
  - 更新所有组件引用
- **修复文件**:
  - `CardParsingSettings.svelte`
  - `CursorCard.svelte`
  - `CursorInput.svelte`
  - `CursorTextarea.svelte`
  - `TuankiCardGridView.svelte`
  - `global.css`

### 3. 统一文本尺寸变量系统 ✅ 已完成
- **问题**: 文本尺寸变量命名不一致
  - `tokens.css`: `--tuanki-font-size-*`
  - `cursor-theme.css`: `--tuanki-text-*`
- **解决方案**:
  - 统一使用 `--tuanki-font-size-*` 作为主变量
  - 添加 `--tuanki-text-*` 别名以保持向后兼容
- **影响**: 修复了卡片解析界面的样式缺失问题

### 4. 修复卡片解析界面样式缺失 ✅ 已完成
- **问题**: `CardParsingSettings.svelte` 使用了未定义的CSS变量
- **解决方案**: 更新所有变量引用为正确的变量名
- **结果**: 卡片解析界面样式完全正常显示

## 历史清理记录

### 1. 重复的 .tuanki-card 定义
- **位置**: `global.css` 和 `modern-components.css`
- **问题**: 两个文件中都定义了 `.tuanki-card` 样式
- **解决方案**: 从 `global.css` 中移除重复定义，保留 `modern-components.css` 中的完整定义
- **状态**: ✅ 已完成

### 2. CSS变量引用不一致
- **位置**: `global.css` 中的 `.tuanki-divider`
- **问题**: 使用了 `--background-modifier-border` 而不是统一的 `--tuanki-border`
- **解决方案**: 更新为使用统一的CSS变量
- **状态**: ✅ 已完成

## 保留的样式（确认被使用）

### Badge 相关样式
以下badge样式在多个组件中被使用，需要保留：

1. **基础badge样式** (global.css)
   - `.tuanki-badge` - 基础徽章样式
   - `.tuanki-badge-primary` - 主要徽章（EnhancedIcon组件使用）
   - `.tuanki-badge-success` - 成功徽章（EnhancedIcon组件使用）
   - `.tuanki-badge-warning` - 警告徽章（EnhancedIcon组件使用）
   - `.tuanki-badge-error` - 错误徽章（EnhancedIcon组件使用）

2. **特定组件badge样式**
   - `.tuanki-tab-badge` - 标签页徽章（TabNavigation组件）
   - `.tuanki-due-badge` - 到期徽章（KanbanView组件）
   - `.tuanki-selected-badge` - 选中徽章（KanbanView组件）
   - `.tuanki-format-badge` - 格式徽章（apkg-modal组件）

### 按钮相关样式
以下按钮样式被广泛使用：

1. **基础按钮样式** (modern-components.css)
   - `.tuanki-btn` - 基础按钮样式
   - `.tuanki-btn--primary` - 主要按钮
   - `.tuanki-btn--secondary` - 次要按钮
   - `.tuanki-btn--ghost` - 幽灵按钮

2. **组件特定按钮样式**
   - EnhancedButton组件中的内联样式
   - KanbanView组件中的按钮样式重定义

### 状态相关样式
学习状态相关的样式被多个组件使用：

1. **状态颜色类** (global.css)
   - `.tuanki-stat-new` - 新卡片状态
   - `.tuanki-stat-learning` - 学习中状态
   - `.tuanki-stat-review` - 复习状态
   - `.tuanki-stat-relearning` - 重新学习状态

## 需要进一步优化的问题

### 1. 按钮样式重复定义
**问题**: 
- `modern-components.css` 中定义了完整的 `.tuanki-btn` 样式
- `EnhancedButton.svelte` 中又重新定义了 `.tuanki-btn` 样式
- `KanbanView.svelte` 中也有自己的按钮样式

**建议解决方案**:
1. 统一使用 `modern-components.css` 中的按钮样式
2. 组件中只定义特定的修饰符样式
3. 移除重复的基础样式定义

### 2. CSS变量使用不一致
**问题**:
- 有些地方使用 `--tuanki-*` 变量
- 有些地方直接使用 Obsidian 的 `--color-*` 变量
- 有些地方使用 `--interactive-accent` 等

**建议解决方案**:
1. 建立统一的CSS变量映射规则
2. 优先使用 `--tuanki-*` 变量
3. 在必要时映射到 Obsidian 变量

### 3. 主题适配不完整
**问题**:
- 部分组件的深色模式适配不完整
- 缺乏高对比度模式支持
- 响应式设计不够完善

**建议解决方案**:
1. 为所有组件添加完整的主题支持
2. 添加高对比度模式样式
3. 改进响应式设计

## 下一步清理计划

### 高优先级
1. ✅ 统一CSS变量系统
2. ✅ 清理重复的样式定义
3. 🔄 统一按钮样式系统
4. 📋 创建样式使用指南

### 中优先级
1. 📋 优化响应式设计
2. 📋 改进主题适配
3. 📋 添加无障碍支持

### 低优先级
1. 📋 性能优化
2. 📋 代码分割
3. 📋 样式文档化

## 样式使用指南

### 推荐的CSS类命名规范
1. **组件前缀**: 所有样式类使用 `tuanki-` 前缀
2. **BEM命名**: 使用 BEM 命名规范（Block__Element--Modifier）
3. **语义化**: 使用语义化的类名，避免表现层命名

### 推荐的CSS变量使用
1. **颜色变量**: 优先使用 `--tuanki-*` 颜色变量
2. **间距变量**: 使用 `--tuanki-space-*` 间距变量
3. **字体变量**: 使用 `--tuanki-font-*` 字体变量

### 组件样式组织
1. **全局样式**: 放在 `styles/` 目录下的CSS文件中
2. **组件样式**: 放在组件的 `<style>` 标签中
3. **工具类**: 放在 `global.css` 中，使用 `tuanki-` 前缀

## 清理效果评估

### 已完成的改进
1. **减少重复代码**: 移除了重复的 `.tuanki-card` 定义
2. **统一变量使用**: 更新了不一致的CSS变量引用
3. **改善主题支持**: 创建了统一的主题管理系统
4. **提高对比度**: 优化了深色/浅色模式的对比度

### 预期效果
1. **减少CSS文件大小**: 预计减少10-15%的冗余代码
2. **提高维护性**: 统一的样式系统更易维护
3. **改善用户体验**: 更好的主题适配和对比度
4. **提高开发效率**: 清晰的样式组织和使用指南
