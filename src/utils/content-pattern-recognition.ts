/**
 * 内容模式识别系统
 * 实现先解析后模板选择的智能识别机制
 */

/**
 * 内容模式定义接口
 */
export interface ContentPattern {
  id: string;
  name: string;
  description: string;
  regex: RegExp;
  type: 'basic-qa' | 'multiple-choice' | 'cloze' | 'list' | 'definition' | 'comparison';
  confidence: number;
  fieldMapping: Record<string, number>;
  priority: number;
  examples: string[];
  tags: string[];
}

/**
 * 模式匹配结果
 */
export interface PatternMatchResult {
  pattern: ContentPattern;
  match: RegExpMatchArray;
  score: number;
  extractedFields: Record<string, string>;
  confidence: number;
}

/**
 * 解析结果数据结构
 */
export interface ParsedResult {
  success: boolean;
  pattern: string;
  confidence: number;
  fields: Record<string, string>;
  notes: string;  // 🔥 关键：完整原始内容保护
  metadata: {
    parseMethod: string;
    parsePattern: string;
    parseConfidence: number;
    matchedAt: string;
    processingTime: number;
  };
}

/**
 * 必备字段生成结果
 */
export interface RequiredFields {
  notes: string;           // 完整原始内容
  uuid: string;           // 唯一标识符
  blockLink: string;      // Obsidian块链接
  sourceDocument: string; // 源文档名
  sourceFile: string;     // 源文件路径
  lineNumber: number;     // 源文档行号
  createdAt: string;      // 创建时间
  updatedAt: string;      // 更新时间
}

/**
 * 预定义内容模式库
 */
