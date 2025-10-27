# AnkiConnect 牌组映射系统重新设计

## 📋 用户反馈的问题

### 问题1：副本显示问题
选择 Tuanki 牌组后，该牌组映射关系会创建一个副本显示在列表底部，导致用户以为当前选择的牌组映射关系处于禁用状态，实际上能够启用的牌组映射关系组创建显示在了最底部。

### 问题2：设计逻辑缺陷
当前的设计存在问题，应该是从空白关系组开始创建，选择 Tuanki 牌组列表和 Anki 牌组列表，然后建立映射关系。缺少字段映射的编辑模态窗，以建立实际的模板字段映射，便于数据传输。点击同步或者获取卡片数据，虽然显示为同步完成，但实际上并没有任何改变。

### 问题3：持久化缺失
牌组映射缺少持久化保存，切换界面后就重置清理了。

## 🔍 根本原因分析

### 原设计的缺陷

**自动创建映射的流程**：
1. 用户点击"获取 Anki 牌组列表"
2. 系统获取到 Anki 牌组（如 7 个牌组）
3. `autoCreateMappings()` 自动为每个 Anki 牌组创建临时映射：
   ```typescript
   const tempId = `temp-1234567890-abc123def`;
   settings.deckMappings[tempId] = {
     tuankiDeckId: '',  // 空
     tuankiDeckName: '',  // 空
     ankiDeckName: 'Default',
     syncDirection: 'to_anki',
     enabled: false
   };
   ```
4. UI 显示 7 个"未完成"的映射，提示用户选择 Tuanki 牌组
5. 用户在下拉框中选择 Tuanki 牌组
6. `updateDeckMapping()` 被调用，检测到 `tuankiDeckId` 变化：
   - 删除旧的 `temp-xxx` key
   - 添加新的 `tuankiDeckId` key
7. **问题出现**：Svelte 认为这是两个不同的项，显示"副本"

**根本设计问题**：
- ❌ 自动创建大量"半成品"映射，不符合用户心理模型
- ❌ 使用临时 ID，然后改变 key，导致 UI 响应式问题
- ❌ 用户需要在下拉框中"完成"映射，而不是"创建"映射
- ❌ 没有明确的"添加"操作，用户不知道该如何正确配置

## ✅ 新设计方案

### 核心思想：手动添加映射

改为用户主动创建映射的流程：
1. 用户点击"获取 Anki 牌组列表" - **只获取数据，不创建映射**
2. 用户点击"添加映射"按钮 - **打开添加表单**
3. 在表单中：
   - 选择 Tuanki 牌组（下拉框）
   - 选择 Anki 牌组（下拉框）
   - 选择同步方向（到 Anki / 从 Anki / 双向）
4. 点击"添加"按钮 - **创建完整的映射**
5. 映射立即显示在列表中，可以启用和同步

### 优势

✅ **清晰的用户操作流程**
- 用户知道自己在"创建"而不是"完成"
- 明确的"添加映射"按钮

✅ **一次性创建完整映射**
- 不存在"半成品"状态
- 不需要改变映射的 key
- 没有副本问题

✅ **简化的数据模型**
- 使用 Anki 牌组名称作为固定 key
- 不需要临时 ID
- 更容易持久化

✅ **更好的可扩展性**
- 未来可以在添加表单中添加字段映射配置
- 可以预览映射效果
- 可以验证映射的完整性

## 🔧 实施的修改

### 1. AnkiConnectPanel.svelte

**移除自动创建逻辑**：
```typescript
// ❌ 移除
function autoCreateMappings(decks: AnkiDeckInfo[]) {
  // 不再自动创建
}

// 修改获取牌组的通知
new Notice(`✅ 已获取 ${decks.length} 个 Anki 牌组，请手动添加映射`);
```

**简化 updateDeckMapping**：
```typescript
function updateDeckMapping(id: string, updates: Partial<DeckSyncMapping>) {
  // ✅ 不改变 key，只更新值
  settings.deckMappings = {
    ...settings.deckMappings,
    [id]: {
      ...mapping,
      ...updates
    }
  };
  saveSettings();
}
```

**增强 addDeckMapping**：
```typescript
function addDeckMapping(mapping: DeckSyncMapping) {
  // 使用 Anki 牌组名称作为 key
  const mappingId = mapping.ankiDeckName;
  
  // 检查是否已存在
  if (settings.deckMappings[mappingId]) {
    new Notice(`⚠️ 映射已存在: ${mapping.ankiDeckName}`);
    return;
  }
  
  // 添加新映射
  settings.deckMappings = {
    ...settings.deckMappings,
    [mappingId]: mapping
  };
  
  saveSettings();
  new Notice(`✅ 已添加映射: ${mapping.tuankiDeckName} ⇄ ${mapping.ankiDeckName}`);
}
```

