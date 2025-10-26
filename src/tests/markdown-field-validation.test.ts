/**
 * Markdown字段验证测试
 * 验证新的!字段名格式和必备字段检查
 */

import { describe, it, expect } from 'vitest';
import { MarkdownFieldValidator } from '../validation/markdown-field-validator';
import type { TriadTemplate } from '../data/template-types';

// Mock模板数据
const mockBasicQATemplate: TriadTemplate = {
  id: 'official-basic-qa',
  name: '基础问答题',
  description: '标准的问答题模板',
  isOfficial: true,
  fieldTemplate: {
    id: 'field-basic-qa',
    name: '基础问答字段',
    fields: [
      { 
        id: 'q', 
        type: 'field', 
        key: 'question', 
        name: '问题', 
        side: 'front',
        fieldType: 'textarea',
        required: true,
        validation: { required: true }
      },
      { 
        id: 'a', 
        type: 'field', 
        key: 'answer', 
        name: '答案', 
        side: 'back',
        fieldType: 'textarea',
        required: true,
        validation: { required: true }
      },
      { 
        id: 't', 
        type: 'field', 
        key: 'tags', 
        name: '标签', 
        side: 'back',
        fieldType: 'text',
        required: false,
        validation: {}
      }
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
    regex: '^([^\\n]+)\\n\\n---div---\\n\\n([\\s\\S]*?)(?:\\n\\n#|$)',
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
};

describe('Markdown字段验证测试', () => {
  let validator: MarkdownFieldValidator;

  beforeEach(() => {
    validator = new MarkdownFieldValidator();
  });

  describe('完整字段验证', () => {
    it('应该验证包含所有必备字段的Markdown内容', () => {
      const validMarkdown = `!问题

什么是TypeScript？

!答案

TypeScript是JavaScript的超集，添加了静态类型检查功能。

!标签

typescript, programming

!TemplateId

official-basic-qa

!TemplateName

基础问答题`;

      const result = validator.validateMarkdownContent(validMarkdown, mockBasicQATemplate);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.foundFields).toContain('question');
      expect(result.foundFields).toContain('answer');
      expect(result.foundFields).toContain('templateId');
      expect(result.foundFields).toContain('templateName');
    });

    it('应该检测缺失的必备字段', () => {
      const incompleteMarkdown = `!问题

什么是Vue？

!标签

vue, frontend`;

      const result = validator.validateMarkdownContent(incompleteMarkdown, mockBasicQATemplate);

      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('answer');
      expect(result.missingFields).toContain('templateId');
      expect(result.missingFields).toContain('templateName');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it.skip('应该检测空内容字段', () => {
      const emptyFieldMarkdown = `!问题

什么是React？

!答案

!TemplateId

official-basic-qa

!TemplateName

基础问答题`;

      const result = validator.validateMarkdownContent(emptyFieldMarkdown, mockBasicQATemplate);

      expect(result.isValid).toBe(true); // 结构完整
      expect(result.warnings.length).toBeGreaterThan(0); // 但有警告
      expect(result.warnings.some(w => w.fieldKey === 'answer')).toBe(true);
    });
  });

  describe('字段名格式验证', () => {
    it('应该检测错误的字段名格式', () => {
      const wrongFormatMarkdown = `# 问题

什么是Angular？

# 答案

Angular是一个TypeScript框架

# 标签

angular, frontend`;

      const formatResult = validator.validateFieldNameFormat(wrongFormatMarkdown);

      expect(formatResult.isValid).toBe(false);
      expect(formatResult.invalidFields).toContain('问题');
      expect(formatResult.invalidFields).toContain('答案');
      expect(formatResult.invalidFields).toContain('标签');
      expect(formatResult.suggestions).toContain('将"问题"改为"!问题"');
    });

    it('应该验证正确的字段名格式', () => {
      const correctFormatMarkdown = `!问题

什么是Svelte？

!答案

Svelte是一个编译时框架

!标签

svelte, frontend`;

      const formatResult = validator.validateFieldNameFormat(correctFormatMarkdown);

      expect(formatResult.isValid).toBe(true);
      expect(formatResult.invalidFields).toHaveLength(0);
      expect(formatResult.suggestions).toHaveLength(0);
    });
  });

  describe('自动补全功能', () => {
    it('应该自动补全缺失的字段', () => {
      const incompleteMarkdown = `!问题

什么是Node.js？

!答案

Node.js是一个JavaScript运行时环境`;

      const defaultValues = {
        templateId: 'official-basic-qa',
        templateName: '基础问答题',
        tags: ''
      };

      const completedMarkdown = validator.autoCompleteFields(
        incompleteMarkdown, 
        mockBasicQATemplate, 
        defaultValues
      );

      expect(completedMarkdown).toContain('!TemplateId');
      expect(completedMarkdown).toContain('official-basic-qa');
      expect(completedMarkdown).toContain('!TemplateName');
      expect(completedMarkdown).toContain('基础问答题');

      // 验证补全后的内容
      const validationResult = validator.validateMarkdownContent(completedMarkdown, mockBasicQATemplate);
      expect(validationResult.isValid).toBe(true);
    });
  });

  describe('错误消息生成', () => {
    it('应该生成清晰的验证错误消息', () => {
      const incompleteMarkdown = `!问题

什么是Webpack？`;

      const result = validator.validateMarkdownContent(incompleteMarkdown, mockBasicQATemplate);
      const message = validator.generateValidationMessage(result);

      expect(message).toContain('缺少必备字段');
      expect(message).toContain('!答案');
      expect(message).toContain('!TemplateId');
      expect(message).toContain('!TemplateName');
    });

    it('应该为有效内容生成成功消息', () => {
      const validMarkdown = `!问题

什么是Vite？

!答案

Vite是一个现代化的前端构建工具

!TemplateId

official-basic-qa

!TemplateName

基础问答题`;

      const result = validator.validateMarkdownContent(validMarkdown, mockBasicQATemplate);
      const message = validator.generateValidationMessage(result);

      expect(message).toBe('所有必备字段验证通过');
    });
  });

  describe('边界情况处理', () => {
    it('应该处理空内容', () => {
      const result = validator.validateMarkdownContent('', mockBasicQATemplate);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Markdown内容不能为空');
    });

    it('应该处理只有空白字符的内容', () => {
      const result = validator.validateMarkdownContent('   \n\n   ', mockBasicQATemplate);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Markdown内容不能为空');
    });

    it('应该处理没有字段模板的情况', () => {
      const templateWithoutFields = {
        ...mockBasicQATemplate,
        fieldTemplate: {
          ...mockBasicQATemplate.fieldTemplate,
          fields: []
        }
      };

      const result = validator.validateMarkdownContent('!问题\n\n测试', templateWithoutFields);

      // 只检查系统必备字段
      expect(result.missingFields).toContain('templateId');
      expect(result.missingFields).toContain('templateName');
    });
  });
});
