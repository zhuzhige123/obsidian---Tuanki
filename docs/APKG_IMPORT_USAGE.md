# APKG 字段映射导入功能使用指南

## 功能概述

本插件现已支持 APKG 格式文件的智能导入，包含以下核心功能：

- 📦 **APKG 解析** - 完整解析 Anki 包文件结构
- 🔗 **智能字段映射** - 自动识别并映射字段类型
- 👀 **内容预览** - 导入前预览卡片内容
- 📊 **统计分析** - 显示字段使用情况和示例
- 🎯 **选择性导入** - 可选择导入特定卡片

## 核心组件

### 1. ApkgParser (解析器)
```typescript
import ApkgParser from '../importers/apkg-parser';

const parser = new ApkgParser();
const result = await parser.parseApkgFile(file);
```

### 2. ApkgFieldMappingModal (字段映射模态窗)
```svelte
<ApkgFieldMappingModal
  isOpen={showModal}
  apkgData={parseResult}
  onClose={handleClose}
  onImport={handleImport}
/>
```

### 3. ImportButton (导入按钮)
```svelte
<ImportButton
  storage={dataStorage}
  targetDeckId="deck_id"
  variant="primary"
  on:importComplete={handleComplete}
/>
```

### 4. ImportDropZone (拖放导入区域)
```svelte
<ImportDropZone
  storage={dataStorage}
  targetDeckId="deck_id"
  on:importComplete={handleComplete}
/>
```

## 完整使用示例

```svelte
<script lang="ts">
  import ImportPage from '../components/pages/ImportPage.svelte';
  import type { AnkiDataStorage } from '../data/storage';
  import type { ImportResult } from '../importers/import-manager';

  let storage: AnkiDataStorage;
  let availableDecks = [
    { id: 'deck1', name: '英语词汇' },
    { id: 'deck2', name: '编程概念' }
  ];

  function handleImportComplete(event: CustomEvent<ImportResult>) {
    const result = event.detail;
    console.log('导入完成:', result);
    
    if (result.success) {
      // 刷新卡片列表
      refreshCardList();
    }
  }
</script>

<ImportPage 
  {storage}
  {availableDecks}
  currentDeckId="deck1"
  on:importComplete={handleImportComplete}
/>
```

## 字段映射配置

### 支持的本地字段类型
- `front` - 卡片正面
- `back` - 卡片背面  
- `tags` - 标签
- `custom` - 自定义字段
- `ignore` - 忽略字段

### 智能映射规则
系统会根据字段名称自动映射：
- 包含 "front", "question", "问题" → `front`
- 包含 "back", "answer", "答案" → `back`
- 包含 "tag", "标签" → `tags`
- 其他字段 → `custom`

## 导入流程

### 1. 文件选择
```typescript
// 方式1: 文件选择器
<input type="file" accept=".apkg" onchange={handleFileSelect} />

// 方式2: 拖放
<ImportDropZone onDrop={handleFileDrop} />
```

### 2. 解析阶段
```typescript
const parseResult = await parser.parseApkgFile(file);

if (parseResult.success) {
  console.log('解析成功:', {
    cards: parseResult.cards.length,
    decks: parseResult.decks.length,
    models: parseResult.models.length,
    mediaFiles: parseResult.mediaFiles.length
  });
}
```

### 3. 字段映射
```typescript
const mappingConfig = {
  targetDeckId: 'my_deck_id',
  fieldMappings: {
    'Front': 'front',
    'Back': 'back',
    'Tags': 'tags',
    'Extra': 'custom'
  },
  importMediaFiles: true,
  selectedCards: ['card1', 'card2']
};
```

### 4. 执行导入
```typescript
const importResult = await importManager.executeApkgImport(
  parseResult, 
  mappingConfig
);

if (importResult.success) {
  console.log(`成功导入 ${importResult.cardsImported} 张卡片`);
}
```

## 最佳实践

### 1. 文件准备
- 确保 APKG 文件完整且未损坏
- 大文件建议分批导入
- 媒体文件路径使用相对路径

### 2. 字段映射
- 导入前仔细检查字段映射配置
- 利用预览功能确认内容正确
- 重要字段不要映射为 `ignore`

### 3. 目标牌组
- 建议预先创建目标牌组
- 确保牌组名称唯一且有意义
- 考虑按主题分类牌组

### 4. 性能优化
- 大量卡片建议分批导入
- 导入过程中避免其他操作
- 定期清理导入历史

## 错误处理

### 常见问题
1. **文件格式错误**
   ```
   解决方案: 确认文件是有效的 .apkg 格式
   ```

2. **字段映射冲突**
   ```
   解决方案: 重新配置字段映射，确保必要字段已映射
   ```

3. **媒体文件缺失**
   ```
   解决方案: 检查原始 APKG 文件是否包含完整媒体
   ```

4. **目标牌组不存在**
   ```
   解决方案: 先创建目标牌组或选择现有牌组
   ```

## 扩展开发

### 自定义字段映射
```typescript
interface CustomFieldMapping {
  sourceField: string;
  targetField: string;
  transformer?: (value: string) => string;
}

// 添加自定义转换逻辑
const customMapping: CustomFieldMapping = {
  sourceField: 'Pronunciation',
  targetField: 'custom',
  transformer: (value) => `[音标: ${value}]`
};
```

### 添加新的导入格式
```typescript
// 扩展 ImportManager
class ImportManager {
  async importCustomFormat(file: File): Promise<ImportResult> {
    // 实现自定义格式解析
  }
}
```

## 技术架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UI Components │───▶│  ImportManager  │───▶│   ApkgParser    │
│                 │    │                 │    │                 │
│ • ImportButton  │    │ • File validation│   │ • ZIP extraction│
│ • ImportDropZone│    │ • Format routing │   │ • DB parsing    │
│ • FieldMapping  │    │ • Field mapping  │   │ • Media files   │
│ • ImportPage    │    │ • Card conversion│   │ • Statistics    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Data Storage  │    │  Card Database  │    │  Media Storage  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

通过以上组件和流程，用户可以方便地导入 Anki APKG 文件，并通过直观的界面完成字段映射和内容预览。