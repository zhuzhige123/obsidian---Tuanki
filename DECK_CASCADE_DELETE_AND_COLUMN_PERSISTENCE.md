# 牌组级联删除与字段属性持久化 - 实施文档

## 📋 概述

本文档记录了两个重要问题的修复：
1. **父牌组删除时子牌组未级联删除**
2. **卡片管理界面字段显示设置未持久化**

## 🐛 问题分析

### 问题一：父牌组删除后子牌组未级联删除

**问题描述**：
- 删除父牌组时，子牌组数据仍然存在于 `tuanki/decks/decks.json`
- 子牌组在界面中不显示（因为父牌组不存在）
- 子牌组的卡片和媒体文件未被清理，造成数据残留

**根本原因**：
- UI 调用了错误的删除方法：`dataStorage.deleteDeck(deckId)` - 只删除单个牌组
- 正确的级联删除方法已存在：`deckHierarchy.deleteDeckWithChildren(deckId)`
- 但 UI 没有使用此方法

**影响**：
- 数据残留：子牌组数据、卡片、媒体文件未清理
- 统计错误：全局统计可能包含"孤立"子牌组的数据
- 存储浪费：孤立数据占用空间

---

### 问题二：卡片管理界面字段属性未持久化

**问题描述**：
- 用户在卡片管理界面调整列显示设置后，刷新页面设置丢失
- 每次打开页面都需要重新调整

**根本原因**：
- `columnVisibility` 状态已定义，但缺少持久化逻辑
- 对比其他设置（`gridLayout`、`documentFilterMode`）都有持久化，唯独列设置没有

**影响**：
- 用户体验差：需要反复调整设置
- 不一致性：其他 UI 设置都有持久化

---

## ✅ 实施方案

### 修复一：父牌组级联删除

**文件**：`src/components/pages/DeckStudyPage.svelte`
**函数**：`deleteDeck(deckId: string)`
**行号**：558-595

**修改内容**：

#### 1. 添加子牌组检查
```typescript
const children = await plugin.deckHierarchy.getChildren(deckId);
const descendants = await plugin.deckHierarchy.getDescendants(deckId);
```

#### 2. 增强确认消息
```typescript
if (descendants.length > 0) {
  confirmMessage = `该牌组包含 ${descendants.length} 个子牌组，将一并删除。\n\n` +
                   `子牌组列表：\n${descendants.map(d => `• ${d.name}`).slice(0, 5).join('\n')}` +
                   (descendants.length > 5 ? `\n...还有 ${descendants.length - 5} 个` : '') +
                   '\n\n确定要删除吗？';
}
```

**功能**：
- 显示子牌组数量
- 列出前5个子牌组名称
- 如果超过5个，显示"还有X个"

#### 3. 使用级联删除方法
```typescript
await plugin.deckHierarchy.deleteDeckWithChildren(deckId);
```

**功能**：
- 从叶子节点开始删除所有子孙牌组
- 最后删除父牌组本身
- 清理所有关联的卡片和媒体文件

#### 4. 添加用户反馈
```typescript
new Notice('🗑️ 正在删除牌组...');
// ... 删除操作
new Notice(`✅ 成功删除 ${totalDeleted} 个牌组`);
```

