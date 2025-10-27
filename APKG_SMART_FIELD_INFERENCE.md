# APKG 智能字段推断重构方案

## 📊 研究发现

### APKG 原生字段配置

APKG 文件在 `AnkiModel.tmpls` 中包含每个模板的完整配置：

```typescript
interface AnkiTemplate {
  name: string;
  ord: number;
  qfmt: string;  // 问题格式（正面HTML模板）
  afmt: string;  // 答案格式（背面HTML模板）
}
```

**示例**：
```json
{
  "qfmt": "{{question}}",
  "afmt": "{{FrontSide}}<hr id='answer'>{{answer}}<br>{{extra}}"
}
```

**字段显示面规则**：
- `question` 字段 → **仅正面**（只在 qfmt 中）
- `answer` 字段 → **仅背面**（只在 afmt 中）
- `extra` 字段 → **仅背面**（只在 afmt 中）
- 如果字段同时出现在 qfmt 和 afmt → **两面**

### 特殊标记

- `{{FrontSide}}` - Anki 特殊标记，表示在背面显示正面内容
- `{{cloze:字段名}}` - 挖空题字段

## ❌ 当前问题

### 1. 不准确的推断

```typescript
// 当前实现：基于字段名称推断
function inferFieldSide(fieldName: string, fieldIndex: number): 'front' | 'back' | 'both' {
  const lowerName = fieldName.toLowerCase();
  
  if (lowerName.includes('question')) return 'front';
  if (lowerName.includes('answer')) return 'back';
  
  // 位置推断：第一个字段 → front，第二个 → back
  if (fieldIndex === 0) return 'front';
  if (fieldIndex === 1) return 'back';
  
  return 'both';
}
```

**问题**：
- ❌ 依赖字段名称，不可靠
- ❌ 位置推断不准确（Anki 可以自由配置）
- ❌ 无法处理复杂模板（多个字段在同一面）

### 2. 复杂的用户界面

- 需要用户手动配置每个字段的显示面
- 增加了导入流程的复杂度
- 对大多数用户来说是不必要的步骤

### 3. 与 APKG 原生设计不一致

- APKG 已经定义了字段显示规则
- 我们应该直接使用 APKG 的配置，而不是重新推断

## ✅ 解决方案

### 1. 智能字段解析函数

```typescript
/**
 * 从 Anki 模板中提取字段名称
 */
function extractFieldsFromTemplate(template: string): Set<string> {
  const fields = new Set<string>();
  
  // 匹配所有 {{字段名}} 格式
  const regex = /\{\{([^}]+?)\}\}/g;
  let match;
  
  while ((match = regex.exec(template)) !== null) {
    let fieldName = match[1].trim();
    
    // 跳过特殊标记
    if (fieldName === 'FrontSide' || 
        fieldName.startsWith('#') ||
        fieldName.startsWith('/') ||
        fieldName.startsWith('!')) {
      continue;
    }
    
    // 处理挖空题格式 {{cloze:字段名}}
    if (fieldName.startsWith('cloze:')) {
      fieldName = fieldName.substring(6).trim();
    }
    
    // 处理其他修饰符 {{type:字段名}}, {{hint:字段名}}
    if (fieldName.includes(':')) {
      fieldName = fieldName.split(':')[1].trim();
    }
    
    fields.add(fieldName);
  }
  
  return fields;
}

/**
 * 根据 Anki 模板确定字段显示面
 */
function determineFieldSideFromTemplate(
  fieldName: string,
  qfmt: string,
  afmt: string
): 'front' | 'back' | 'both' {
  const frontFields = extractFieldsFromTemplate(qfmt);
  const backFields = extractFieldsFromTemplate(afmt);
  
  const inFront = frontFields.has(fieldName);
  const inBack = backFields.has(fieldName);
  
  if (inFront && inBack) {
    return 'both';
  } else if (inFront) {
    return 'front';
  } else if (inBack) {
    return 'back';
  } else {
    // 字段未在任何模板中使用，默认显示在两面
    return 'both';
  }
}

/**
 * 为 Anki 模型的所有字段确定显示面
 */
function determineAllFieldSides(model: AnkiModel): Record<string, 'front' | 'back' | 'both'> {
  const fieldSides: Record<string, 'front' | 'back' | 'both'> = {};
  
  // 使用第一个模板作为标准
  // （大多数 Anki 模型只有一个模板，多模板情况较少）
  const template = model.tmpls[0];
  
  if (!template) {
    // 没有模板，使用后备推断
    model.flds.forEach((field, index) => {
      fieldSides[field.name] = index === 0 ? 'front' : 'back';
    });
    return fieldSides;
  }
  
  // 基于模板确定每个字段的显示面
  model.flds.forEach(field => {
    fieldSides[field.name] = determineFieldSideFromTemplate(
      field.name,
      template.qfmt,
      template.afmt
    );
  });
  
  return fieldSides;
}
```