export const CONTENT_PATTERNS: ContentPattern[] = [
  // 1. 二级标题问答模式 - 最常用
  {
    id: 'h2-qa-pattern',
    name: '二级标题问答',
    description: '以二级标题作为问题，后续内容作为答案的格式',
    regex: /^## (.+)\n([\s\S]*?)(?=\n##|\n#|$)/m,
    type: 'basic-qa',
    confidence: 0.95,
    fieldMapping: {
      question: 1,  // 第一个捕获组：标题内容
      answer: 2     // 第二个捕获组：剩余内容
    },
    priority: 10,
    examples: [
      '## 什么是间隔重复？\n间隔重复是一种学习技术...',
      '## Python中的列表推导式\n列表推导式是Python的一个特性...'
    ],
    tags: ['markdown', 'heading', 'qa', 'common']
  },

  // 2. 三级标题问答模式
  {
    id: 'h3-qa-pattern',
    name: '三级标题问答',
    description: '以三级标题作为问题，后续内容作为答案的格式',
    regex: /^### (.+)\n([\s\S]*?)(?=\n###|\n##|\n#|$)/m,
    type: 'basic-qa',
    confidence: 0.90,
    fieldMapping: {
      question: 1,
      answer: 2
    },
    priority: 8,
    examples: [
      '### 如何使用Git？\nGit是一个版本控制系统...',
      '### 什么是递归？\n递归是函数调用自身的编程技术...'
    ],
    tags: ['markdown', 'heading', 'qa']
  },

  // 3. 问答对模式（Q: A:）
  {
    id: 'qa-pair-pattern',
    name: '问答对格式',
    description: '使用Q:和A:标记的问答对格式',
    regex: /^Q:\s*(.+)\n+A:\s*([\s\S]*?)(?=\nQ:|$)/m,
    type: 'basic-qa',
    confidence: 0.92,
    fieldMapping: {
      question: 1,
      answer: 2
    },
    priority: 9,
    examples: [
      'Q: 什么是机器学习？\nA: 机器学习是人工智能的一个分支...',
      'Q: 如何优化数据库查询？\nA: 可以通过创建索引、优化查询语句...'
    ],
    tags: ['qa', 'structured', 'explicit']
  },

  // 4. 选择题模式
  {
    id: 'multiple-choice-pattern',
    name: '选择题格式',
    description: '包含问题和A、B、C、D选项的选择题格式',
    regex: /^(.+?)\n+([A-D]\.[\s\S]*?)(?=\n\n|$)/m,
    type: 'multiple-choice',
    confidence: 0.88,
    fieldMapping: {
      question: 1,
      options: 2
    },
    priority: 7,
    examples: [
      '下列哪个是Python的特点？\nA. 编译型语言\nB. 解释型语言\nC. 汇编语言\nD. 机器语言',
      '什么是HTTP协议？\nA. 文件传输协议\nB. 超文本传输协议\nC. 邮件传输协议\nD. 网络传输协议'
    ],
    tags: ['multiple-choice', 'exam', 'options']
  },

  // 5. 填空题模式
  {
    id: 'cloze-pattern',
    name: '填空题格式',
    description: '包含空白填空的句子或段落',
    regex: /^(.*?)__(.*?)__(.*?)$/m,
    type: 'cloze',
    confidence: 0.85,
    fieldMapping: {
      cloze: 0  // 整个匹配作为填空题
    },
    priority: 6,
    examples: [
      'Python是一种__解释型__编程语言。',
      '机器学习的三种主要类型是__监督学习__、__无监督学习__和__强化学习__。'
    ],
    tags: ['cloze', 'fill-blank', 'interactive']
  },

  // 6. 定义模式
  {
    id: 'definition-pattern',
    name: '定义格式',
    description: '术语定义格式，通常以冒号分隔',
    regex: /^([^:\n]+):\s*([\s\S]*?)(?=\n[^:\n]+:|$)/m,
    type: 'definition',
    confidence: 0.80,
    fieldMapping: {
      term: 1,      // 术语
      definition: 2  // 定义
    },
    priority: 5,
    examples: [
      '算法: 解决问题的一系列明确指令或规则。',
      '数据结构: 组织和存储数据的特定方式，以便能够高效地访问和修改数据。'
    ],
    tags: ['definition', 'terminology', 'concept']
  },

  // 7. 列表模式
  {
    id: 'list-pattern',
    name: '列表格式',
    description: '包含多个要点的列表格式',
    regex: /^(.+?)\n+([-*]\s+.+(?:\n[-*]\s+.*)*)/m,
    type: 'list',
    confidence: 0.75,
    fieldMapping: {
      topic: 1,     // 主题
      items: 2      // 列表项
    },
    priority: 4,
    examples: [
      'Python的优点：\n- 语法简洁\n- 库丰富\n- 跨平台\n- 社区活跃',
      '学习方法：\n* 制定计划\n* 定期复习\n* 实践应用\n* 总结反思'
    ],
    tags: ['list', 'enumeration', 'points']
  },

  // 8. 对比模式
  {
    id: 'comparison-pattern',
    name: '对比格式',
    description: '对比两个或多个概念的格式',
    regex: /^(.+?)\s+vs\.?\s+(.+?)\n+([\s\S]*)/m,
    type: 'comparison',
    confidence: 0.78,
    fieldMapping: {
      concept1: 1,   // 概念1
      concept2: 2,   // 概念2
      comparison: 3  // 对比内容
    },
    priority: 3,
    examples: [
      'SQL vs NoSQL\nSQL数据库使用结构化查询语言...',
      '监督学习 vs 无监督学习\n监督学习需要标记数据...'
    ],
    tags: ['comparison', 'contrast', 'analysis']
  }
];

/**
 * 获取所有可用的内容模式
 */
export function getAllContentPatterns(): ContentPattern[] {
  return [...CONTENT_PATTERNS].sort((a, b) => b.priority - a.priority);
}

/**
 * 根据ID获取特定模式
 */
export function getPatternById(id: string): ContentPattern | undefined {
  return CONTENT_PATTERNS.find(pattern => pattern.id === id);
}

/**
 * 根据类型获取模式
 */
export function getPatternsByType(type: ContentPattern['type']): ContentPattern[] {
  return CONTENT_PATTERNS.filter(pattern => pattern.type === type);
}

/**
 * 根据标签获取模式
 */
export function getPatternsByTag(tag: string): ContentPattern[] {
  return CONTENT_PATTERNS.filter(pattern => pattern.tags.includes(tag));
}

/**
 * 添加自定义模式
 */
export function addCustomPattern(pattern: ContentPattern): void {
  // 检查ID是否已存在
  if (CONTENT_PATTERNS.find(p => p.id === pattern.id)) {
    throw new Error(`Pattern with ID '${pattern.id}' already exists`);
  }
  
  CONTENT_PATTERNS.push(pattern);
  console.log(`✅ [ContentPatternRecognition] 添加自定义模式: ${pattern.name}`);
}

/**
 * 移除模式
 */
