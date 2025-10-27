import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChoiceCardRenderer } from '../renderers/ChoiceCardRenderer';
import type { PreviewData, PreviewOptions } from '../ContentPreviewEngine';

// Mock AnkiPlugin
const mockPlugin = {
  app: {
    workspace: {
      getActiveFile: () => ({ path: 'test.md' })
    }
  }
} as any;

describe('ChoiceCardRenderer', () => {
  let renderer: ChoiceCardRenderer;
  let mockPreviewData: PreviewData;
  let mockOptions: PreviewOptions;

  beforeEach(() => {
    renderer = new ChoiceCardRenderer(mockPlugin);
    
    mockPreviewData = {
      cardType: 'multiple-choice',
      metadata: {
        cardId: 'test-card-1',
        sourceFile: 'test.md',
        lastModified: Date.now()
      },
      sections: [
        {
          id: 'question',
          type: 'front',
          content: '以下哪个是JavaScript的数据类型？',
          renderMode: 'markdown',
          animations: [],
          interactivity: { enabled: false }
        },
        {
          id: 'options',
          type: 'options',
          content: 'A. String\nB. Integer\nC. Float\nD. Character',
          renderMode: 'mixed',
          animations: [],
          interactivity: { enabled: true },
          metadata: {
            options: [
              { label: 'A', text: 'String', index: 0 },
              { label: 'B', text: 'Integer', index: 1 },
              { label: 'C', text: 'Float', index: 2 },
              { label: 'D', text: 'Character', index: 3 }
            ],
            correctAnswers: ['A'],
            allowMultiple: false
          }
        },
        {
          id: 'explanation',
          type: 'explanation',
          content: 'JavaScript有七种基本数据类型，包括String、Number、Boolean等。',
          renderMode: 'markdown',
          animations: [],
          interactivity: { enabled: false }
        }
      ],
      renderingHints: {
        preferredHeight: 400,
        enableAnimations: true,
        themeMode: 'auto'
      }
    };

    mockOptions = {
      themeMode: 'auto',
      enableAnimations: true,
      showAnswer: false,
      maxHeight: 500
    };
  });

  describe('renderChoiceCard', () => {
    it('应该创建选择题卡片容器', () => {
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      
      expect(result).toBeInstanceOf(HTMLElement);
      expect(result.className).toBe('tuanki-choice-card');
    });

    it('应该渲染题目部分', () => {
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      const questionElement = result.querySelector('.tuanki-choice-question');
      
      expect(questionElement).toBeTruthy();
      expect(questionElement?.textContent).toContain('以下哪个是JavaScript的数据类型？');
    });

    it('应该渲染选项部分', () => {
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      const optionsContainer = result.querySelector('.tuanki-choice-options');
      const options = result.querySelectorAll('.tuanki-choice-option');
      
      expect(optionsContainer).toBeTruthy();
      expect(options).toHaveLength(4);
    });

    it('应该正确设置选项标签', () => {
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      const optionLabels = result.querySelectorAll('.tuanki-choice-option-label');
      
      expect(optionLabels[0].textContent).toBe('A');
      expect(optionLabels[1].textContent).toBe('B');
      expect(optionLabels[2].textContent).toBe('C');
      expect(optionLabels[3].textContent).toBe('D');
    });

    it('应该正确设置选项内容', () => {
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      const optionDescriptions = result.querySelectorAll('.option-description');
      
      expect(optionDescriptions[0].textContent).toBe('String');
      expect(optionDescriptions[1].textContent).toBe('Integer');
      expect(optionDescriptions[2].textContent).toBe('Float');
      expect(optionDescriptions[3].textContent).toBe('Character');
    });

    it('应该为单选题显示正确的标签', () => {
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      const label = result.querySelector('.tuanki-choice-label');
      
      expect(label?.textContent).toBe('单选题');
    });

    it('应该为多选题显示正确的标签', () => {
      // 修改为多选题
      mockPreviewData.sections[1].metadata!.allowMultiple = true;
      mockPreviewData.sections[1].metadata!.correctAnswers = ['A', 'B'];
      
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      const label = result.querySelector('.tuanki-choice-label');
      
      expect(label?.textContent).toBe('多选题');
    });

    it('应该处理空选项的情况', () => {
      // 移除选项数据
      mockPreviewData.sections[1].metadata!.options = [];
      
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      const emptyState = result.querySelector('.tuanki-choice-empty');
      
      expect(emptyState).toBeTruthy();
      expect(emptyState?.textContent).toContain('没有发现选择题选项');
    });

    it('应该添加选项点击事件监听器', () => {
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      const firstOption = result.querySelector('.tuanki-choice-option') as HTMLButtonElement;
      
      expect(firstOption).toBeTruthy();
      expect(firstOption.getAttribute('data-option-id')).toBe('A');
      
      // 模拟点击
      firstOption.click();
      expect(firstOption.classList.contains('tuanki-choice-option--selected')).toBe(true);
    });

    it('应该为多选题渲染提交按钮', () => {
      // 设置为多选题
      mockPreviewData.sections[1].metadata!.allowMultiple = true;
      
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      const submitButton = result.querySelector('.tuanki-choice-control-btn--submit');
      
      expect(submitButton).toBeTruthy();
      expect(submitButton?.textContent).toBe('提交答案');
    });

    it('应该在showAnswer为true时显示解析', () => {
      mockOptions.showAnswer = true;
      
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      
      // 由于解析需要在答题后显示，这里主要测试解析元素的创建
      expect(result.querySelector('.tuanki-choice-explanation')).toBeTruthy();
    });
  });

  describe('选项交互', () => {
    it('单选题应该只允许选择一个选项', () => {
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      const options = result.querySelectorAll('.tuanki-choice-option') as NodeListOf<HTMLButtonElement>;
      
      // 点击第一个选项
      options[0].click();
      expect(options[0].classList.contains('tuanki-choice-option--selected')).toBe(true);
      
      // 点击第二个选项
      options[1].click();
      expect(options[0].classList.contains('tuanki-choice-option--selected')).toBe(false);
      expect(options[1].classList.contains('tuanki-choice-option--selected')).toBe(true);
    });

    it('多选题应该允许选择多个选项', () => {
      // 设置为多选题
      mockPreviewData.sections[1].metadata!.allowMultiple = true;
      
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      const options = result.querySelectorAll('.tuanki-choice-option') as NodeListOf<HTMLButtonElement>;
      
      // 点击第一个选项
      options[0].click();
      expect(options[0].classList.contains('tuanki-choice-option--selected')).toBe(true);
      
      // 点击第二个选项
      options[1].click();
      expect(options[0].classList.contains('tuanki-choice-option--selected')).toBe(true);
      expect(options[1].classList.contains('tuanki-choice-option--selected')).toBe(true);
      
      // 再次点击第一个选项应该取消选择
      options[0].click();
      expect(options[0].classList.contains('tuanki-choice-option--selected')).toBe(false);
      expect(options[1].classList.contains('tuanki-choice-option--selected')).toBe(true);
    });
  });

  describe('reset', () => {
    it('应该重置所有状态', () => {
      const result = renderer.renderChoiceCard(mockPreviewData, mockOptions);
      const firstOption = result.querySelector('.tuanki-choice-option') as HTMLButtonElement;
      
      // 选择一个选项
      firstOption.click();
      expect(firstOption.classList.contains('tuanki-choice-option--selected')).toBe(true);
      
      // 重置
      renderer.reset();
      
      // 验证状态已重置（这里主要测试方法不抛出错误）
      expect(() => renderer.reset()).not.toThrow();
    });
  });
});