### 2. 集成到模板转换器

修改 `apkg-template-converter.ts`：

```typescript
export function convertAnkiModelToParseTemplate(
  model: AnkiModel,
  options: ConversionOptions = {}
): ParseTemplate {
  const {
    prefix = 'anki-imported',
    source = 'anki_imported',
    isOfficial = false
  } = options;

  const cardType = inferCardType(model);
  const templateId = generateTemplateId(model, prefix);
  
  // ✅ 使用智能解析确定字段显示面
  const fieldSides = determineAllFieldSides(model);

  // 转换字段
  const fields: TemplateField[] = model.flds.map((ankiField, index) => {
    const fieldKey = ankiField.name.toLowerCase().replace(/\s+/g, '_');
    const side = fieldSides[ankiField.name]; // ← 使用智能解析结果
    
    return {
      name: ankiField.name,
      pattern: ankiField.name,
      isRegex: false,
      required: index === 0,
      description: `Anki 字段: ${ankiField.name} (显示面: ${side})`,
      type: 'field' as const,
      side: side,
      key: fieldKey
    };
  });

  // ... 其余代码保持不变
}
```

### 3. 简化导入流程

**移除**：
- ❌ `FieldSideConfigStep.svelte` 组件
- ❌ 字段配置界面
- ❌ 手动配置逻辑

**保留**：
- ✅ 文件选择
- ✅ 自动分析
- ✅ 预览确认
- ✅ 导入执行

**新流程**：
```
选择文件 → 自动分析（智能提取字段配置）→ 预览确认 → 导入
```

## 📋 实施步骤

### Phase 1: 创建智能解析函数 ✅

**文件**: `src/utils/apkg-field-parser.ts`（新建）

```typescript
// 实现上述所有智能解析函数
export {
  extractFieldsFromTemplate,
  determineFieldSideFromTemplate,
  determineAllFieldSides
};
```

### Phase 2: 更新模板转换器 ✅

**文件**: `src/importers/apkg-template-converter.ts`

**修改**：
1. 移除旧的 `inferFieldSide` 函数（第79-109行）
2. 导入新的智能解析函数
3. 在 `convertAnkiModelToParseTemplate` 中使用智能解析

### Phase 3: 简化导入模态窗 ✅

**文件**: `src/components/modals/APKGImportModal.svelte`

**修改**：
1. 移除 `configure` 步骤
2. 移除 `FieldSideConfigStep` 组件引用
3. 移除字段配置相关状态和函数
4. 简化步骤流程：`select` → `analyzing` → `preview` → `importing` → `result`

**删除的代码**：
- `fieldConfigurations` state
- `handleFieldConfigComplete` 函数
- `handleFieldConfigSkip` 函数
- `handleFieldConfigBack` 函数
- `handleFieldConfigConfirm` 函数
- Footer 中的 configure 按钮

### Phase 4: 移除字段配置组件 ✅

**删除文件**：
- `src/components/modals/FieldSideConfigStep.svelte`
- `src/components/modals/apkg/FieldSideConfigStep.svelte`（如果存在）

### Phase 5: 清理相关类型和工具 ✅

**文件**: `src/types/apkg-import-types.ts`

**保留**：
- `FieldSideConfiguration` 类型（用于内部表示）
- 其他分析和导入类型

**移除**：
- 与字段配置UI相关的特定类型

## 🎯 预期效果

### 导入流程对比

**旧流程**（5步）：
```
选择文件 → 分析 → 配置字段 → 预览 → 导入
         ↓       ↓ 手动配置  ↓
      复杂、耗时、容易出错
```

**新流程**（4步）：
```
选择文件 → 分析 → 预览 → 导入
         ↓ 智能提取 ↓
    简单、快速、准确
```