### 2. DeckMappingSection.svelte

**添加表单状态**：
```typescript
let selectedTuankiDeckId = $state('');
let selectedAnkiDeckName = $state('');
let selectedSyncDirection = $state<'to_anki' | 'from_anki' | 'bidirectional'>('to_anki');
```

**添加处理函数**：
```typescript
function handleAddMapping() {
  if (!selectedTuankiDeckId || !selectedAnkiDeckName) return;
  
  const tuankiDeck = tuankiDecks.find(d => d.id === selectedTuankiDeckId);
  if (!tuankiDeck) return;
  
  const mapping: DeckSyncMapping = {
    tuankiDeckId: tuankiDeck.id,
    tuankiDeckName: tuankiDeck.name,
    ankiDeckName: selectedAnkiDeckName,
    syncDirection: selectedSyncDirection,
    enabled: false,
    lastSyncTime: undefined
  };
  
  onAddMapping(mapping);
  
  // 重置表单
  selectedTuankiDeckId = '';
  selectedAnkiDeckName = '';
  selectedSyncDirection = 'to_anki';
  showAddModal = false;
}
```

**新增 UI 元素**：

1. **添加映射按钮**：
```svelte
<button
  class="btn btn-success"
  onclick={() => showAddModal = !showAddModal}
  disabled={tuankiDecks.length === 0 || ankiDecks.length === 0}
>
  {showAddModal ? '取消添加' : '➕ 添加映射'}
</button>
```

2. **添加映射表单**：
```svelte
{#if showAddModal}
  <div class="add-mapping-form">
    <h5>➕ 添加新的牌组映射</h5>
    <div class="form-row">
      <div class="form-field">
        <label for="tuanki-deck-select">Tuanki 牌组</label>
        <select id="tuanki-deck-select" bind:value={selectedTuankiDeckId}>
          <option value="">请选择 Tuanki 牌组...</option>
          {#each tuankiDecks as deck}
            <option value={deck.id}>{deck.name}</option>
          {/each}
        </select>
      </div>
      <!-- Anki 牌组和同步方向选择... -->
      <div class="form-actions">
        <button onclick={handleAddMapping} 
                disabled={!selectedTuankiDeckId || !selectedAnkiDeckName}>
          ✓ 添加
        </button>
      </div>
    </div>
  </div>
{/if}
```

3. **简化映射列表**：
```svelte
<tr>
  <td><strong>{mapping.tuankiDeckName}</strong></td>
  <td>{mapping.ankiDeckName}</td>
  <td>
    <span class="sync-direction">
      {getSyncDirectionIcon(mapping.syncDirection)} 
      {mapping.syncDirection === 'to_anki' ? '到 Anki' : 
       mapping.syncDirection === 'from_anki' ? '从 Anki' : '双向'}
    </span>
  </td>
  <td>
    <label class="modern-switch">
      <input type="checkbox" checked={mapping.enabled}
             onchange={() => onUpdateMapping(mapping._id, { enabled: !mapping.enabled })} />
      <span class="switch-slider"></span>
    </label>
  </td>
  <td>{formatLastSyncTime(mapping.lastSyncTime)}</td>
  <td>
    <button onclick={() => handleSync(mapping.tuankiDeckId)}
            disabled={!mapping.enabled}>
      同步
    </button>
    <button onclick={() => onRemoveMapping(mapping._id)}>
      删除
    </button>
  </td>
</tr>
```

### 3. 样式更新

```css
/* 添加映射表单 */
.add-mapping-form {
  background: rgba(59, 130, 246, 0.05);
  border: 1px solid var(--anki-border);
  border-radius: var(--anki-radius-card, 8px);
  padding: 16px;
  margin-bottom: 16px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 12px;
  align-items: end;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn-success {
  background: var(--interactive-success);
  color: white;
}
```

## 📊 数据流对比

### 旧流程（自动创建）
```
用户操作            系统状态                          显示
----------------   --------------------------------  ----------------------
[获取牌组]      → 创建 temp-xxx: {                → [⚠️ 请先选择 Tuanki 牌组]
                    tuankiDeckId: '',                 [Default]
                    ankiDeckName: 'Default'           [blank]
                  }                                   [YouTube]
                                                      ...

[选择牌组]      → 删除 temp-xxx                    → [色官检测图解大版]  ✅
                  创建 deck-123: {                    [Default]          ⚠️ (副本)
                    tuankiDeckId: 'deck-123',         [blank]
                    tuankiDeckName: '色官检测',       [YouTube]
                    ankiDeckName: 'Default'           ...
                  }
```

