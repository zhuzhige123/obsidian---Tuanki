/**
 * 卡片Markdown序列化工具
 * 提供卡片数据与Markdown格式之间的双向转换
 * 供临时文件方案和降级编辑器共用
 */

import type { Card } from '../data/types';
import { TagExtractor } from './tag-extractor';

/**
 * 将卡片数据转换为Obsidian兼容的Markdown格式（遵循卡片数据结构规范 v1.0）
 * 
 * ✅ 核心原则：
 * 1. 优先使用card.content（权威数据源）
 * 2. 如果content不存在，从card.fields生成（向后兼容）
 * 3. 溯源信息从专用字段读取（不从fields读取）
 */
export function cardToMarkdown(card: Card): string {
  const lines: string[] = [];

  // 添加YAML frontmatter
  lines.push('---');
  lines.push(`tuanki_card_id: "${card.id}"`);
  lines.push(`tuanki_uuid: "${card.uuid}"`);
  lines.push(`tuanki_deck_id: "${card.deckId}"`);
  lines.push(`tuanki_template_id: "${card.templateId}"`);
  lines.push(`created: "${card.created}"`);
  lines.push(`modified: "${card.modified}"`);

  // 添加标签到YAML
  if (card.tags && card.tags.length > 0) {
    lines.push('tags:');
    card.tags.forEach(tag => {
      lines.push(`  - "${tag}"`);
    });
  }

  // 添加FSRS数据到YAML
  lines.push('tuanki_fsrs:');
  lines.push(`  due: "${card.fsrs.due}"`);
  lines.push(`  stability: ${card.fsrs.stability}`);
  lines.push(`  difficulty: ${card.fsrs.difficulty}`);
  lines.push(`  state: ${card.fsrs.state}`);
  lines.push(`  reps: ${card.fsrs.reps}`);
  lines.push(`  lapses: ${card.fsrs.lapses}`);
  lines.push(`  elapsed_days: ${card.fsrs.elapsed_days}`);
  lines.push(`  scheduled_days: ${card.fsrs.scheduled_days}`);
  if (card.fsrs.last_review) {
    lines.push(`  last_review: "${card.fsrs.last_review}"`);
  }

  // 添加其他元数据
  if (card.priority) {
    lines.push(`priority: ${card.priority}`);
  }

  // ✅ 从专用字段读取溯源信息（不从fields读取）
  if (card.sourceBlock || card.sourceFile) {
    lines.push('tuanki_source:');
    if (card.sourceBlock) {
      lines.push(`  block_link: "${card.sourceBlock}"`);
    }
    if (card.sourceFile) {
      lines.push(`  file_path: "${card.sourceFile}"`);
    }
  }

  lines.push('---');
  lines.push('');

  // ✅ 核心逻辑：优先使用card.content（权威数据源）
  if (card.content && card.content.trim()) {
    console.log(`[CardMarkdownSerializer] 使用card.content生成Markdown (${card.content.length}字符)`);
    lines.push(card.content.trim());
  } else {
    // 向后兼容：如果没有content，从fields生成
    console.log(`[CardMarkdownSerializer] content为空，从fields生成Markdown`);
    
    const frontContent = card.fields.front || '';
    const backContent = card.fields.back || '';

    // 添加正面内容
    if (frontContent.trim()) {
      lines.push(frontContent.trim());
    }

    // 添加分隔符和背面内容
    if (backContent.trim()) {
      if (frontContent.trim()) {
        lines.push('');
        lines.push('---div---');
        lines.push('');
      }
      lines.push(backContent.trim());
    }

    // 添加其他字段（只包含真正的自定义内容字段）
    const excludeFields = [
      // 内容字段（已在上方输出）
      'front', 'back', 'question', 'answer', 'notes',
      // 元数据字段（已移到YAML或专用字段）
      'uuid', 'sourceBlockLink', 'sourceDocument', 'sourceFile', 
      'sourceUniqueId', 'tuanki_card_id', 'tuanki_uuid',
      'tuanki_deck_id', 'tuanki_template_id', 'obsidian_block_link',
      'source_document', 'source_file', 'source_unique_id',
      // 运行时状态字段（不应持久化）
      'learningStepIndex', 'sessionId', 'uiState', 'tempState',
      // 选择题专用字段（用于Anki同步，不应显示为"其他字段"）
      'options', 'correctAnswers',
      // 语义标记字段（已通过语义标记系统处理，不应重复输出）
      'hint', 'explanation',
      // 选择题选项字段（A-H，由ChoiceCardParser处理）
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'
    ];
    const otherFields = Object.entries(card.fields).filter(([key]) => !excludeFields.includes(key));

    if (otherFields.length > 0) {
      lines.push('## 其他字段');
      otherFields.forEach(([key, value]) => {
        if (value && typeof value === 'string' && value.trim()) {
          lines.push(`### ${key}`);
          lines.push(value);
          lines.push('');
        }
      });
    }
  }

  return lines.join('\n');
}

