# AnkiConnect 同步按钮 UX 改进

## 📋 改进概述

**改进日期**：2025年1月9日

**问题描述**：牌组映射表格中的同步按钮与用户选择的"同步方向"不匹配，造成混淆。

**改进目标**：让操作按钮与同步方向保持一致，提供清晰直观的用户体验。

---

## 🐛 原有问题

### 问题 1：按钮与方向不匹配
- 当同步方向设置为"从 Anki"（导入）时
- 仍然显示"同步"按钮（实际执行导出功能）
- 用户无法从按钮文本判断实际操作

### 问题 2：功能不完整
- "双向同步"方向只显示"导入"和"同步"（导出）按钮
- 缺少真正的"双向同步"按钮
- 用户需要分别点击导入和导出，体验不佳

### 问题 3：混淆的术语
- "同步"一词含义模糊
- 实际上只执行单向导出
- 与双向同步概念冲突

---

## ✅ 改进方案

### 新的按钮显示逻辑

#### 1. 同步方向 = "到 Anki"（导出）
**显示按钮**：
- ✅ 📤 导出

**隐藏按钮**：
- ❌ 📥 导入
- ❌ ⇄ 双向

**说明**：用户只想将 Tuanki 数据导出到 Anki，只显示导出按钮。

---

#### 2. 同步方向 = "从 Anki"（导入）
**显示按钮**：
- ✅ 📥 导入

**隐藏按钮**：
- ❌ 📤 导出
- ❌ ⇄ 双向

**说明**：用户只想从 Anki 导入数据到 Tuanki，只显示导入按钮。

---

#### 3. 同步方向 = "双向同步"
**显示按钮**：
- ✅ 📥 导入（单独导入）
- ✅ 📤 导出（单独导出）
- ✅ ⇄ 双向（智能双向同步）

**说明**：
- 用户可以选择单独导入或导出
- 或一键执行双向智能同步
- 提供最大灵活性

---

## 🔧 技术实现

### 1. 修改文件：`DeckMappingSection.svelte`

#### 1.1 更新 Props 接口
添加 `onBidirectionalSync` 回调：

```typescript
let {
  // ... 其他 props
  onBidirectionalSync
}: {
  // ... 其他类型
  onBidirectionalSync: (deckId: string) => Promise<void>;
} = $props();
```

#### 1.2 按钮显示逻辑
```svelte
<!-- 导入按钮：仅在 from_anki 或 bidirectional 时显示 -->
{#if mapping.syncDirection === 'from_anki' || mapping.syncDirection === 'bidirectional'}
  <button class="btn btn-small btn-import" ...>
    📥 导入
  </button>
{/if}

<!-- 导出按钮：仅在 to_anki 或 bidirectional 时显示 -->
{#if mapping.syncDirection === 'to_anki' || mapping.syncDirection === 'bidirectional'}
  <button class="btn btn-small btn-export" ...>
    📤 导出
  </button>
{/if}

<!-- 双向同步按钮：仅在 bidirectional 时显示 -->
{#if mapping.syncDirection === 'bidirectional'}
  <button class="btn btn-small btn-bidirectional" ...>
    ⇄ 双向
  </button>
{/if}
```

#### 1.3 添加双向同步处理函数
```typescript
async function handleBidirectionalSync(deckId: string) {
  syncingDeckId = deckId;
  try {
    await onBidirectionalSync(deckId);
  } finally {
    syncingDeckId = null;
  }
}
```

#### 1.4 新增按钮样式
```css
.btn-export {
  background: var(--tuanki-sync-to);
  color: white;
}

.btn-bidirectional {
  background: var(--tuanki-sync-bi);
  color: white;
}
```

---

### 2. 修改文件：`AnkiConnectPanel.svelte`

#### 2.1 新增双向同步方法
```typescript
async function handleBidirectionalSync(deckId: string) {
  // 1. 打开进度模态窗
  progressModal = {
    open: true,
    operation: 'batch_sync',
    title: '双向智能同步',
    // ...
  };
  
  // 2. 先导入（从 Anki 到 Tuanki）
  const importResult = await ankiService.importDeckWithTemplates(...);
  
  // 3. 再导出（从 Tuanki 到 Anki）
  const exportResult = await ankiService.exportDeckToAnki(...);
  
  // 4. 关闭进度模态窗并显示结果
  progressModal.open = false;
  
  new Notice(
    `✅ 双向同步完成！\n` +
    `📥 导入: ${importResult.importedCards} 张 | ` +
    `📤 导出: ${exportResult.exportedCards} 张`
  );
}
```

#### 2.2 传递给子组件
```svelte
<DeckMappingSection
  {ankiDecks}
  {tuankiDecks}
  mappings={settings.deckMappings}
  onSync={quickSyncToAnki}
  onImport={handleImportDeck}
  onBidirectionalSync={handleBidirectionalSync}
/>
```

---

## 📊 按钮显示矩阵

| 同步方向 | 📥 导入 | 📤 导出 | ⇄ 双向 | 删除 |
|---------|--------|--------|-------|------|
| → 到 Anki | ❌ | ✅ | ❌ | ✅ |
| ← 从 Anki | ✅ | ❌ | ❌ | ✅ |
| ⇄ 双向同步 | ✅ | ✅ | ✅ | ✅ |

---

## 🎯 用户体验改进

### 改进前 ❌
```
同步方向: ← 从 Anki
操作: [导入] [同步] [删除]
      ✅     ❓     ✅
```
**问题**："同步"按钮含义不清，与方向不匹配