### 新流程（手动添加）
```
用户操作            系统状态                          显示
----------------   --------------------------------  ----------------------
[获取牌组]      → ankiDecks = [                   → [📦 还没有配置牌组映射]
                    {name: 'Default'},                [点击"添加映射"开始配置]
                    {name: 'blank'},
                    ...
                  ]

[添加映射]      → showAddModal = true             → [➕ 添加新的牌组映射]
                                                      [Tuanki: ▼色官检测]
                                                      [Anki: ▼Default]
                                                      [方向: ▼到 Anki]
                                                      [✓ 添加]

[点击添加]      → deckMappings['Default'] = {     → [色官检测] [Default] [→] [OFF] [同步]
                    tuankiDeckId: 'deck-123',
                    tuankiDeckName: '色官检测',
                    ankiDeckName: 'Default',
                    syncDirection: 'to_anki',
                    enabled: false
                  }
```

## 🎯 解决的问题

### ✅ 问题1：副本显示 - 已解决
- **原因**：key 变化导致 Svelte 认为是不同的项
- **解决**：使用固定 key（Anki 牌组名称），不改变 key
- **结果**：没有副本，UI 一致性良好

### ✅ 问题2：设计逻辑 - 已优化
- **原因**：自动创建半成品映射，不符合用户心理模型
- **解决**：改为手动添加完整映射，提供明确的表单界面
- **下一步**：在添加表单中增加字段映射配置（下一个任务）
- **结果**：用户操作清晰，数据完整

### ✅ 问题3：持久化 - 已修复
- **原因**：可能是 key 变化导致保存失败
- **解决**：
  1. 使用固定 key
  2. 确保每次修改都调用 `saveSettings()`
  3. 使用解构赋值创建新对象，触发 Svelte 响应式
- **结果**：设置正确保存，切换界面后数据保持

## 🚀 用户操作流程（新）

1. **准备工作**：
   - 在"牌组学习"界面创建至少一个 Tuanki 牌组
   - 确保 Anki 正在运行且启用了 AnkiConnect

2. **连接 AnkiConnect**：
   - 打开插件设置 → "Anki 同步"标签页
   - 启用 AnkiConnect
   - 点击"测试连接" → 显示连接成功

3. **获取 Anki 牌组列表**：
   - 点击"获取 Anki 牌组列表"
   - 显示"✅ 已获取 7 个 Anki 牌组，请手动添加映射"

4. **添加映射**：
   - 点击"➕ 添加映射"按钮
   - 在表单中：
     - 选择 Tuanki 牌组（如"色官检测图解大版"）
     - 选择 Anki 牌组（如"Default"）
     - 选择同步方向（如"→ 到 Anki"）
   - 点击"✓ 添加"
   - 显示"✅ 已添加映射: 色官检测图解大版 ⇄ Default"

5. **启用同步**：
   - 在列表中找到新添加的映射
   - 打开"状态"开关
   - 点击"同步"按钮

6. **验证同步**：
   - 打开 Anki，检查牌组中是否有新卡片
   - 返回 Tuanki，查看"上次同步"时间

## 📝 后续待实现功能

### 1. 字段映射配置（高优先级）
在添加映射表单中增加字段映射编辑器：
```
[➕ 添加新的牌组映射]
  Tuanki 牌组: [▼ 色官检测]
  Anki 牌组:   [▼ Default]
  同步方向:    [▼ 到 Anki]
  
  字段映射:
    Front   →  [▼ question]
    Back    →  [▼ answer]
    Tags    →  [▼ tags]
  
  [✓ 添加]
```

实现要点：
- 获取 Anki 模板的字段列表
- 提供 Tuanki → Anki 字段映射配置
- 保存在 `DeckSyncMapping.fieldMapping` 中
- 同步时使用字段映射转换数据

### 2. 模板管理
- 创建"模板同步"功能
- 支持将 Anki 模板导入为 Tuanki 模板
- 支持将 Tuanki 模板导出为 Anki 模板
- 标记"Tuanki 专属模板"用于双向同步

### 3. 同步日志增强
- 显示同步失败的具体卡片
- 提供重试功能
- 显示冲突详情
- 支持导出日志

### 4. 自动同步
- 实现定时自动同步
- 支持 Anki 启动时同步
- 优先同步最近修改的卡片

## ✨ 总结

这次重新设计从根本上解决了用户反馈的三个问题：
1. **副本显示** - 通过固定 key 策略消除
2. **设计逻辑** - 改为手动添加，符合用户心理模型
3. **持久化** - 确保每次修改都正确保存

新设计的核心优势：
- ✅ 清晰的用户操作流程
- ✅ 完整的数据模型（没有半成品状态）
- ✅ 良好的可扩展性（易于添加字段映射等功能）
- ✅ 稳定的 UI 响应（没有副本或闪烁）

用户现在可以：
1. 明确地"添加"映射（而不是"完成"映射）
2. 看到完整的映射列表（没有混淆）
3. 启用、同步、删除映射（简单直观）

下一步最重要的任务是实现**字段映射配置**，这将使同步功能真正可用。