#### 5. 添加错误处理
```typescript
try {
  // ... 删除逻辑
} catch (error) {
  console.error('[DeckStudyPage] 删除牌组失败:', error);
  new Notice(`❌ 删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
}
```

---

### 修复二：字段属性持久化

**文件**：`src/components/pages/TuankiCardManagementPage.svelte`

#### 修改1：加载逻辑

**位置**：`onMount` 函数内，第339-350行

```typescript
// 加载列可见性设置
const savedColumnVisibility = localStorage.getItem('tuanki-column-visibility');
if (savedColumnVisibility) {
  try {
    const parsed = JSON.parse(savedColumnVisibility);
    // 合并保存的设置和默认设置（确保新增字段有默认值）
    columnVisibility = { ...columnVisibility, ...parsed };
    console.log('[CardManagement] 已加载列可见性设置');
  } catch (error) {
    console.error('[CardManagement] 解析列可见性设置失败:', error);
  }
}
```

**功能**：
- 从 `localStorage` 读取 `tuanki-column-visibility`
- 解析 JSON 数据
- 合并默认设置和保存的设置（确保向后兼容）
- 错误处理：解析失败时使用默认设置

#### 修改2：保存逻辑

**位置**：`handleVisibilityChange` 函数，第217-227行

```typescript
function handleVisibilityChange(key: keyof typeof columnVisibility, value: boolean) {
  columnVisibility[key] = value;
  
  // 持久化到 localStorage
  try {
    localStorage.setItem('tuanki-column-visibility', JSON.stringify(columnVisibility));
    console.log('[CardManagement] 列可见性设置已保存');
  } catch (error) {
    console.error('[CardManagement] 保存列可见性设置失败:', error);
  }
}
```

**功能**：
- 更新状态
- 序列化为 JSON
- 保存到 `localStorage`
- 错误处理：保存失败时记录日志

---

## 📊 技术细节

### 级联删除流程

```
用户点击删除按钮
  ↓
检查子牌组 (getDescendants)
  ↓
显示确认对话框（包含子牌组列表）
  ↓
用户确认
  ↓
显示进度提示 "🗑️ 正在删除牌组..."
  ↓
调用 deleteDeckWithChildren(deckId)
  ├─ 获取所有子孙牌组（按层级倒序）
  ├─ 逐个删除子孙牌组（从叶子节点开始）
  │   ├─ 删除卡片
  │   ├─ 删除媒体文件
  │   └─ 清理学习会话
  └─ 删除父牌组本身
  ↓
刷新数据和 UI
  ↓
