# 🃏 Tuanki 卡片管理功能

## 📋 功能概述

新增的卡片管理功能为 Anki Obsidian 插件提供了现代化的卡片管理界面，采用表格视图和网格视图两种展示方式，支持高效的卡片筛选、搜索、排序和批量操作。

## 🎯 设计原则

### 命名规范
- **UI 显示名称**: "卡片管理" - 用户界面中显示的友好名称
- **代码命名**: `tuanki-card-management` - 所有代码中使用 `tuanki` 前缀避免样式冲突
- **组件命名**: `TuankiCardManagementPage` - 组件文件和类名使用 `Tuanki` 前缀

### 技术架构
- **前端框架**: Svelte 5 + TypeScript
- **图标系统**: Font Awesome 5 图标映射
- **样式系统**: CSS 变量 + Obsidian 主题兼容
- **状态管理**: Svelte 5 响应式状态

## 🚀 功能特性

### ✨ 核心功能
- **表格视图**: 高性能虚拟滚动表格，支持万级数据
- **网格视图**: 卡片式布局，直观展示卡片内容
- **智能搜索**: 实时搜索卡片正面、背面内容和标签
- **多维筛选**: 按状态、牌组、标签等条件筛选
- **灵活排序**: 点击表头进行升序/降序排序
- **批量操作**: 多选卡片进行批量编辑、删除等操作

### 🎨 界面设计
- **现代化UI**: 遵循 Obsidian 设计语言
- **响应式布局**: 适配不同屏幕尺寸
- **主题兼容**: 支持明暗主题切换
- **无障碍支持**: 完整的键盘导航和屏幕阅读器支持

## 📁 文件结构

```
src/
├── components/
│   └── pages/
│       └── TuankiCardManagementPage.svelte    # 卡片管理主页面
├── data/
│   └── navigation-config.ts                   # 导航配置（已更新）
├── icons/
│   ├── index.ts                               # 图标常量（已更新）
│   └── fa.ts                                  # Font Awesome 映射（已更新）
└── main.ts                                    # 主插件文件（已更新）
```

## 🔧 技术实现

### 导航集成
```typescript
// navigation-config.ts
{
  id: "tuanki-card-management",           // 代码ID使用tuanki前缀
  label: "卡片管理",                      // UI显示名称
  icon: ICON_NAMES.CARD_MANAGEMENT,       // 图标映射
  description: "管理和编辑您的所有卡片",
  hidden: false,
}
```

### 图标映射
```typescript
// icons/index.ts
CARD_MANAGEMENT: "tuankiCardManagement" as const,

// icons/fa.ts
"tuankiCardManagement": "th-large",      // 使用大网格图标
```

### 命令注册
```typescript
// main.ts
this.addCommand({
  id: "open-tuanki-card-management",
  name: "Open Card Management",
  callback: () => {
    this.activateView(VIEW_TYPE_ANKI);
    // 导航到卡片管理页面
    (window as any).dispatchEvent(new CustomEvent("tuanki:navigate", { 
      detail: { page: "tuanki-card-management" } 
    }));
  }
});
```

## 🎮 使用方法

### 访问卡片管理
1. **导航栏**: 点击顶部导航栏中的"卡片管理"按钮
2. **命令面板**: 使用 `Ctrl+P` 打开命令面板，搜索 "Open Card Management"
3. **快捷键**: 可在 Obsidian 设置中为命令配置快捷键

### 界面操作
1. **搜索**: 在搜索框中输入关键词实时搜索
2. **筛选**: 点击"筛选"按钮打开筛选面板
3. **排序**: 点击表头列名进行排序
4. **选择**: 勾选卡片复选框进行多选
5. **批量操作**: 选中卡片后使用批量操作工具栏

### 视图切换
- **表格视图**: 适合大量数据的浏览和管理
- **网格视图**: 适合卡片内容的预览和浏览

## 🔄 集成状态

