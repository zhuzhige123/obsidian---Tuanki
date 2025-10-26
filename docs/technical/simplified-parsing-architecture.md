# Tuanki 简化解析系统技术架构

## 🏗️ 架构概览

Tuanki 简化解析系统采用分层架构设计，将解析逻辑、配置管理和用户界面清晰分离，确保系统的可维护性和可扩展性。

## 📊 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    用户界面层 (UI Layer)                      │
├─────────────────────────────────────────────────────────────┤
│  SimplifiedParsingSettings.svelte  │  CardCreationModal     │
│  SettingsPanel.svelte              │  StudyModal.svelte     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    服务层 (Service Layer)                    │
├─────────────────────────────────────────────────────────────┤
│  SimplifiedCardParser              │  CardParsingEngine     │
│  ParsingConfigManager              │  ValidationService     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    数据层 (Data Layer)                       │
├─────────────────────────────────────────────────────────────┤
│  ParsingConfig                     │  CardData              │
│  TemplateDefinition                │  ParseResult           │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 核心组件详解

### 1. SimplifiedCardParser

**职责**：主解析引擎，负责将 Markdown 内容转换为卡片数据

**核心方法**：
```typescript
class SimplifiedCardParser {
  // 单卡解析
  async parseCard(content: string, config: ParsingConfig): Promise<Card>
  
  // 批量解析
  async parseBatch(content: string, config: ParsingConfig): Promise<Card[]>
  
  // 类型检测
  detectCardType(content: string): CardType
  
  // 内容提取
  extractFields(content: string, type: CardType): FieldData
}
```

**解析流程**：
1. 内容预处理（清理、标准化）
2. 卡片类型检测（问答、选择、挖空）
3. 字段提取和映射
4. 数据验证和清理
5. 卡片对象构建

### 2. CardParsingEngine

**职责**：解析规则引擎，管理解析逻辑和配置

**核心功能**：
```typescript
class CardParsingEngine {
  // 配置管理
  updateConfig(config: Partial<ParsingConfig>): void
  getConfig(): ParsingConfig
  
  // 规则管理
  addParsingRule(rule: ParsingRule): void
  removeParsingRule(ruleId: string): void
  
  // 模板管理
  registerTemplate(template: TemplateDefinition): void
  getTemplate(id: string): TemplateDefinition
}
```

### 3. ParsingConfigManager

**职责**：配置管理器，处理用户设置的持久化

**配置结构**：
```typescript
interface ParsingConfig {
  // 触发设置
  enableTagTrigger: boolean;
  triggerTag: string;
  
  // 符号配置
  rangeStart: string;
  rangeEnd: string;
  cardDelimiter: string;
  faceDelimiter: string;
  clozeMarker: string;
  
  // 解析选项
  preserveFormatting: boolean;
  strictMode: boolean;
  errorHandling: 'skip' | 'warn' | 'fail';
  
  // 性能设置
  maxCardsPerBatch: number;
  parseTimeout: number;
}
```

## 🔍 解析算法详解

### 卡片类型检测

```typescript
function detectCardType(content: string): CardType {
  // 1. 检测挖空标记
  if (content.includes('==') && content.match(/==[^=]+==/)) {
    return CardType.CLOZE;
  }
  
  // 2. 检测选择题格式
  const choicePattern = /^[\s]*[-*]\s*\[[x\s]\]/m;
  if (choicePattern.test(content)) {
    return CardType.MULTIPLE_CHOICE;
  }
  
  // 3. 默认为问答题
  return CardType.BASIC_QA;
}
```

### 字段提取算法

```typescript
function extractFields(content: string, type: CardType): FieldData {
  const fields: FieldData = {};
  
  switch (type) {
    case CardType.BASIC_QA:
      return extractQAFields(content);
    case CardType.MULTIPLE_CHOICE:
      return extractChoiceFields(content);
    case CardType.CLOZE:
      return extractClozeFields(content);
  }
}

function extractQAFields(content: string): FieldData {
  const dividerIndex = content.indexOf(config.faceDelimiter);
  
  if (dividerIndex !== -1) {
    return {
      front: content.substring(0, dividerIndex).trim(),
      back: content.substring(dividerIndex + config.faceDelimiter.length).trim(),
      tags: extractTags(content)
    };
  } else {
    return {
      front: content.trim(),
      back: '',
      tags: extractTags(content)
    };
  }
}
```

### 批量解析算法

```typescript
async function parseBatch(content: string): Promise<Card[]> {
  const cards: Card[] = [];
  const ranges = extractRanges(content);
  
  for (const range of ranges) {
    const cardContents = splitCards(range);
    
    for (const cardContent of cardContents) {
      try {
        const card = await parseCard(cardContent);
        cards.push(card);
      } catch (error) {
        handleParsingError(error, cardContent);
      }
    }
  }
  
  return cards;
}
```

