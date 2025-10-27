# APKG导入功能 - 新架构文档

## 📚 架构概览

新的APKG导入功能采用**Clean Architecture**设计，分为以下层次：

```
┌─────────────────────────────────────────┐
│           UI Layer (Svelte)             │
│         APKGImportModal.svelte          │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│      Application Layer (Services)       │
│       APKGImportService.ts              │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Domain Layer (Logic)            │
│  ┌──────────────────────────────────┐   │
│  │ Converter/                       │   │
│  │  - FieldSideResolver             │   │
│  │  - ContentConverter              │   │
│  │  - MediaProcessor                │   │
│  ├──────────────────────────────────┤   │
│  │ Parser/                          │   │
│  │  - APKGParser                    │   │
│  │  - SQLiteReader                  │   │
│  ├──────────────────────────────────┤   │
│  │ Builder/                         │   │
│  │  - CardBuilder                   │   │
│  └──────────────────────────────────┘   │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│    Infrastructure Layer (Adapters)      │
│  - ObsidianMediaStorageAdapter          │
│  - TuankiDataStorageAdapter             │
│  - APKGLogger                           │
└─────────────────────────────────────────┘
```

## 🎯 核心模块

### 1. 类型系统 (`domain/apkg/types.ts`)
所有APKG相关的类型定义集中在此文件：
- `APKGData` - 解析后的完整APKG数据
- `ImportConfig` - 导入配置
- `ImportProgress` - 进度信息
- `ImportResult` - 导入结果
- ...以及50+个类型定义

### 2. 解析器层 (`domain/apkg/parser/`)

#### APKGParser
```typescript
const parser = new APKGParser();
const apkgData = await parser.parse(file);
```
- 解压APKG文件
- 解析SQLite数据库
- 提取媒体文件
- 返回结构化数据

#### SQLiteReader
```typescript
const reader = new SQLiteReader(db);
const models = await reader.readModels();
const decks = await reader.readDecks();
const notes = await reader.readNotes();
```

### 3. 转换器层 (`domain/apkg/converter/`)

#### FieldSideResolver (智能字段解析)
```typescript
const resolver = new FieldSideResolver();
const fieldSideMap = resolver.resolve(models);
// 返回: { [modelId]: { [fieldName]: 'front' | 'back' | 'both' } }
```
- 解析Anki的`qfmt`和`afmt`模板
- 自动判断字段显示面
- 无需手动配置

#### ContentConverter (HTML→Markdown)
```typescript
const converter = new ContentConverter();
const result = converter.convert(html);
// result.markdown - 转换后的Markdown
// result.mediaRefs - 媒体引用列表
```
- 转换基础HTML标签
- 处理表格（简单→MD，复杂→保留）
- 提取媒体引用
- 转换Anki特殊语法

#### MediaProcessor (媒体处理)
```typescript
const processor = new MediaProcessor(mediaStorage);
const result = await processor.process(mediaMap, deckName);
// result.savedFiles - 原始名→Obsidian路径映射
```
- 保存媒体文件到`.tuanki/media/[APKG] DeckName/`
- 文件去重（SHA-256哈希）
- 生成清单文件

### 4. 构建器层 (`domain/apkg/builder/`)

#### CardBuilder
```typescript
const builder = new CardBuilder();
const result = builder.build({
  note,
  model,
  deckId,
  fieldSideMap,
  mediaPathMap,
  conversionConfig
});
// result.card - Tuanki卡片对象
```

### 5. 服务层 (`application/services/apkg/`)

#### APKGImportService (主入口)
```typescript
const service = new APKGImportService(dataStorage, mediaStorage);

const result = await service.import(
  {
    file: apkgFile,
    conversion: DEFAULT_CONVERSION_CONFIG,
    skipExisting: false,
    createDeckIfNotExist: true
  },
  (progress) => {
    console.log(progress.message); // 进度回调
  }
);
```

**完整流程：**
1. ✅ 解析APKG
2. ✅ 智能解析字段配置
3. ✅ 处理媒体文件
4. ✅ 创建/获取牌组
5. ✅ 构建卡片
6. ✅ 保存数据

## 🔌 适配器使用

### ObsidianMediaStorageAdapter
```typescript
import { ObsidianMediaStorageAdapter } from '@/infrastructure/adapters';

const mediaAdapter = new ObsidianMediaStorageAdapter(plugin);
```

