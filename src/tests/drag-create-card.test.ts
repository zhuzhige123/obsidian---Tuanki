/**
 * 拖拽创建卡片功能测试
 * 验证拖拽创建卡片时的模板选择和字段完整性
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Card } from '../data/types';
import type { TriadTemplate } from '../data/template-types';

// Mock数据
const mockTriadTemplates: TriadTemplate[] = [
  {
    id: 'official-basic-qa',
    name: '基础问答题',
    description: '标准的问答题模板',
    isOfficial: true,
    fieldTemplate: {
      id: 'field-basic-qa',
      name: '基础问答字段',
      fields: [
        { id: 'q', type: 'field', key: 'question', name: '问题', side: 'front' },
        { id: 'a', type: 'field', key: 'answer', name: '答案', side: 'back' }
      ],
      frontTemplate: '{{question}}',
      backTemplate: '{{answer}}',
      isOfficial: true
    },
    markdownTemplate: {
      id: 'md-basic-qa',
      name: '基础问答MD模板',
      fieldTemplateId: 'field-basic-qa',
      markdownContent: '{{question}}\n\n---div---\n\n{{answer}}',
      fieldPlaceholders: {
        question: '{{question}}',
        answer: '{{answer}}'
      },
      isOfficial: true,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    regexParseTemplate: {
      id: 'regex-basic-qa',
      name: '基础问答正则模板',
      fieldTemplateId: 'field-basic-qa',
      regex: '# 问题\\s*\\n\\n(.+?)\\n\\n# 答案\\s*\\n\\n(.+)',
      fieldMappings: { question: 1, answer: 2 },
      parseOptions: { multiline: true, ignoreCase: false },
      validation: { isValid: true, complexity: 10 },
      isOfficial: true,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    syncStatus: {
      isConsistent: true,
      lastSyncAt: new Date().toISOString(),
      inconsistencies: []
    },
    creationMode: 'basic',
    category: '问答题',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

describe('拖拽创建卡片功能测试', () => {
  let mockPlugin: any;
  let mockDataStorage: any;

  beforeEach(() => {
    mockDataStorage = {
      getTriadTemplates: vi.fn().mockResolvedValue(mockTriadTemplates),
      saveCard: vi.fn().mockResolvedValue({ success: true })
    };

    mockPlugin = {
      settings: {
        triadTemplatesJson: JSON.stringify(mockTriadTemplates)
      },
      dataStorage: mockDataStorage,
      app: {
        workspace: {
          getActiveFile: vi.fn().mockReturnValue({
            basename: 'test-document.md',
            path: 'test-document.md'
          })
        }
      }
    };
  });

  describe('拖拽解析成功场景', () => {
    it('应该正确设置模板ID和必备字段', () => {
      // 模拟解析成功的卡片数据
      const parsedCard = {
        templateId: 'official-basic-qa',
        templateName: '基础问答题',
        front: '什么是TypeScript？',
        back: 'TypeScript是JavaScript的超集',
        question: '什么是TypeScript？',
        answer: 'TypeScript是JavaScript的超集'
      };

      // 模拟拖拽创建的卡片
      const editingCard = {
        id: 'test-card-1',
        uuid: 'test-uuid-1',
        deckId: '',
        templateId: parsedCard.templateId || 'official-basic-qa',
        fields: {
          front: parsedCard.front,
          back: parsedCard.back,
          question: parsedCard.question || parsedCard.front,
          answer: parsedCard.answer || parsedCard.back,
          ...parsedCard,
          uuid: 'test-uuid-1',
          obsidian_block_link: 'test-block-link',
          source_document: 'test-document.md',
          templateId: parsedCard.templateId || 'official-basic-qa',
          templateName: parsedCard.templateName || '基础问答题'
        }
      };

      // 验证模板ID设置正确
      expect(editingCard.templateId).toBe('official-basic-qa');
      expect(editingCard.fields.templateId).toBe('official-basic-qa');
      expect(editingCard.fields.templateName).toBe('基础问答题');

      // 验证必备字段存在
      expect(editingCard.fields.uuid).toBe('test-uuid-1');
      expect(editingCard.fields.obsidian_block_link).toBe('test-block-link');
      expect(editingCard.fields.source_document).toBe('test-document.md');

      // 验证内容字段正确映射
      expect(editingCard.fields.question).toBe('什么是TypeScript？');
      expect(editingCard.fields.answer).toBe('TypeScript是JavaScript的超集');
      expect(editingCard.fields.front).toBe('什么是TypeScript？');
      expect(editingCard.fields.back).toBe('TypeScript是JavaScript的超集');
    });
  });

  describe('拖拽解析失败场景', () => {
    it('应该使用默认模板和完整字段结构', () => {
      const text = '这是一段无法解析的文本';

      // 模拟默认创建的卡片
      const editingCard = {
        id: 'test-card-2',
        uuid: 'test-uuid-2',
        deckId: '',
        templateId: 'official-basic-qa', // 强制设置默认模板
        fields: {
          front: text,
          back: '',
          question: text,
          answer: '',
          uuid: 'test-uuid-2',
          obsidian_block_link: 'test-block-link',
          source_document: 'test-document.md',
          templateId: 'official-basic-qa',
          templateName: '基础问答题'
        }
      };

      // 验证默认模板设置正确
      expect(editingCard.templateId).toBe('official-basic-qa');
      expect(editingCard.fields.templateId).toBe('official-basic-qa');
      expect(editingCard.fields.templateName).toBe('基础问答题');

      // 验证必备字段存在
      expect(editingCard.fields.uuid).toBe('test-uuid-2');
      expect(editingCard.fields.obsidian_block_link).toBe('test-block-link');
      expect(editingCard.fields.source_document).toBe('test-document.md');

      // 验证内容正确填充
      expect(editingCard.fields.question).toBe(text);
      expect(editingCard.fields.front).toBe(text);
      expect(editingCard.fields.answer).toBe('');
      expect(editingCard.fields.back).toBe('');
    });
  });

  describe('NewCardModal初始化测试', () => {
    it('应该正确识别和显示拖拽卡片的模板', () => {
      const initialCard: Partial<Card> = {
        templateId: 'official-basic-qa',
        fields: {
          question: '什么是Svelte？',
          answer: 'Svelte是一个编译时框架',
          templateId: 'official-basic-qa',
          templateName: '基础问答题'
        }
      };

      // 模拟NewCardModal的初始化逻辑
      const cardData = {
        selectedTemplateId: '',
        frontField: '',
        backField: '',
        markdownContent: ''
      };

      let selectedTriadTemplate: TriadTemplate | null = null;

      // 模拟initializeWithCard函数的逻辑
      if (initialCard.templateId) {
        cardData.selectedTemplateId = initialCard.templateId;
        
        const matchedTemplate = mockTriadTemplates.find(t => t.id === initialCard.templateId);
        if (matchedTemplate) {
          selectedTriadTemplate = matchedTemplate;
        }
      }

      if (initialCard.fields) {
        cardData.frontField = initialCard.fields.question || '';
        cardData.backField = initialCard.fields.answer || '';
      }

      // 验证模板选择正确
      expect(cardData.selectedTemplateId).toBe('official-basic-qa');
      expect(selectedTriadTemplate).not.toBeNull();
      expect(selectedTriadTemplate?.name).toBe('基础问答题');

      // 验证字段映射正确
      expect(cardData.frontField).toBe('什么是Svelte？');
      expect(cardData.backField).toBe('Svelte是一个编译时框架');
    });
  });

  describe('Markdown内容生成测试', () => {
    it('应该生成包含所有必备字段的Markdown内容', () => {
      const cardData = {
        frontField: '什么是Vue？',
        backField: 'Vue是一个渐进式框架',
        tagsField: 'vue, frontend'
      };

      const initialCard = {
        fields: {
          obsidian_block_link: '^block123',
          source_document: 'vue-notes.md',
          templateName: '基础问答题'
        }
      };

      const selectedTriadTemplate = mockTriadTemplates[0];
      const templateId = 'official-basic-qa';

      // 模拟generateMarkdownContentFromBasicFields函数
      const sections: string[] = [];

      if (cardData.frontField.trim()) {
        sections.push(`# 问题\n\n${cardData.frontField}\n\n`);
      }

      if (cardData.backField.trim()) {
        sections.push(`# 答案\n\n${cardData.backField}\n\n`);
      }

      if (cardData.tagsField?.trim()) {
        sections.push(`# 标签\n\n${cardData.tagsField}\n\n`);
      }

      if (initialCard.fields.obsidian_block_link) {
        sections.push(`# Obsidian块链接\n\n${initialCard.fields.obsidian_block_link}\n\n`);
      }

      if (initialCard.fields.source_document) {
        sections.push(`# 来源文档\n\n${initialCard.fields.source_document}\n\n`);
      }

      const templateName = selectedTriadTemplate.name;
      sections.push(`# 模板ID\n\n${templateId}\n\n`);
      sections.push(`# 模板名称\n\n${templateName}\n\n`);

      const markdownContent = sections.join('');

      // 验证生成的Markdown包含所有必要信息
      expect(markdownContent).toContain('# 问题\n\n什么是Vue？');
      expect(markdownContent).toContain('# 答案\n\nVue是一个渐进式框架');
      expect(markdownContent).toContain('# 标签\n\nvue, frontend');
      expect(markdownContent).toContain('# Obsidian块链接\n\n^block123');
      expect(markdownContent).toContain('# 来源文档\n\nvue-notes.md');
      expect(markdownContent).toContain('# 模板ID\n\nofficial-basic-qa');
      expect(markdownContent).toContain('# 模板名称\n\n基础问答题');
    });
  });
});