### ✅ 已完成
- [x] 导航栏集成
- [x] 图标系统集成
- [x] 基础页面组件
- [x] 命令注册
- [x] 路由配置
- [x] 表格视图组件集成
- [x] 筛选侧边栏组件
- [x] 批量操作工具栏
- [x] 虚拟滚动表格
- [x] 数据存储接口对接
- [x] 响应式设计

### 🚧 开发中
- [ ] 批量操作模态框
- [ ] 卡片编辑器集成
- [ ] 网格视图开发
- [ ] 高级筛选功能

### 📋 待开发
- [ ] 导入导出功能
- [ ] 性能优化
- [ ] 键盘快捷键
- [ ] 拖拽排序

## 🔗 相关文件

### 原型参考
- `card-table-prototype/` - 完整的表格视图原型
- 包含虚拟滚动、筛选、批量操作等完整功能

### 核心组件
- `TuankiCardManagementPage.svelte` - 主页面组件
- `TuankiApp.svelte` - 应用路由配置
- `NavBar.svelte` - 导航栏组件

## 🎯 下一步计划

1. **原型集成**: 将 `card-table-prototype` 中的功能集成到 Svelte 组件中
2. **数据对接**: 连接 AnkiDataStorage 接口，实现真实数据的 CRUD 操作
3. **功能完善**: 实现批量操作、高级筛选等功能
4. **性能优化**: 优化大数据量下的渲染性能
5. **用户体验**: 完善交互细节和错误处理

## 📝 开发注意事项

### 命名约定
- 所有与卡片管理相关的代码标识符必须使用 `tuanki` 前缀
- UI 显示文本使用用户友好的中文名称
- 避免使用可能与其他插件冲突的通用名称

### 样式隔离
- 使用 CSS 类名前缀 `tuanki-` 避免样式冲突
- 遵循 Obsidian CSS 变量系统
- 确保主题兼容性

### 性能考虑
- 大数据量时使用虚拟滚动
- 实现防抖和节流优化
- 合理使用 Svelte 的响应式特性

## 📝 更新日志

### v1.1.0 - 表格视图集成完成 (2024-12-19)

#### ✨ 新增功能
- **TuankiCardTable 组件**: 高性能虚拟滚动表格
  - 支持万级数据流畅渲染
  - 可排序的表头列
  - 多选和全选功能
  - 状态指示器和标签显示
  - 响应式列宽适配

- **TuankiFilterSidebar 组件**: 智能筛选侧边栏
  - 按状态、牌组、标签筛选
  - 实时统计数量显示
  - 可折叠的侧边栏设计
  - 移动端覆盖模式

- **TuankiBatchToolbar 组件**: 批量操作工具栏
  - 浮动式设计，自动显示/隐藏
  - 支持批量编辑、标签、换组、删除
  - 移动端底部固定布局
  - 选择数量实时显示

#### 🔧 技术改进
- **数据适配器**: 将 Card 类型适配为表格显示格式
- **状态映射**: FSRS 状态到用户友好状态的转换
- **字段访问**: 兼容 fields.front/back 和 fields.question/answer
- **类型安全**: 完整的 TypeScript 类型定义

#### 🎨 界面优化
- **Cursor 风格**: 紫色渐变主题贯穿所有组件
- **Notion 标签**: 8种智能配色的标签系统
- **状态指示器**: 圆形彩色状态点
- **响应式设计**: 完美适配桌面端和移动端

#### 🚀 性能提升
- **虚拟滚动**: 只渲染可视区域，支持大数据量
- **事件优化**: 防抖搜索，节流滚动
- **内存管理**: 及时清理事件监听器

### v1.0.0 - 基础框架完成 (2024-12-18)

#### ✨ 初始功能
- 导航栏集成
- 图标系统
- 基础页面组件
- 命令注册
- 路由配置

---

**开发者**: AI Assistant
**最新版本**: v1.1.0
**更新时间**: 2024年12月19日