export function removePattern(id: string): boolean {
  const index = CONTENT_PATTERNS.findIndex(p => p.id === id);
  if (index !== -1) {
    CONTENT_PATTERNS.splice(index, 1);
    console.log(`✅ [ContentPatternRecognition] 移除模式: ${id}`);
    return true;
  }
  return false;
}

/**
 * 智能模式匹配函数 - 核心解析逻辑
 */
export function intelligentPatternMatching(content: string): PatternMatchResult | null {
  console.log('🔍 [intelligentPatternMatching] 开始智能模式识别');
  console.log('📝 [intelligentPatternMatching] 内容长度:', content.length);
  console.log('📝 [intelligentPatternMatching] 内容预览:', content.substring(0, 100) + '...');

  const startTime = Date.now();
  const matches: PatternMatchResult[] = [];
  const patterns = getAllContentPatterns();

  console.log('🔧 [intelligentPatternMatching] 可用模式数量:', patterns.length);

  // 逐个测试所有模式
  for (const pattern of patterns) {
    try {
      const match = content.match(pattern.regex);
      if (match) {
        console.log(`✅ [intelligentPatternMatching] 模式匹配成功: ${pattern.name}`);

        // 提取字段
        const extractedFields = extractFieldsFromMatch(match, pattern.fieldMapping);

        // 计算匹配分数
        const score = calculatePatternScore(content, pattern, match, extractedFields);

        console.log(`📊 [intelligentPatternMatching] 匹配分数: ${score}`, {
          pattern: pattern.name,
          confidence: pattern.confidence,
          extractedFields: Object.keys(extractedFields)
        });

        matches.push({
          pattern,
          match,
          score,
          extractedFields,
          confidence: pattern.confidence
        });
      } else {
        console.log(`❌ [intelligentPatternMatching] 模式不匹配: ${pattern.name}`);
      }
    } catch (error) {
      console.error(`❌ [intelligentPatternMatching] 模式测试失败: ${pattern.name}`, error);
    }
  }

  const processingTime = Date.now() - startTime;
  console.log(`⏱️ [intelligentPatternMatching] 处理时间: ${processingTime}ms`);

  // 如果没有任何模式匹配
  if (matches.length === 0) {
    console.log('❌ [intelligentPatternMatching] 所有模式都不匹配');
    return null;
  }

  // 按分数排序，选择最佳匹配
  matches.sort((a, b) => b.score - a.score);
  const bestMatch = matches[0];

  console.log(`🎯 [intelligentPatternMatching] 选择最佳模式: ${bestMatch.pattern.name}`, {
    score: bestMatch.score,
    confidence: bestMatch.confidence,
    processingTime
  });

  return bestMatch;
}

/**
 * 从正则匹配结果中提取字段
 */
function extractFieldsFromMatch(
  match: RegExpMatchArray,
  fieldMapping: Record<string, number>
): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const [fieldName, groupIndex] of Object.entries(fieldMapping)) {
    const value = match[groupIndex];
    fields[fieldName] = value ? value.trim() : '';

    console.log(`🔧 [extractFieldsFromMatch] 提取字段: ${fieldName} = "${fields[fieldName].substring(0, 50)}..."`);
  }

  return fields;
}

/**
 * 计算模式匹配的质量分数
 */
function calculatePatternScore(
  content: string,
  pattern: ContentPattern,
  match: RegExpMatchArray,
  extractedFields: Record<string, string>
): number {
  let score = 0;

  // 基础分数：成功匹配
  score += 100;

  // 模式置信度权重
  score += pattern.confidence * 100;

  // 模式优先级权重
  score += pattern.priority * 10;

  // 内容完整性分数
  const fieldValues = Object.values(extractedFields);
  const nonEmptyFields = fieldValues.filter(value => value && value.trim().length > 0);
  const fieldCompleteness = nonEmptyFields.length / fieldValues.length;
  score += fieldCompleteness * 50;

  // 匹配长度覆盖率
  const matchLength = match[0].length;
  const contentLength = content.length;
  const coverageRatio = matchLength / contentLength;

  // 理想覆盖率在60%-95%之间
  if (coverageRatio >= 0.6 && coverageRatio <= 0.95) {
    score += 30;
  } else if (coverageRatio >= 0.4 && coverageRatio < 0.6) {
    score += 15;
  }

  // 字段内容质量分数
  for (const [fieldName, value] of Object.entries(extractedFields)) {
    if (value && value.trim().length > 0) {
      // 字段长度合理性
      const fieldLength = value.length;
      if (fieldLength >= 5 && fieldLength <= 500) {
        score += 10;
      } else if (fieldLength > 500) {
        score += 5; // 过长的字段稍微减分
      }

      // 特定字段的质量检查
      if (fieldName === 'question' && value.includes('?')) {
        score += 5; // 问题字段包含问号
      }
      if (fieldName === 'answer' && value.length > 10) {
        score += 5; // 答案字段有足够长度
      }
    }
  }

  // 内容结构合理性
  if (pattern.type === 'basic-qa') {
    const question = extractedFields.question || '';
    const answer = extractedFields.answer || '';

    if (question.length > 0 && answer.length > 0) {
      // 问答长度平衡性
      const ratio = Math.min(question.length, answer.length) / Math.max(question.length, answer.length);
      if (ratio > 0.1) { // 不要相差太悬殊
        score += 15;
      }
    }
  }

  console.log(`📊 [calculatePatternScore] 分数计算详情:`, {
    pattern: pattern.name,
    baseScore: 100,
    confidenceBonus: pattern.confidence * 100,
    priorityBonus: pattern.priority * 10,
    fieldCompleteness: fieldCompleteness * 50,
    coverageRatio,
    totalScore: score
  });

  return Math.round(score);
}

