/**
 * Markdown语义标记分隔符常量
 * 定义了用于卡片内容解析的所有标准分隔符和标记
 */

/**
 * 主内容分隔符
 * 用于分隔问题和答案等核心内容
 * ✅ 标准格式：---div---（问答题和选择题使用）
 */
export const MAIN_SEPARATOR = '---div---';

/**
 * 元数据分隔符
 * 标记额外字段区域的开始
 */
export const META_SEPARATOR = '---meta---';

/**
 * 可选的元数据分隔符（兼容性）
 */
export const META_SEPARATOR_ALIASES = [
  '---meta---',
  '---metadata---',
  '--- meta ---',
  '--- metadata ---'
];

/**
 * 语义标记前缀
 */
export const SEMANTIC_MARKERS = {
  /** 提示标记 - 用于问答题和选择题 */
  HINT: '💡 Hint:',
  
  /** 语境标记 - 用于挖空题 */
  CONTEXT: '💡 Context:',
  
  /** 解析标记 - 用于所有题型 */
  EXPLANATION: 'Explanation:',
  
  /** 标签前缀 */
  TAGS: 'Tags:',
  
  /** 来源前缀 */
  SOURCE: 'Source:',
  
  /** 难度前缀 */
  DIFFICULTY: 'Difficulty:',
  
  /** 关联笔记前缀 */
  RELATED: 'Related:',
} as const;

/**
 * 题型特定标记
 */
export const CARD_TYPE_MARKERS = {
  /** 问答题标记 */
  QA: {
    QUESTION: 'Q:',
    ANSWER: 'A:',
  },
  
  /** 选择题标记 */
  CHOICE: {
    QUESTION: 'Q:',
    /** 选项标签（A-Z） */
    OPTION_LABELS: ['A)', 'B)', 'C)', 'D)', 'E)', 'F)', 'G)', 'H)'],
    /** 正确答案标记 */
    CORRECT_MARKER: '{✓}',
    /** 可选的正确答案标记 */
    CORRECT_MARKER_ALIASES: ['{✓}', '{✔}', '{correct}', '✓', '✔'],
  },
  
  /** 挖空题标记 */
  CLOZE: {
    /** Obsidian风格挖空 */
    OBSIDIAN_STYLE: '==',
    /** Anki风格挖空 */
    ANKI_STYLE_PREFIX: '{{c',
    ANKI_STYLE_SUFFIX: '}}',
  },
} as const;

/**
 * 分隔符相关的正则表达式
 */
export const DELIMITER_PATTERNS = {
  /** 匹配主分隔符（---div---） */
  MAIN_SEPARATOR: /^\s*---div---\s*$/m,
  
  /** 匹配元数据分隔符（允许前后有空白，支持多种格式） */
  META_SEPARATOR: /^\s*---\s*meta(data)?\s*---\s*$/mi,
  
  /** 匹配任意语义标记（用于快速检测） */
  ANY_SEMANTIC_MARKER: /^(?:💡\s*(?:Hint|Context)|Explanation|Tags|Source|Difficulty|Related):/m,
} as const;

/**
 * 检查内容是否包含元数据区域
 */
export function hasMetadataSection(content: string): boolean {
  return DELIMITER_PATTERNS.META_SEPARATOR.test(content);
}

/**
 * 检查内容是否包含语义标记
 */
export function hasSemanticMarkers(content: string): boolean {
  return DELIMITER_PATTERNS.ANY_SEMANTIC_MARKER.test(content);
}

/**
 * 分割主内容和元数据
 */
export function splitContentAndMetadata(content: string): {
  mainContent: string;
  metadataContent: string;
} {
  const metaSeparatorMatch = content.match(DELIMITER_PATTERNS.META_SEPARATOR);
  
  if (!metaSeparatorMatch) {
    return {
      mainContent: content,
      metadataContent: ''
    };
  }
  
  const separatorIndex = metaSeparatorMatch.index!;
  const mainContent = content.substring(0, separatorIndex).trim();
  const metadataContent = content.substring(separatorIndex + metaSeparatorMatch[0].length).trim();
  
  return { mainContent, metadataContent };
}

/**
 * 验证选择题选项标签
 */
export function isValidOptionLabel(label: string): boolean {
  return CARD_TYPE_MARKERS.CHOICE.OPTION_LABELS.includes(label);
}

/**
 * 检查文本是否包含正确答案标记
 */
export function hasCorrectMarker(text: string): boolean {
  return CARD_TYPE_MARKERS.CHOICE.CORRECT_MARKER_ALIASES.some(marker => 
    text.includes(marker)
  );
}

/**
 * 移除正确答案标记
 */
export function removeCorrectMarker(text: string): string {
  let result = text;
  for (const marker of CARD_TYPE_MARKERS.CHOICE.CORRECT_MARKER_ALIASES) {
    result = result.replace(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
  }
  return result.trim();
}

/**
 * 格式化示例
 */
export const FORMAT_EXAMPLES = {
  /** 问答题示例 */
  QA: `什么是间隔重复学习的核心原理？

---div---

在即将遗忘时复习，利用遗忘曲线规律。

💡 提示：间隔重复是基于艾宾浩斯遗忘曲线理论，通过在记忆即将衰退时进行复习，可以有效强化长期记忆。`,

  /** 选择题示例 */
  CHOICE: `Q: FSRS算法中的"S"代表什么含义？

A) Speed（速度）
B) Stability（稳定性） {✓}
C) Strength（强度）
D) Success（成功率）

---div---

💡 解析：FSRS中Stability是最核心的概念，它代表了记忆在遗忘曲线上的位置。Stability越高，意味着记忆越牢固，下次复习间隔可以更长。`,

  /** 挖空题示例 */
  CLOZE: `FSRS算法通过计算卡片的==稳定性==(Stability)和==难度==(Difficulty)两个核心参数，来预测下次复习的==最佳时间间隔==。

💡 提示：稳定性反映记忆的保持程度，难度反映内容的记忆难易程度，两者共同决定最优复习时机。`,
} as const;







