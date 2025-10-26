# 虚拟滚动优化指南

## 概述

Tuanki 插件集成了强大的虚拟滚动功能，用于优化大量卡片的显示性能。当卡片数量超过一定阈值时，虚拟滚动会自动启用，大幅减少 DOM 节点数量，提升渲染性能和滚动流畅度。

## 功能特性

### ✨ 核心功能

- **自动虚拟化**：超过 200 张卡片自动启用虚拟滚动
- **动态高度支持**：使用 TanStack Virtual 库支持不同高度的卡片
- **智能高度估算**：基于内容长度、Markdown 复杂度和布局模式智能估算高度
- **高度缓存**：LRU 缓存策略缓存已测量的卡片高度
- **性能监控**：内置性能监控服务，实时追踪渲染性能

### 🎯 视图支持

#### 看板视图（Kanban）

- **列内虚拟化**：每列独立启用虚拟滚动
- **渐进式加载**：初始加载 30 张卡片，支持按需加载更多
- **拖拽支持**：完整保留拖拽功能
- **自适应阈值**：超过 200 张卡片自动启用

#### 表格视图（Table）

- **分页优先**：默认使用分页模式（< 500 条数据）
- **虚拟滚动可选**：可在设置中启用虚拟滚动替代分页
- **固定行高**：表格使用固定行高以获得最佳性能

## 配置说明

### 访问配置

1. 打开 Tuanki 插件设置
2. 切换到 **"性能优化"** 标签页
3. 根据需要调整各项配置

### 主要配置项

#### 看板视图配置

| 配置项 | 默认值 | 说明 |
|-------|--------|------|
| 启用虚拟滚动 | ✅ 开启 | 总开关，控制是否使用虚拟滚动 |
| 列内虚拟化 | ✅ 开启 | 单独对每一列启用虚拟滚动 |
| 预渲染数量 (Overscan) | 5 | 视口外预渲染的卡片数量 |
| 初始加载数量 | 30 | 每列初始加载的卡片数量 |
| 批量加载数量 | 20 | 点击"加载更多"时一次加载的数量 |

#### 表格视图配置

| 配置项 | 默认值 | 说明 |
|-------|--------|------|
| 启用虚拟滚动 | ❌ 关闭 | 表格视图默认使用分页 |
| 启用表格虚拟滚动 | ❌ 关闭 | 对表格行启用虚拟滚动 |
| 分页阈值 | 500 | 少于此数量使用分页而非虚拟滚动 |

#### 高级选项

| 配置项 | 默认值 | 说明 |
|-------|--------|------|
| 缓存测量高度 | ✅ 开启 | 缓存卡片的测量高度以提升性能 |
| 估算项目高度 | 200px | 虚拟滚动的初始高度估算值 |

## 技术架构

### 核心组件

```
src/
├── types/
│   ├── virtualization-types.ts      # 虚拟化类型定义
│   └── card-render-types.ts         # 卡片渲染类型
├── utils/
│   └── card-height-estimator.ts     # 高度估算工具
├── services/
│   ├── height-cache-service.ts      # 高度缓存服务（LRU）
│   ├── virtualization-config-manager.ts  # 配置管理器
│   └── virtualization-monitor.ts    # 性能监控服务
└── components/
    └── kanban/
        ├── CardSkeleton.svelte             # 骨架屏组件
        ├── VirtualCardWrapper.svelte       # 卡片包装器
        └── VirtualKanbanColumn.svelte      # 虚拟列组件
```

### 技术栈

- **核心库**：`@tanstack/svelte-virtual` v3.13.12
- **框架**：Svelte 5 (Runes 模式)
- **类型**：TypeScript (严格模式)
- **缓存**：LRU (Least Recently Used) 策略

## 性能优化建议

### 🚀 最佳实践

1. **保持默认配置**：默认配置已经过优化，适合大多数场景
2. **适度 Overscan**：过大的 Overscan 值会占用更多内存
3. **启用高度缓存**：显著提升滚动性能，强烈推荐
4. **监控性能指标**：关注 FPS 和虚拟化比率

### ⚙️ 调优指南

#### 场景 1：卡片数量 < 200

- 建议：关闭虚拟滚动，使用默认渲染
- 原因：虚拟滚动的开销大于收益

#### 场景 2：卡片数量 200-1000

- 建议：使用默认配置
- Overscan：5
- 初始加载：30

#### 场景 3：卡片数量 > 1000

- 建议：调整配置以优化性能
- Overscan：3（减少内存占用）
- 初始加载：20（加快首次渲染）

### 📊 性能指标

虚拟滚动开启后，你可以期待：

- **DOM 节点减少**：95%+ （1000 张卡片 → 50 个 DOM 节点）
- **首次渲染时间**：< 200ms
- **滚动帧率**：> 55 FPS
- **内存占用**：显著降低

## 故障排除

### 问题 1：滚动时出现白屏

**原因**：Overscan 值过小

**解决方案**：
1. 打开设置 → 性能优化
2. 增加"预渲染数量"到 8-10
3. 保存并刷新页面

### 问题 2：滚动卡顿

**原因**：渲染的卡片过多或设备性能受限

**解决方案**：
1. 减少 Overscan 值到 3
2. 确保"缓存测量高度"已启用
3. 关闭其他占用资源的应用

### 问题 3：卡片高度不准确

**原因**：高度估算偏差过大

**解决方案**：
1. 调整"估算项目高度"更接近实际高度
2. 清除缓存：关闭再开启"缓存测量高度"
3. 等待滚动过程中自动修正

## 开发者信息

### API 使用

如果你想在自定义组件中使用虚拟滚动：

```typescript
import { VirtualKanbanColumn } from '../components/kanban/VirtualKanbanColumn.svelte';
import { VirtualizationConfigManager } from '../services/virtualization-config-manager';

// 获取配置
const config = VirtualizationConfigManager.getKanbanConfig();

// 判断是否应启用虚拟化
const shouldVirtualize = VirtualizationConfigManager.shouldEnableVirtualization(
  cards.length,
  'kanban'
);

// 使用虚拟列组件
<VirtualKanbanColumn
  cards={cards}
  groupKey={groupKey}
  columnConfig={config}
  onCardSelect={handleSelect}
  plugin={plugin}
  layoutMode="comfortable"
/>
```

### 扩展开发

要添加新的虚拟化视图：

1. 实现 `VirtualizationConfig` 接口
2. 创建对应的虚拟化组件
3. 在 `VirtualizationConfigManager` 中注册配置
4. 添加到设置页面

## 更新日志

### v0.5.1 (当前)

- ✅ 首次发布虚拟滚动功能
- ✅ 看板视图虚拟化支持
- ✅ 动态高度测量和缓存
- ✅ 性能监控服务
- ✅ 配置界面

### 计划功能

- 🔄 表格视图虚拟滚动优化
- 🔄 网格视图虚拟化支持
- 🔄 更智能的高度预测算法
- 🔄 性能分析报告

## 反馈与支持

如果你遇到问题或有改进建议：

- 📧 邮件：tutaoyuan8@outlook.com
- 💻 GitHub：https://github.com/zhuzhige123/obsidian---Tuanki
- 💬 提交 Issue 或 Pull Request

---

**最后更新**：2025年10月15日  
**文档版本**：1.0.0  
**适用插件版本**：v0.5.1+