/**
 * 分离YAML frontmatter和Markdown内容
 */
export function parseFrontmatterAndContent(content: string): {
  frontmatter: Record<string, any>;
  markdownContent: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      markdownContent: content
    };
  }

  const frontmatterText = match[1];
  const markdownContent = match[2];

  try {
    // 简单的YAML解析（支持基本格式和一层嵌套对象）
    const frontmatter: Record<string, any> = {};
    const lines = frontmatterText.split('\n');

    let currentKey = '';
    let currentObject: Record<string, any> | null = null;
    let isArray = false;
    let arrayItems: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // 检测缩进级别
      const indentLevel = line.match(/^(\s*)/)?.[1]?.length || 0;
      const isIndented = indentLevel >= 2;

      if (trimmedLine.startsWith('- ')) {
        // 数组项
        if (isArray) {
          const item = trimmedLine.substring(2).trim();
          // 移除引号
          const cleanItem = item.replace(/^["']|["']$/g, '');
          arrayItems.push(cleanItem);
        }
      } else if (trimmedLine.includes(':')) {
        const colonIndex = trimmedLine.indexOf(':');
        const key = trimmedLine.substring(0, colonIndex).trim();
        const value = trimmedLine.substring(colonIndex + 1).trim();

        if (isIndented) {
          // 🔥 嵌套对象的字段
          if (currentObject) {
            if (value === '') {
              // 嵌套对象内的数组或嵌套对象（暂不支持多层嵌套）
              currentObject[key] = '';
            } else {
              // 移除引号并转换类型
              let cleanValue: any = value.replace(/^["']|["']$/g, '');

              // 尝试转换数字
              if (/^\d+$/.test(cleanValue)) {
                cleanValue = parseInt(cleanValue);
              } else if (/^\d+\.\d+$/.test(cleanValue)) {
                cleanValue = parseFloat(cleanValue);
              }

              currentObject[key] = cleanValue;
            }
          }
        } else {
          // 顶级字段
          // 保存上一个数组
          if (isArray && currentKey) {
            frontmatter[currentKey] = arrayItems;
            arrayItems = [];
            isArray = false;
          }

          // 保存上一个对象
          if (currentObject && currentKey) {
            frontmatter[currentKey] = currentObject;
            currentObject = null;
          }

          if (value === '') {
            // 可能是数组或对象的开始
            currentKey = key;
            isArray = true;
            arrayItems = [];
            currentObject = {};
          } else {
            // 简单键值对
            currentKey = key;
            isArray = false;
            currentObject = null;
            // 移除引号并转换类型
            let cleanValue: any = value.replace(/^["']|["']$/g, '');

            // 尝试转换数字
            if (/^\d+$/.test(cleanValue)) {
              cleanValue = parseInt(cleanValue);
            } else if (/^\d+\.\d+$/.test(cleanValue)) {
              cleanValue = parseFloat(cleanValue);
            }

            frontmatter[key] = cleanValue;
          }
        }
      }
    }

    // 保存最后一个数组或对象
    if (isArray && currentKey && arrayItems.length > 0) {
      frontmatter[currentKey] = arrayItems;
    } else if (currentObject && currentKey && Object.keys(currentObject).length > 0) {
      frontmatter[currentKey] = currentObject;
    }

    return {
      frontmatter,
      markdownContent
    };

  } catch (error) {
    console.error(`[CardMarkdownSerializer] 解析YAML frontmatter失败:`, error);
    return {
      frontmatter: {},
      markdownContent: content
    };
  }
}

/**
 * 解析Markdown内容的各个部分
 * 🔥 支持 ---div--- 分隔符和传统的 ## 标题格式
 */
export function parseMarkdownSections(content: string): {
  front?: string;
  back?: string;
  notes?: string;
  tags?: string[];
  otherFields?: Record<string, string>;
} {
  const sections: any = { otherFields: {} };

  // 🔥 优先检测 ---div--- 分隔符
  if (content.includes('---div---')) {
    const parts = content.split('---div---');
    if (parts.length >= 2) {
      sections.front = parts[0].trim();
      sections.back = parts[1].trim();

      // 处理剩余部分（如果有多个分隔符）
      if (parts.length > 2) {
        sections.back += '\n\n' + parts.slice(2).join('\n---div---\n').trim();
      }

      return sections;
    }
  }

  // 🔥 回退到传统的 ## 标题格式解析
  const lines = content.split('\n');
  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    // 跳过注释行
    if (line.trim().startsWith('<!--')) continue;
    if (line.trim() === '---') continue;

    // 检测标题
    if (line.startsWith('## ')) {
      // 保存上一个部分
      if (currentSection && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        if (content) {
          assignSectionContent(sections, currentSection, content);
        }
      }

      // 开始新部分
      currentSection = line.substring(3).trim();
      currentContent = [];
    } else if (line.startsWith('### ')) {
      // 处理其他字段的子标题
      if (currentSection === '其他字段') {
        // 保存上一个字段
        if (currentContent.length > 0) {
          const fieldName = currentContent[0]?.substring(4).trim();
          const fieldContent = currentContent.slice(1).join('\n').trim();
          if (fieldName && fieldContent) {
            sections.otherFields[fieldName] = fieldContent;
          }
        }

        // 开始新字段
        currentContent = [line];
      } else {
        currentContent.push(line);
      }
    } else if (line.startsWith('#') && !line.startsWith('##')) {
      // 跳过主标题
      continue;
    } else {
      currentContent.push(line);
    }
  }

  // 处理最后一个部分
  if (currentSection && currentContent.length > 0) {
    const content = currentContent.join('\n').trim();
    if (content) {
      assignSectionContent(sections, currentSection, content);
    }
  }

  // 🆕 终极回退：如果没有解析到任何内容，将整个内容作为front字段
  // 这解决了只有front内容的卡片编辑保存失败的问题
  if (!sections.front && !sections.back && Object.keys(sections.otherFields || {}).length === 0) {
    const trimmedContent = content.trim();
    if (trimmedContent) {
      console.log('[CardMarkdownSerializer] 终极回退：将整个内容解析为front字段');
      sections.front = trimmedContent;
    }
  }

  return sections;
}

/**
 * 分配部分内容到对应字段
 */
function assignSectionContent(sections: any, sectionName: string, content: string): void {
  switch (sectionName) {
    case '正面':
      sections.front = content;
      break;
    case '背面':
      sections.back = content;
      break;
    case '笔记':
      sections.notes = content;
      break;
    case '标签':
      // 解析标签
      const tagMatches = content.match(/#\w+/g);
      if (tagMatches) {
        sections.tags = tagMatches.map(tag => tag.substring(1));
      }
      break;
    default:
      // 其他字段已在parseMarkdownSections中处理
      break;
  }
}

/**
 * 从Markdown内容自动检测卡片类型
 */
function detectCardTypeFromContent(content: string): 'basic' | 'cloze' | 'multiple' {
  if (!content || !content.trim()) {
    return 'basic';
  }
  
  // 检测挖空题：包含 == 或 {{c
  const hasObsidianCloze = content.includes('==') && content.includes('==');
  const hasAnkiCloze = /\{\{c\d+::/g.test(content);
  
  if (hasObsidianCloze || hasAnkiCloze) {
    console.log('[CardMarkdownSerializer] 检测到挖空题格式');
    return 'cloze';
  }
  
  // 检测选择题：包含 Q: 和选项格式（A) B) C) 等）
  const hasQuestionMarker = /Q:\s*.+/i.test(content);
  const hasOptions = /^[A-H]\)\s*.+/m.test(content);
  
  if (hasQuestionMarker && hasOptions) {
    console.log('[CardMarkdownSerializer] 检测到选择题格式');
    return 'multiple';
  }
  
  // 默认问答题
  console.log('[CardMarkdownSerializer] 检测为问答题格式');
  return 'basic';
}

/**
 * 根据卡片类型获取对应的解析器
 */
function getParserForDetectedType(cardType: 'basic' | 'cloze' | 'multiple'): any {
  const { QACardParser } = require('../parsers/card-type-parsers/QACardParser');
  const { ChoiceCardParser } = require('../parsers/card-type-parsers/ChoiceCardParser');
  const { ClozeCardParser } = require('../parsers/card-type-parsers/ClozeCardParser');
  
  switch (cardType) {
    case 'cloze':
      return new ClozeCardParser();
    case 'multiple':
      return new ChoiceCardParser();
    default:
      return new QACardParser();
  }
}

/**
 * 将Markdown内容解析为卡片数据（遵循卡片数据结构规范 v1.0）
 * 
 * ✅ 核心原则：
 * 1. 将Markdown内容保存到card.content（权威数据源）
 * 2. 使用标准化解析器从content生成fields（派生数据）
 * 3. 溯源信息保存到专用字段（不混入fields）
 * 4. 自动检测题型并更新card.type
 */
export function markdownToCard(content: string, originalCard: Card): Card {
  const updatedCard: Card = { ...originalCard };

  try {
    // 分离YAML frontmatter和Markdown内容
    const { frontmatter, markdownContent } = parseFrontmatterAndContent(content);

    // ✅ 步骤1：将Markdown内容保存到card.content（权威数据源）
    updatedCard.content = markdownContent.trim();
    console.log(`[CardMarkdownSerializer] 更新content字段: ${markdownContent.length}字符`);
    
    // ✅ 步骤1.5：自动检测题型并更新card.type
    const detectedType = detectCardTypeFromContent(markdownContent);
    const { CardType } = require('../data/types');
    
    // 将检测结果映射到CardType
    if (detectedType === 'cloze' && updatedCard.type !== CardType.Cloze) {
      console.log(`[CardMarkdownSerializer] 题型变更: ${updatedCard.type} → Cloze`);
      updatedCard.type = CardType.Cloze;
    } else if (detectedType === 'multiple' && updatedCard.type !== CardType.Multiple) {
      console.log(`[CardMarkdownSerializer] 题型变更: ${updatedCard.type} → Multiple`);
      updatedCard.type = CardType.Multiple;
    } else if (detectedType === 'basic' && updatedCard.type !== CardType.Basic) {
      console.log(`[CardMarkdownSerializer] 题型变更: ${updatedCard.type} → Basic`);
      updatedCard.type = CardType.Basic;
    }

    // 从frontmatter更新元数据
    if (frontmatter.tags && Array.isArray(frontmatter.tags)) {
      updatedCard.tags = frontmatter.tags;
    }

    if (frontmatter.priority) {
      updatedCard.priority = frontmatter.priority;
    }

    // 🔥 从frontmatter解析FSRS数据
    if (frontmatter.tuanki_fsrs && typeof frontmatter.tuanki_fsrs === 'object') {
      const fsrsData = frontmatter.tuanki_fsrs;
      if (fsrsData.due) updatedCard.fsrs.due = fsrsData.due;
      if (fsrsData.stability !== undefined) updatedCard.fsrs.stability = fsrsData.stability;
      if (fsrsData.difficulty !== undefined) updatedCard.fsrs.difficulty = fsrsData.difficulty;
      if (fsrsData.state !== undefined) updatedCard.fsrs.state = fsrsData.state;
      if (fsrsData.reps !== undefined) updatedCard.fsrs.reps = fsrsData.reps;
      if (fsrsData.lapses !== undefined) updatedCard.fsrs.lapses = fsrsData.lapses;
      if (fsrsData.elapsed_days !== undefined) updatedCard.fsrs.elapsed_days = fsrsData.elapsed_days;
      if (fsrsData.scheduled_days !== undefined) updatedCard.fsrs.scheduled_days = fsrsData.scheduled_days;
      if (fsrsData.last_review) updatedCard.fsrs.last_review = fsrsData.last_review;
    }

    // 🔥 从frontmatter解析来源追踪数据（保存到专用字段）
    if (frontmatter.tuanki_source && typeof frontmatter.tuanki_source === 'object') {
      const sourceData = frontmatter.tuanki_source;
      if (sourceData.block_link) {
        updatedCard.sourceBlock = sourceData.block_link;  // ✅ 专用字段
      }
      if (sourceData.file_path) {
        updatedCard.sourceFile = sourceData.file_path;    // ✅ 专用字段
      }
      // document和unique_id是旧版字段，不再使用
    }

    // ✅ 步骤2：使用对应题型的解析器从content生成fields
    const parser = getParserForDetectedType(detectedType);
    const parseResult = parser.parseMarkdownToFields(markdownContent, updatedCard.type);
    
    if (parseResult.success && parseResult.fields) {
      // 解析成功，使用解析器生成的fields
      updatedCard.fields = parseResult.fields;
      console.log(`[CardMarkdownSerializer] 使用${detectedType}解析器生成fields:`, Object.keys(parseResult.fields));
    } else {
      // 解析失败，使用降级策略
      console.warn(`[CardMarkdownSerializer] 解析失败，使用降级策略`);
      const sections = parseMarkdownSections(markdownContent);
      
      // 重置fields（确保没有旧数据残留）
      updatedCard.fields = {};
      
      // 更新标准字段
      if (sections.front) {
        updatedCard.fields.front = sections.front;
      }
      
      if (sections.back) {
        updatedCard.fields.back = sections.back;
      }
    }

    // 注意：sections变量只在降级策略中存在，这里不需要处理

    // 清理运行时状态字段（向后兼容：如果旧数据包含这些字段，删除它们）
    const runtimeFields = ['learningStepIndex', 'sessionId', 'uiState', 'tempState', 'notes'];
    runtimeFields.forEach(field => {
      if (updatedCard.fields[field] !== undefined) {
        console.warn(`[CardMarkdownSerializer] 清理运行时字段: ${field}`);
        delete updatedCard.fields[field];
      }
    });

    // 更新修改时间
    updatedCard.modified = new Date().toISOString();

    console.log(`[CardMarkdownSerializer] 卡片数据解析完成（规范化）:`, {
      cardId: updatedCard.id,
      contentLength: updatedCard.content?.length || 0,
      fieldsCount: Object.keys(updatedCard.fields).length,
      tagsCount: updatedCard.tags?.length || 0
    });

    // 🆕 自动提取Markdown中的#标签并合并到YAML标签中
    const extractedTags = TagExtractor.extractTagsExcludingCode(markdownContent);
    if (extractedTags.length > 0) {
      updatedCard.tags = TagExtractor.mergeTags(markdownContent, updatedCard.tags || [], 'smart');
      console.log(`[CardMarkdownSerializer] 自动提取标签:`, extractedTags);
    }

    return updatedCard;

  } catch (error) {
    console.error(`[CardMarkdownSerializer] 解析Markdown内容失败:`, error);
    // 返回原始卡片，避免数据丢失
    return originalCard;
  }
}