## 🎨 用户界面组件

### SimplifiedParsingSettings.svelte

**功能**：解析系统的配置界面

**主要特性**：
- 符号配置管理
- 实时预览功能
- 模板编辑器
- 解析测试工具

**组件结构**：
```svelte
<script lang="ts">
  let config = $state<ParsingConfig>(defaultConfig);
  let previewContent = $state('');
  let parseResult = $state<ParseResult | null>(null);
  
  async function updateConfig(newConfig: Partial<ParsingConfig>) {
    config = { ...config, ...newConfig };
    await saveConfig(config);
    updatePreview();
  }
  
  async function testParsing() {
    const parser = new SimplifiedCardParser();
    parseResult = await parser.parseCard(previewContent, config);
  }
</script>
```

### 配置界面布局

```
┌─────────────────────────────────────────────────────────────┐
│ 卡片解析设置                                                  │
├─────────────────────────────────────────────────────────────┤
│ ┌─ 基础设置 ─────────────────────────────────────────────┐   │
│ │ ☑ 启用标签触发    触发标签: [#tuanki        ]         │   │
│ │ ☑ 保留格式       ☑ 严格模式                          │   │
│ └─────────────────────────────────────────────────────────┘   │
│ ┌─ 符号配置 ─────────────────────────────────────────────┐   │
│ │ 正反面分隔符: [---div---    ]                         │   │
│ │ 卡片分隔符:   [---卡片---   ]                         │   │
│ │ 挖空标记:     [==文本==     ]                         │   │
│ └─────────────────────────────────────────────────────────┘   │
│ ┌─ 解析测试 ─────────────────────────────────────────────┐   │
│ │ [测试内容输入框]                                       │   │
│ │ [解析结果显示]                                         │   │
│ │                                    [测试解析] [重置]   │   │
│ └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 性能优化

### 解析性能优化

1. **正则表达式缓存**：
```typescript
class RegexCache {
  private cache = new Map<string, RegExp>();
  
  getRegex(pattern: string, flags?: string): RegExp {
    const key = `${pattern}:${flags || ''}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, new RegExp(pattern, flags));
    }
    return this.cache.get(key)!;
  }
}
```

2. **内容预处理优化**：
```typescript
function preprocessContent(content: string): string {
  // 移除不必要的空白字符
  content = content.replace(/\r\n/g, '\n');
  content = content.replace(/\n{3,}/g, '\n\n');
  
  // 标准化标记符号
  content = normalizeMarkers(content);
  
  return content;
}
```

3. **批量解析优化**：
```typescript
async function parseBatchOptimized(contents: string[]): Promise<Card[]> {
  const batchSize = 50;
  const results: Card[] = [];
  
  for (let i = 0; i < contents.length; i += batchSize) {
    const batch = contents.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(content => parseCard(content))
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

## 🔒 错误处理

### 错误类型定义

```typescript
enum ParsingErrorType {
  INVALID_FORMAT = 'invalid_format',
  MISSING_CONTENT = 'missing_content',
  REGEX_ERROR = 'regex_error',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

class ParsingError extends Error {
  constructor(
    public type: ParsingErrorType,
    public content: string,
    message: string
  ) {
    super(message);
  }
}
```

### 错误处理策略

```typescript
function handleParsingError(error: ParsingError, content: string): void {
  switch (error.type) {
    case ParsingErrorType.INVALID_FORMAT:
      logger.warn(`格式错误: ${error.message}`, { content });
      break;
    case ParsingErrorType.TIMEOUT:
      logger.error(`解析超时: ${error.message}`, { content });
      break;
    default:
      logger.error(`未知错误: ${error.message}`, { error, content });
  }
}
```

## 📈 扩展性设计

### 插件化架构

```typescript
interface ParsingPlugin {
  name: string;
  version: string;
  detectCardType?(content: string): CardType | null;
  parseCard?(content: string, config: ParsingConfig): Promise<Card>;
  validateConfig?(config: ParsingConfig): boolean;
}

class PluginManager {
  private plugins: Map<string, ParsingPlugin> = new Map();
  
  registerPlugin(plugin: ParsingPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }
  
  getPlugin(name: string): ParsingPlugin | undefined {
    return this.plugins.get(name);
  }
}
```

### 自定义解析规则

```typescript
interface CustomParsingRule {
  id: string;
  name: string;
  pattern: RegExp;
  extractor: (match: RegExpMatchArray) => FieldData;
  validator?: (data: FieldData) => boolean;
}
```

---

**版本**：v1.0  
**维护状态**：活跃开发  
**API稳定性**：稳定