### 用户体验改进

- ✅ **更简单**：减少一个手动配置步骤
- ✅ **更快速**：自动解析，无需等待用户输入
- ✅ **更准确**：使用 APKG 原生配置，100% 准确
- ✅ **更符合预期**：导入后的卡片显示与 Anki 中一致

### 代码质量改进

- ✅ **更少的代码**：移除约 800 行 UI 代码
- ✅ **更简单的逻辑**：无需管理复杂的配置状态
- ✅ **更易维护**：遵循 APKG 标准，而不是自定义推断

## 🧪 测试用例

### 测试 1: 基础问答卡片

**APKG模板**：
```json
{
  "qfmt": "{{question}}",
  "afmt": "{{FrontSide}}<hr>{{answer}}"
}
```

**预期结果**：
- `question` → `front`
- `answer` → `back`

### 测试 2: 多字段卡片

**APKG模板**：
```json
{
  "qfmt": "{{word}}<br>{{pronunciation}}",
  "afmt": "{{FrontSide}}<hr>{{meaning}}<br>{{example}}<br>{{notes}}"
}
```

**预期结果**：
- `word` → `front`
- `pronunciation` → `front`
- `meaning` → `back`
- `example` → `back`
- `notes` → `back`

### 测试 3: 两面共享字段

**APKG模板**：
```json
{
  "qfmt": "{{question}}<br><small>{{hint}}</small>",
  "afmt": "{{FrontSide}}<hr>{{answer}}<br><small>{{hint}}</small>"
}
```

**预期结果**：
- `question` → `front`
- `hint` → `both`（同时出现在正面和背面）
- `answer` → `back`

### 测试 4: 挖空卡片

**APKG模板**：
```json
{
  "qfmt": "{{cloze:Text}}",
  "afmt": "{{cloze:Text}}<br>{{Extra}}"
}
```

**预期结果**：
- `Text` → `both`（挖空字段通常在两面）
- `Extra` → `back`

## 🔄 向后兼容性

**不需要向后兼容**：
- 项目处于开发阶段
- 无真实用户数据
- 可以直接替换旧实现

## 📊 代码变更统计

**预计删除**：
- FieldSideConfigStep.svelte: ~800 行
- APKGImportModal.svelte: ~150 行配置相关代码
- 相关样式和类型: ~100 行

**预计新增**：
- apkg-field-parser.ts: ~150 行
- 模板转换器更新: ~50 行

**净减少**: ~850 行代码

## 🎬 媒体文件处理

### 现有实现（保留）

**已实现的媒体处理功能**：

1. **MediaFileHandler** (`utils/mediaFileHandler.ts`)
   - ✅ 批量保存媒体文件到 `tuanki/media/decks/{deckId}/`
   - ✅ HTML到Obsidian语法转换：
     ```typescript
     <img src="file.png" width="300" alt="图片"> 
     → ![[tuanki/media/decks/xxx/file.png|300|图片]]
     
     <audio src="audio.mp3"></audio>
     → ![[tuanki/media/decks/xxx/audio.mp3]]
     
     <video src="video.mp4"></video>
     → ![[tuanki/media/decks/xxx/video.mp4]]
     ```

2. **MediaFileManager** (`services/apkg/MediaFileManager.ts`)
   - ✅ 专属文件夹结构：`.tuanki/media/[APKG] DeckName/{images,audio,video}/`
   - ✅ 文件去重（SHA-256哈希）
   - ✅ 清单管理（.manifest.json）
   - ✅ 全局索引（.index.json）

3. **转换规则**
   ```typescript
   // HTML 图片
   <img src="image.png" width="500" alt="描述">
   → ![[.tuanki/media/[APKG] DeckName/images/image.png|500|描述]]
   
   // HTML 音频
   <audio src="sound.mp3"></audio>
   → ![[.tuanki/media/[APKG] DeckName/audio/sound.mp3]]
   
   // HTML 视频
   <video src="clip.mp4"></video>
   → ![[.tuanki/media/[APKG] DeckName/video/clip.mp4]]
   
   // Markdown 图片
   ![描述](image.png)
   → ![[.tuanki/media/[APKG] DeckName/images/image.png|描述]]
   ```

### 重构中的保留事项