显示成功消息 "✅ 成功删除 X 个牌组"
```

### 持久化数据结构

**存储键**：`tuanki-column-visibility`

**数据格式**：
```json
{
  "front": true,
  "back": true,
  "status": true,
  "tags": true,
  "priority": true,
  "created": true,
  "actions": true,
  "uuid": false,
  "obsidian_block_link": true,
  "source_document": true,
  "field_template": true,
  "source_document_status": true
}
```

**存储位置**：`localStorage`（浏览器本地存储）

---

## 🔍 验证方法

### 验证问题一修复

#### 测试步骤：

1. **创建测试数据**
   - 创建父牌组："测试父牌组"
   - 创建3个子牌组："子牌组A"、"子牌组B"、"子牌组C"
   - 在子牌组中添加一些卡片

2. **执行删除**
   - 点击删除"测试父牌组"
   - 应该显示确认对话框：
     ```
     该牌组包含 3 个子牌组，将一并删除。
     
     子牌组列表：
     • 子牌组A
     • 子牌组B
     • 子牌组C
     
     确定要删除吗？
     ```
   - 点击"确定"
   - 应该显示进度提示："🗑️ 正在删除牌组..."
   - 应该显示成功消息："✅ 成功删除 4 个牌组"

3. **验证结果**
   - 检查牌组列表：父牌组和所有子牌组都应该消失
   - 检查 `tuanki/decks/decks.json`：不应包含这些牌组
   - 检查控制台：应该有成功日志
   - 检查数据文件夹：相关卡片和媒体文件应该被清理

#### 预期结果：
- ✅ 父牌组和所有子牌组完全删除
- ✅ 界面正确更新
- ✅ 数据文件正确清理
- ✅ 控制台无错误日志

---

### 验证问题二修复

#### 测试步骤：

1. **初始状态检查**
   - 打开卡片管理页面
   - 检查控制台，应该看到：`[CardManagement] 已加载列可见性设置`（如果是首次可能没有）

2. **修改列显示设置**
   - 点击"字段"按钮打开列管理器
   - 隐藏"UUID"列（取消勾选）
   - 隐藏"创建时间"列
   - 检查控制台，应该看到两条：`[CardManagement] 列可见性设置已保存`

3. **验证持久化**
   - 刷新页面（F5）
   - 检查列显示：
     - ✅ "UUID"列应该仍然隐藏
     - ✅ "创建时间"列应该仍然隐藏
     - ✅ 其他列应该保持原样
   - 检查控制台：应该看到 `[CardManagement] 已加载列可见性设置`

4. **验证 localStorage**
   - 打开浏览器开发者工具（F12）
   - 切换到 "Application" 或 "存储" 标签
   - 查看 "Local Storage"
   - 找到 `tuanki-column-visibility` 键
   - 值应该是 JSON 格式，包含最新的设置

5. **测试向后兼容性**
   - 打开开发者工具控制台
   - 手动修改 localStorage：
     ```javascript
     localStorage.setItem('tuanki-column-visibility', '{"front":false,"back":false}');
     ```
   - 刷新页面
   - 验证：
     - ✅ "正面内容"和"背面内容"列应该隐藏
     - ✅ 其他列应该显示（使用默认值）
     - ✅ 没有控制台错误

#### 预期结果：
- ✅ 列显示设置在页面刷新后保持不变
- ✅ 控制台显示正确的加载/保存日志
- ✅ localStorage 包含正确的 JSON 数据
- ✅ 新增字段时向后兼容（旧设置 + 新字段默认值）

---

## ⚠️ 注意事项

### 级联删除注意事项

1. **不可逆操作**
   - 删除是永久性的，无法撤销
   - 确认对话框提供了清晰的信息
   - 用户需要明确知道将删除多少个牌组

2. **性能考虑**
   - 大量子牌组时，确认消息只显示前5个
   - 删除操作是异步的，不会阻塞 UI

3. **数据完整性**
   - 从叶子节点开始删除，确保不会遗留孤立数据
   - 清理所有关联资源（卡片、媒体、学习会话）

### 持久化注意事项

1. **向后兼容性**
   - 使用合并策略：`{ ...defaultSettings, ...savedSettings }`
   - 新增字段时，旧用户的设置仍然有效

2. **错误处理**
   - JSON 解析失败时使用默认设置
   - 保存失败时只记录日志，不影响功能

3. **存储限制**
   - localStorage 有大小限制（通常5-10MB）
   - 列设置数据很小（<1KB），无需担心

4. **隐私和安全**
   - 数据存储在浏览器本地，不会上传到服务器
   - 清除浏览器数据会清除设置（用户可控）

---

## 🔧 后续改进方向

### 短期优化

- [ ] 添加"撤销删除"功能（复杂，需要数据备份机制）
- [ ] 支持批量删除牌组
- [ ] 列设置支持预设（如"精简视图"、"完整视图"）

### 中期优化

- [ ] 将列设置同步到插件设置（跨设备同步）
- [ ] 删除操作支持进度条（大量子牌组时）
- [ ] 支持拖拽调整列顺序（需要更复杂的状态管理）

### 长期愿景

- [ ] 完整的操作历史和撤销系统
- [ ] 基于 Obsidian Sync 的设置同步
- [ ] 智能列显示推荐（基于用户使用习惯）

---

## 📝 更新日志

### v1.0.0 (2025-01-08)
- ✅ 实现父牌组级联删除
- ✅ 添加子牌组检查和确认对话框
- ✅ 实现字段显示设置持久化（加载 + 保存）
- ✅ 添加完整的错误处理和用户反馈
- ✅ 添加向后兼容性支持

---

## 🐛 已知问题

无已知问题。

---

## 📚 相关文件

- `src/components/pages/DeckStudyPage.svelte` - 牌组学习页面
- `src/components/pages/TuankiCardManagementPage.svelte` - 卡片管理页面
- `src/services/deck/DeckHierarchyService.ts` - 牌组层级管理服务
- `src/data/storage.ts` - 数据存储层

---

**文档版本**: 1.0.0  
**最后更新**: 2025-01-08  
**维护者**: Tuanki 开发团队