### 改进后 ✅
```
同步方向: ← 从 Anki
操作: [导入] [删除]
      ✅     ✅
```
**改进**：只显示相关操作，清晰直观

---

### 双向同步改进

#### 改进前 ❌
```
同步方向: ⇄ 双向同步
操作: [导入] [同步] [删除]
```
**问题**：需要分别点击导入和导出

#### 改进后 ✅
```
同步方向: ⇄ 双向同步
操作: [导入] [导出] [双向] [删除]
```
**改进**：
- ✅ 可单独导入或导出
- ✅ 可一键双向同步
- ✅ 灵活性最大化

---

## 🔄 增量同步保障

### 重要提示
所有同步操作均支持增量同步：

1. **导入（📥）**：只导入 Anki 中新增或修改的卡片
2. **导出（📤）**：只导出 Tuanki 中新增或修改的卡片
3. **双向（⇄）**：先增量导入，再增量导出

### 技术保障
- ✅ 使用卡片唯一 ID 进行去重
- ✅ 比较修改时间戳
- ✅ 跳过已存在且未修改的卡片
- ✅ 在日志中显示跳过数量

---

## 📝 按钮提示文本

### 鼠标悬停提示（title 属性）

| 按钮 | 提示文本 |
|------|---------|
| 📥 导入 | "从 Anki 导入卡片和模板（增量同步）" |
| 📤 导出 | "导出到 Anki（增量同步）" |
| ⇄ 双向 | "双向智能同步（增量同步）" |
| 删除 | （默认） |

---

## 🎨 视觉设计

### 按钮颜色方案

```css
/* 导入按钮 - 绿色系 */
.btn-import {
  background: #10b981;  /* 翡翠绿 */
  color: white;
}
.btn-import:hover {
  background: #059669;  /* 深翡翠绿 */
}

/* 导出按钮 - 紫色系 */
.btn-export {
  background: var(--tuanki-sync-to);  /* 紫色 */
  color: white;
}
.btn-export:hover {
  background: #7c3aed;  /* 深紫色 */
}

/* 双向同步按钮 - 粉红色系 */
.btn-bidirectional {
  background: var(--tuanki-sync-bi);  /* 粉红色 */
  color: white;
}
.btn-bidirectional:hover {
  background: #db2777;  /* 深粉红色 */
}
```

### 设计原则
- ✅ 导入（绿色）= 接收、获取
- ✅ 导出（紫色）= 发送、推送
- ✅ 双向（粉红色）= 交换、协调
- ✅ 与主题的"同步方向"颜色保持一致

---

## ✅ 测试清单

### 功能测试

#### 场景 1：导出方向
- [ ] 设置同步方向为"→ 到 Anki"
- [ ] 只显示"📤 导出"按钮
- [ ] 点击导出按钮执行导出功能
- [ ] 显示进度模态窗
- [ ] 显示正确的成功通知

#### 场景 2：导入方向
- [ ] 设置同步方向为"← 从 Anki"
- [ ] 只显示"📥 导入"按钮
- [ ] 点击导入按钮执行导入功能
- [ ] 显示进度模态窗
- [ ] 显示正确的成功通知

#### 场景 3：双向同步
- [ ] 设置同步方向为"⇄ 双向同步"
- [ ] 显示"📥 导入"、"📤 导出"、"⇄ 双向"三个按钮
- [ ] 点击导入按钮只执行导入
- [ ] 点击导出按钮只执行导出
- [ ] 点击双向按钮执行完整双向同步
- [ ] 双向同步显示合并的统计信息

#### 场景 4：切换方向
- [ ] 从"到 Anki"切换到"从 Anki"
- [ ] 按钮正确更新
- [ ] 从"从 Anki"切换到"双向同步"
- [ ] 显示所有三个按钮

### 视觉测试
- [ ] 按钮颜色正确
- [ ] 按钮图标清晰
- [ ] 鼠标悬停效果正常
- [ ] 禁用状态显示正确
- [ ] 移动端按钮布局正常

### 增量同步测试
- [ ] 导入时跳过已存在的卡片
- [ ] 导出时跳过已存在的卡片
- [ ] 双向同步时两次都跳过重复卡片
- [ ] 日志中正确显示跳过数量

---

## 📈 预期收益

### 用户体验
1. ✅ **清晰直观**：按钮文本准确反映功能
2. ✅ **减少错误**：避免用户执行错误操作
3. ✅ **提高效率**：双向同步一键完成
4. ✅ **灵活性强**：双向模式下仍可单独操作

### 代码质量
1. ✅ **逻辑清晰**：按钮显示逻辑与数据模型一致
2. ✅ **易于维护**：条件渲染清晰明了
3. ✅ **可扩展性**：易于添加新的同步模式

### 设计一致性
1. ✅ **术语统一**："导入"、"导出"、"双向"清晰明确
2. ✅ **图标一致**：📥 📤 ⇄ 与方向图标呼应
3. ✅ **颜色协调**：按钮颜色与同步方向颜色一致

---

## 🎉 总结

### 改进完成
- ✅ 按钮显示逻辑与同步方向完全匹配
- ✅ 添加真正的双向同步功能
- ✅ 保持增量同步机制不变
- ✅ 提供清晰的用户体验

### 下一步建议
1. **用户测试**：收集用户反馈
2. **性能优化**：优化双向同步性能
3. **冲突解决**：将来可添加智能冲突解决（高级功能）
4. **同步策略**：将来可添加同步策略配置（仅新卡、仅更新等）

---

**文档版本**：v1.0  
**最后更新**：2025年1月9日  
**改进状态**：✅ 已完成