**必须保留**：
- ✅ 所有媒体文件处理逻辑
- ✅ HTML到Obsidian语法转换
- ✅ 文件夹结构和清单系统
- ✅ 文件去重机制

**优化点**：
- 确保在智能解析字段后，媒体转换仍然正确应用
- 保持导入流程中的媒体处理步骤

## ✅ 实施检查清单

### Phase 1: 准备工作
- [ ] 创建 `src/utils/apkg-field-parser.ts`
- [ ] 实现 `extractFieldsFromTemplate`
- [ ] 实现 `determineFieldSideFromTemplate`
- [ ] 实现 `determineAllFieldSides`
- [ ] 编写单元测试

### Phase 2: 集成智能解析
- [ ] 更新 `apkg-template-converter.ts`
- [ ] 替换 `inferFieldSide` 为智能解析
- [ ] 验证转换结果

### Phase 3: 简化导入流程
- [ ] 移除 APKGImportModal 中的 configure 步骤
- [ ] 删除 fieldConfigurations 相关代码
- [ ] 删除配置相关函数
- [ ] 更新步骤导航逻辑
- [ ] 移除 Footer 中的 configure 按钮

### Phase 4: 清理代码
- [ ] 删除 FieldSideConfigStep.svelte
- [ ] 清理未使用的导入
- [ ] 清理未使用的类型定义
- [ ] 清理未使用的样式

### Phase 5: 测试验证
- [ ] 测试基础问答卡片导入
- [ ] 测试多字段卡片导入
- [ ] 测试两面共享字段导入
- [ ] 测试挖空卡片导入
- [ ] 验证预览界面显示正确
- [ ] 验证导入后卡片显示正确
- [ ] **测试媒体文件处理**：
  - [ ] 图片HTML → Obsidian WikiLink转换
  - [ ] 音频HTML → Obsidian WikiLink转换
  - [ ] 视频HTML → Obsidian WikiLink转换
  - [ ] 保留alt文本和宽度属性
  - [ ] 文件正确保存到 `.tuanki/media/` 结构
  - [ ] 文件去重功能正常
  - [ ] 清单文件正确生成

### Phase 6: 文档更新
- [ ] 更新用户文档
- [ ] 更新开发者文档
- [ ] 添加智能解析说明

## 🎓 总结

这次重构将：

1. **采用 APKG 原生设计**：直接使用模板中的字段配置
2. **简化用户体验**：移除不必要的手动配置步骤
3. **提高准确性**：100% 符合 APKG 原始设计
4. **减少代码复杂度**：净减少约 850 行代码
5. **提升可维护性**：遵循标准而非自定义推断
6. **保留核心功能**：
   - ✅ 媒体文件处理（图片、音频、视频）
   - ✅ HTML到Obsidian语法转换
   - ✅ 专属文件夹结构（`.tuanki/media/`）
   - ✅ 文件去重和清单管理

## 📊 完整导入流程

### 新的导入流程

```
1. 选择APKG文件
   ↓
2. 自动分析
   ├─ 解析模板（qfmt/afmt）
   ├─ 智能提取字段显示面
   ├─ 提取媒体文件列表
   └─ 生成示例预览
   ↓
3. 预览确认
   ├─ 显示字段配置（自动解析）
   ├─ 显示卡片预览
   └─ 显示媒体文件列表
   ↓
4. 执行导入
   ├─ 创建牌组
   ├─ 创建ParseTemplate（使用智能解析的字段配置）
   ├─ 保存媒体文件到 `.tuanki/media/[APKG] DeckName/`
   ├─ 转换HTML为Obsidian语法
   ├─ 创建卡片
   └─ 生成清单文件
   ↓
5. 完成
```

### 媒体处理流程

```
导入卡片内容
   ↓
识别媒体引用（HTML标签）
   ↓
提取媒体文件
   ↓
保存到 .tuanki/media/[APKG] DeckName/{images,audio,video}/
   ├─ 计算SHA-256哈希
   ├─ 检查去重
   └─ 更新清单
   ↓
转换为Obsidian语法
   ├─ <img> → ![[path|width|alt]]
   ├─ <audio> → ![[path]]
   └─ <video> → ![[path]]
   ↓
更新卡片内容
```

这是一个**正确的**技术决策，应该立即实施。

