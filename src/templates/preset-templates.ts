/**
 * 预设模板系统
 * 提供丰富的预设模板，涵盖常用学科和学习场景
 */

import type { FieldTemplate, FieldTemplateField } from "../data/template-types";
import { TemplateCategory } from "../data/template-types";
import { UnifiedCardType } from "../types/unified-card-types";
import { generateId } from "../utils/helpers";

// 预设模板接口
export interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  template: FieldTemplate;
  usageExample?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

/**
 * 预设模板管理器
 */
export class PresetTemplateManager {
  private templates: Map<string, PresetTemplate> = new Map();

  constructor() {
    this.initializePresetTemplates();
  }

  /**
   * 初始化所有预设模板
   */
  private initializePresetTemplates(): void {
    // 语言学习模板
    this.addLanguageTemplates();
    
    // 科学学科模板
    this.addScienceTemplates();
    
    // 数学模板
    this.addMathTemplates();
    
    // 编程模板
    this.addProgrammingTemplates();
    
    // 通用模板
    this.addGeneralTemplates();
  }

  /**
   * 添加语言学习模板
   */
  private addLanguageTemplates(): void {
    // 英语单词卡片
    this.addTemplate({
      id: 'english-vocabulary',
      name: '英语词汇卡片',
      description: '适用于英语单词学习，包含发音、词性、例句等',
      category: TemplateCategory.LANGUAGE,
      tags: ['英语', '词汇', '单词'],
      difficulty: 'beginner',
      usageExample: '学习新的英语单词时使用',
      template: {
        id: generateId(),
        name: '英语词汇卡片',
        description: '英语单词学习模板',
        isOfficial: true,
        version: '1.0.0',
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cardType: UnifiedCardType.BASIC_QA,
        renderingHints: {
          questionPosition: 'top',
          answerReveal: 'click',
          interactionMode: 'click',
          showProgress: false,
          enableAnimations: true,
          keyboardNavigation: true,
          autoFocus: false
        },
        fields: [
          {
            id: generateId(),
            type: 'field',
            name: '单词',
            key: 'word',
            side: 'front'
          },
          {
            id: generateId(),
            type: 'field',
            name: '音标',
            key: 'phonetic',
            side: 'front'
          },
          {
            id: generateId(),
            type: 'hr',
          } as any,
          {
            id: generateId(),
            type: 'field',
            name: '词性',
            key: 'partOfSpeech',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '中文释义',
            key: 'meaning',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '例句',
            key: 'example',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '例句翻译',
            key: 'exampleTranslation',
            side: 'back'
          }
        ],
        frontTemplate: '{{word}}<br><small>{{phonetic}}</small>',
        backTemplate: '<strong>{{partOfSpeech}}</strong><br>{{meaning}}<br><hr><em>{{example}}</em><br><small>{{exampleTranslation}}</small>'
      }
    });

    // 中文成语卡片
    this.addTemplate({
      id: 'chinese-idiom',
      name: '中文成语卡片',
      description: '适用于中文成语学习，包含释义、出处、用法等',
      category: TemplateCategory.LANGUAGE,
      tags: ['中文', '成语', '语文'],
      difficulty: 'intermediate',
      template: {
        id: generateId(),
        name: '中文成语卡片',
        description: '中文成语学习模板',
        isOfficial: true,
        version: '1.0.0',
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          {
            id: generateId(),
            type: 'field',
            name: '成语',
            key: 'idiom',
            side: 'front'
          },
          {
            id: generateId(),
            type: 'hr',
          } as any,
          {
            id: generateId(),
            type: 'field',
            name: '拼音',
            key: 'pinyin',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '释义',
            key: 'meaning',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '出处',
            key: 'source',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '例句',
            key: 'example',
            side: 'back'
          }
        ],
        frontTemplate: '{{idiom}}',
        backTemplate: '<strong>{{pinyin}}</strong><br>{{meaning}}<br><small>出处：{{source}}</small><br><hr><em>{{example}}</em>'
      }
    });
  }

  /**
   * 添加科学学科模板
   */
  private addScienceTemplates(): void {
    // 化学元素卡片
    this.addTemplate({
      id: 'chemistry-element',
      name: '化学元素卡片',
      description: '适用于化学元素学习，包含原子序数、性质等',
      category: TemplateCategory.SCIENCE,
      tags: ['化学', '元素', '理科'],
      difficulty: 'intermediate',
      template: {
        id: generateId(),
        name: '化学元素卡片',
        description: '化学元素学习模板',
        isOfficial: true,
        version: '1.0.0',
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cardType: UnifiedCardType.BASIC_QA,
        renderingHints: {
          questionPosition: 'top',
          answerReveal: 'click',
          interactionMode: 'click',
          showProgress: false,
          enableAnimations: true,
          keyboardNavigation: true,
          autoFocus: false
        },
        fields: [
          {
            id: generateId(),
            type: 'field',
            name: '元素符号',
            key: 'symbol',
            side: 'front'
          },
          {
            id: generateId(),
            type: 'hr',
          } as any,
          {
            id: generateId(),
            type: 'field',
            name: '元素名称',
            key: 'name',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '原子序数',
            key: 'atomicNumber',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '原子量',
            key: 'atomicMass',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '电子构型',
            key: 'electronConfig',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '特性',
            key: 'properties',
            side: 'back'
          }
        ],
        frontTemplate: '<div style="font-size: 2em; font-weight: bold;">{{symbol}}</div>',
        backTemplate: '<strong>{{name}}</strong><br>原子序数：{{atomicNumber}}<br>原子量：{{atomicMass}}<br>电子构型：{{electronConfig}}<br><hr>{{properties}}'
      }
    });

    // 生物概念卡片
    this.addTemplate({
      id: 'biology-concept',
      name: '生物概念卡片',
      description: '适用于生物学概念学习，包含定义、分类、功能等',
      category: TemplateCategory.SCIENCE,
      tags: ['生物', '概念', '理科'],
      difficulty: 'intermediate',
      template: {
        id: generateId(),
        name: '生物概念卡片',
        description: '生物学概念学习模板',
        isOfficial: true,
        version: '1.0.0',
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          {
            id: generateId(),
            type: 'field',
            name: '概念名称',
            key: 'concept',
            side: 'front'
          },
          {
            id: generateId(),
            type: 'hr',
          } as any,
          {
            id: generateId(),
            type: 'field',
            name: '定义',
            key: 'definition',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '分类',
            key: 'classification',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '功能',
            key: 'function',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '实例',
            key: 'examples',
            side: 'back'
          }
        ],
        frontTemplate: '{{concept}}',
        backTemplate: '<strong>定义：</strong>{{definition}}<br><strong>分类：</strong>{{classification}}<br><strong>功能：</strong>{{function}}<br><hr><strong>实例：</strong>{{examples}}'
      }
    });
  }

  /**
   * 添加数学模板
   */
  private addMathTemplates(): void {
    // 数学公式卡片
    this.addTemplate({
      id: 'math-formula',
      name: '数学公式卡片',
      description: '适用于数学公式学习，支持LaTeX格式',
      category: TemplateCategory.MATH,
      tags: ['数学', '公式', '理科'],
      difficulty: 'advanced',
      template: {
        id: generateId(),
        name: '数学公式卡片',
        description: '数学公式学习模板',
        isOfficial: true,
        version: '1.0.0',
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          {
            id: generateId(),
            type: 'field',
            name: '公式名称',
            key: 'formulaName',
            side: 'front'
          },
          {
            id: generateId(),
            type: 'field',
            name: '条件',
            key: 'conditions',
            side: 'front'
          },
          {
            id: generateId(),
            type: 'hr',
          } as any,
          {
            id: generateId(),
            type: 'field',
            name: '公式',
            key: 'formula',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '变量说明',
            key: 'variables',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '应用场景',
            key: 'applications',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '示例',
            key: 'example',
            side: 'back'
          }
        ],
        frontTemplate: '<strong>{{formulaName}}</strong><br><small>{{conditions}}</small>',
        backTemplate: '$${{formula}}$$<br><strong>变量说明：</strong>{{variables}}<br><strong>应用：</strong>{{applications}}<br><hr><strong>示例：</strong>{{example}}'
      }
    });
  }

  /**
   * 添加编程模板
   */
  private addProgrammingTemplates(): void {
    // 编程概念卡片
    this.addTemplate({
      id: 'programming-concept',
      name: '编程概念卡片',
      description: '适用于编程概念和算法学习',
      category: TemplateCategory.PROGRAMMING,
      tags: ['编程', '算法', '计算机'],
      difficulty: 'intermediate',
      template: {
        id: generateId(),
        name: '编程概念卡片',
        description: '编程概念学习模板',
        isOfficial: true,
        version: '1.0.0',
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          {
            id: generateId(),
            type: 'field',
            name: '概念名称',
            key: 'concept',
            side: 'front'
          },
          {
            id: generateId(),
            type: 'field',
            name: '编程语言',
            key: 'language',
            side: 'front'
          },
          {
            id: generateId(),
            type: 'hr',
          } as any,
          {
            id: generateId(),
            type: 'field',
            name: '定义',
            key: 'definition',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '语法',
            key: 'syntax',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '代码示例',
            key: 'codeExample',
            side: 'back'
          },
          {
            id: generateId(),
            type: 'field',
            name: '注意事项',
            key: 'notes',
            side: 'back'
          }
        ],
        frontTemplate: '<strong>{{concept}}</strong><br><small>{{language}}</small>',
        backTemplate: '{{definition}}<br><strong>语法：</strong><code>{{syntax}}</code><br><hr><pre><code>{{codeExample}}</code></pre><br><small>{{notes}}</small>'
      }
    });
  }

  /**
   * 添加通用模板
   */
  private addGeneralTemplates(): void {
    // 基础问答卡片
    this.addTemplate({
      id: 'basic-qa',
      name: '基础问答卡片',
      description: '最简单的问答形式，适用于各种学科',
      category: TemplateCategory.GENERAL,
      tags: ['通用', '问答', '基础'],
      difficulty: 'beginner',
      template: {
        id: generateId(),
        name: '基础问答卡片',
        description: '基础问答学习模板',
        isOfficial: true,
        version: '1.0.0',
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cardType: UnifiedCardType.BASIC_QA,
        renderingHints: {
          questionPosition: 'top',
          answerReveal: 'click',
          interactionMode: 'click',
          showProgress: false,
          enableAnimations: true,
          keyboardNavigation: true,
          autoFocus: false
        },
        fields: [
          {
            id: generateId(),
            type: 'field',
            name: '问题',
            key: 'question',
            side: 'front'
          },
          {
            id: generateId(),
            type: 'hr',
          } as any,
          {
            id: generateId(),
            type: 'field',
            name: '答案',
            key: 'answer',
            side: 'back'
          }
        ],
        frontTemplate: '{{question}}',
        backTemplate: '{{answer}}'
      }
    });

    // 填空卡片
    this.addTemplate({
      id: 'cloze-deletion',
      name: '填空卡片',
      description: '挖空填词形式，适用于记忆关键信息',
      category: TemplateCategory.GENERAL,
      tags: ['通用', '填空', '记忆'],
      difficulty: 'beginner',
      template: {
        id: generateId(),
        name: '填空卡片',
        description: '填空学习模板',
        isOfficial: true,
        version: '1.0.0',
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cardType: UnifiedCardType.CLOZE_DELETION,
        renderingHints: {
          questionPosition: 'inline',
          answerReveal: 'click',
          interactionMode: 'click',
          showProgress: true,
          enableAnimations: true,
          keyboardNavigation: true,
          autoFocus: false
        },
        fields: [
          {
            id: generateId(),
            type: 'field',
            name: '文本',
            key: 'text',
            side: 'both'
          },
          {
            id: generateId(),
            type: 'field',
            name: '提示',
            key: 'hint',
            side: 'front'
          }
        ],
        frontTemplate: '{{text}}<br><small>{{hint}}</small>',
        backTemplate: '{{text}}'
      }
    });
  }

  /**
   * 添加模板
   */
  addTemplate(template: PresetTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * 获取所有模板
   */
  getAllTemplates(): PresetTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 根据分类获取模板
   */
  getTemplatesByCategory(category: TemplateCategory): PresetTemplate[] {
    return this.getAllTemplates().filter(t => t.category === category);
  }

  /**
   * 根据标签搜索模板
   */
  searchTemplatesByTag(tag: string): PresetTemplate[] {
    return this.getAllTemplates().filter(t => 
      t.tags.some(tTag => tTag.toLowerCase().includes(tag.toLowerCase()))
    );
  }

  /**
   * 根据难度获取模板
   */
  getTemplatesByDifficulty(difficulty: 'beginner' | 'intermediate' | 'advanced'): PresetTemplate[] {
    return this.getAllTemplates().filter(t => t.difficulty === difficulty);
  }

  /**
   * 获取单个模板
   */
  getTemplate(id: string): PresetTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * 搜索模板
   */
  searchTemplates(query: string): PresetTemplate[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllTemplates().filter(t => 
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }
}

// 导出默认预设模板管理器实例
export const defaultPresetTemplateManager = new PresetTemplateManager();