### TuankiDataStorageAdapter
```typescript
import { TuankiDataStorageAdapter } from '@/infrastructure/adapters';

const dataAdapter = new TuankiDataStorageAdapter(ankiDataStorage);
```

## 🚀 使用示例

### 完整导入流程

```typescript
import { APKGImportService } from '@/application/services/apkg';
import { ObsidianMediaStorageAdapter, TuankiDataStorageAdapter } from '@/infrastructure/adapters';
import { DEFAULT_CONVERSION_CONFIG } from '@/domain/apkg/types';

// 1. 创建适配器
const mediaAdapter = new ObsidianMediaStorageAdapter(this.plugin);
const dataAdapter = new TuankiDataStorageAdapter(this.dataStorage);

// 2. 创建服务
const importService = new APKGImportService(dataAdapter, mediaAdapter);

// 3. 执行导入
const result = await importService.import(
  {
    file: selectedFile,
    conversion: DEFAULT_CONVERSION_CONFIG,
    skipExisting: false,
    createDeckIfNotExist: true,
    targetDeckName: '我的牌组' // 可选
  },
  (progress) => {
    // 进度回调
    console.log(`[${progress.stage}] ${progress.progress}% - ${progress.message}`);
  }
);

// 4. 处理结果
if (result.success) {
  console.log(`导入成功: ${result.stats.importedCards} 张卡片`);
} else {
  console.error('导入失败:', result.errors);
}
```

## 📊 导入进度阶段

| 阶段 | 说明 | 进度范围 |
|------|------|---------|
| `parsing` | 解析APKG文件 | 0-10% |
| `analyzing` | 分析字段配置 | 10-30% |
| `media` | 处理媒体文件 | 30-60% |
| `building` | 构建卡片 | 60-90% |
| `saving` | 保存数据 | 90-100% |

## 🔑 关键特性

### ✅ 智能字段解析
- 自动解析Anki模板（`qfmt` + `afmt`）
- 智能判断字段显示面
- **无需手动配置**

### ✅ 媒体处理
- 保存到`.tuanki/media/[APKG] DeckName/`
- SHA-256去重
- WikiLink格式：`![[path|width|alt]]`
- 支持图片、音频、视频

### ✅ HTML转换
- 基础标签 → Markdown
- 简单表格 → Markdown表格
- 复杂表格 → 保留HTML
- Anki挖空 → `==text==`

### ✅ 依赖注入
- 接口与实现分离
- 易于测试和替换
- 符合SOLID原则

## 📝 配置选项

```typescript
interface ImportConfig {
  file: File;                    // APKG文件
  conversion: ConversionConfig;  // 转换配置
  skipExisting: boolean;         // 跳过已存在
  createDeckIfNotExist: boolean; // 自动创建牌组
  targetDeckName?: string;       // 目标牌组名
}

interface ConversionConfig {
  preserveComplexTables: boolean;    // 保留复杂表格HTML
  convertSimpleTables: boolean;      // 转换简单表格
  mediaFormat: 'wikilink' | 'markdown'; // 媒体格式
  clozeFormat: '==' | '{{c::}}';     // 挖空格式
  preserveStyles: boolean;           // 保留样式
  tableComplexityThreshold: {        // 表格复杂度阈值
    maxColumns: number;
    maxRows: number;
    allowMergedCells: boolean;
  };
}
```

## 🧪 测试要点

1. **解析器测试**
   - 测试各种APKG格式（anki2, anki21, anki21b）
   - 边界情况处理

2. **转换器测试**
   - HTML→Markdown准确性
   - 媒体引用替换
   - 表格处理逻辑

3. **字段解析测试**
   - 各种模板格式
   - 条件语句处理
   - 特殊标记过滤

4. **集成测试**
   - 完整导入流程
   - 错误处理和恢复
   - 进度回调正确性

## 🔧 维护指南

### 扩展新功能
1. 在`domain/apkg/types.ts`添加类型定义
2. 在相应模块实现逻辑
3. 更新`index.ts`导出
4. 编写单元测试

### 调试技巧
- 使用`APKGLogger`记录日志
- 设置断点在关键转换点
- 查看`ImportProgress`追踪流程

---

**架构版本**: v1.0  
**创建日期**: 2025-01-07  
**状态**: ✅ 核心架构完成