/**
 * 生成必备字段
 */
export function generateRequiredFields(
  originalContent: string,
  sourceInfo?: any
): RequiredFields {
  const timestamp = new Date().toISOString();
  const contentHash = generateContentHash(originalContent);

  return {
    notes: originalContent,  // 🔥 关键：完整原始内容保护
    uuid: `tuanki-${Date.now()}-${contentHash}`,
    blockLink: sourceInfo?.blockLink || '',
    sourceDocument: sourceInfo?.sourceDocument || '',
    sourceFile: sourceInfo?.sourceFile || '',
    lineNumber: sourceInfo?.lineNumber || 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

/**
 * 生成内容哈希（用于唯一标识符）
 */
function generateContentHash(content: string): string {
  // 简单的哈希函数，基于内容生成短哈希
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash).toString(36).substr(0, 8);
}

/**
 * 构建完整的解析结果
 */
export function buildParseResult(
  content: string,
  matchResult: PatternMatchResult | null,
  sourceInfo?: any
): ParsedResult {
  const startTime = Date.now();

  if (!matchResult) {
    // 解析失败的情况
    console.log('❌ [buildParseResult] 解析失败，使用保护模式');

    return {
      success: false,
      pattern: 'no-match',
      confidence: 0,
      fields: {
        question: content,  // 🔥 解析失败时，完整内容放在问题字段
        answer: '请补充答案内容',
        notes: content
      },
      notes: content,
      metadata: {
        parseMethod: 'fallback-protection',
        parsePattern: 'no-match',
        parseConfidence: 0,
        matchedAt: new Date().toISOString(),
        processingTime: Date.now() - startTime
      }
    };
  }

  // 解析成功的情况
  console.log('✅ [buildParseResult] 解析成功，构建结果');

  const fields = {
    ...matchResult.extractedFields,
    notes: content  // 确保notes字段始终包含完整内容
  };

  return {
    success: true,
    pattern: matchResult.pattern.id,
    confidence: matchResult.confidence,
    fields,
    notes: content,
    metadata: {
      parseMethod: 'intelligent-pattern-matching',
      parsePattern: matchResult.pattern.id,
      parseConfidence: matchResult.confidence,
      matchedAt: new Date().toISOString(),
      processingTime: Date.now() - startTime
    }
  };
}

/**
 * 主要的内容解析函数 - 对外接口
 */
export function parseContentIntelligently(
  content: string,
  sourceInfo?: any
): ParsedResult {
  console.log('🚀 [parseContentIntelligently] 开始智能内容解析');

  if (!content || content.trim().length === 0) {
    console.log('❌ [parseContentIntelligently] 内容为空');
    throw new Error('内容不能为空');
  }

  // 1. 智能模式匹配
  const matchResult = intelligentPatternMatching(content);

  // 2. 构建解析结果
  const parseResult = buildParseResult(content, matchResult, sourceInfo);

  console.log('🎯 [parseContentIntelligently] 解析完成:', {
    success: parseResult.success,
    pattern: parseResult.pattern,
    confidence: parseResult.confidence,
    fieldsCount: Object.keys(parseResult.fields).length
  });

  return parseResult;
}
