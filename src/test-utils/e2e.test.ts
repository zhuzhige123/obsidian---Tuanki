/**
 * 端到端测试套件
 * 验证完整的用户工作流程
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { cardEditStore, ActionType } from '../stores/CardEditStore';
import { templateStore } from '../stores/TemplateStore';
import { cardEditEventBus } from '../events/CardEditEventBus';
import CardEditModalV2 from '../components/modals/CardEditModalV2.svelte';
import { testEnv, createMockCard, createMockDecks, createMockPlugin, createMockDataStorage } from './setup';

describe('端到端测试套件', () => {
  let mockCard: any;
  let mockDecks: any;
  let mockPlugin: any;
  let mockDataStorage: any;
  let onCloseMock: any;
  let onSaveMock: any;

  beforeEach(() => {
    testEnv.setup();
    
    mockCard = createMockCard();
    mockDecks = createMockDecks();
    mockPlugin = createMockPlugin();
    mockDataStorage = createMockDataStorage();
    onCloseMock = testEnv.createEventSpy(cardEditEventBus, 'card:closed').spy;
    onSaveMock = testEnv.createEventSpy(cardEditEventBus, 'card:saved').spy;
  });

  afterEach(() => {
    testEnv.cleanup();
  });

  describe('完整的卡片编辑工作流程', () => {
    it('应该完成完整的编辑和保存流程', async () => {
      const { getByRole, getByText, getByDisplayValue } = render(CardEditModalV2, {
        props: {
          card: mockCard,
          decks: mockDecks,
          dataStorage: mockDataStorage,
          plugin: mockPlugin,
          onClose: () => {},
          onSave: () => {}
        }
      });

      // 1. 验证模态窗已打开
      expect(getByRole('dialog')).toBeInTheDocument();
      expect(getByText('卡片编辑')).toBeInTheDocument();

      // 2. 等待编辑器加载完成
      await waitFor(() => {
        const state = cardEditStore.getCurrentState();
        expect(state.currentCard?.id).toBe(mockCard.id);
      });

      // 3. 编辑内容
      const newContent = '# 新的标题\n\n这是更新后的内容。';
      cardEditStore.dispatch({
        type: ActionType.UPDATE_CONTENT,
        payload: { content: newContent }
      });

      // 4. 验证状态已更新
      await waitFor(() => {
        const state = cardEditStore.getCurrentState();
        expect(state.markdownContent).toBe(newContent);
        expect(state.editorState.isDirty).toBe(true);
      });

      // 5. 保存卡片
      const saveButton = getByText('保存');
      await fireEvent.click(saveButton);

      // 6. 验证保存调用
      await waitFor(() => {
        expect(mockDataStorage.saveCard).toHaveBeenCalledWith(
          expect.objectContaining({
            id: mockCard.id,
            fields: expect.objectContaining({
              notes: newContent
            })
          })
        );
      });

      // 7. 验证保存成功事件
      await waitFor(() => {
        expect(onSaveMock).toHaveBeenCalled();
      });
    });

    it('应该处理模板切换工作流程', async () => {
      // 先加载一些模板
      const mockTemplates = [
        {
          id: 'template-1',
          name: '基础模板',
          description: '基础问答模板',
          fieldTemplate: {
            id: 'field-1',
            name: '基础字段',
            fields: [
              { key: 'question', name: '问题', type: 'field' },
              { key: 'answer', name: '答案', type: 'field' }
            ]
          }
        }
      ];

      templateStore.dispatch({
        type: 'load_success' as any,
        payload: {
          fieldTemplates: mockTemplates.map(t => t.fieldTemplate),
          triadTemplates: mockTemplates
        }
      });

      const { getByRole, getByText } = render(CardEditModalV2, {
        props: {
          card: mockCard,
          decks: mockDecks,
          dataStorage: mockDataStorage,
          plugin: mockPlugin,
          onClose: () => {},
          onSave: () => {}
        }
      });

      // 等待组件加载
      await waitFor(() => {
        expect(getByRole('dialog')).toBeInTheDocument();
      });

      // 模拟模板应用
      cardEditEventBus.emitSync('template:triad-applied', {
        template: mockTemplates[0]
      });

      // 验证模板已应用
      await waitFor(() => {
        const state = templateStore.getCurrentState();
        expect(state.appliedTriadTemplate).toBeTruthy();
      });
    });

    it('应该处理错误恢复工作流程', async () => {
      const { getByRole } = render(CardEditModalV2, {
        props: {
          card: mockCard,
          decks: mockDecks,
          dataStorage: mockDataStorage,
          plugin: mockPlugin,
          onClose: () => {},
          onSave: () => {}
        }
      });

      // 等待组件加载
      await waitFor(() => {
        expect(getByRole('dialog')).toBeInTheDocument();
      });

      // 模拟错误
      const testError = new Error('测试错误');
      cardEditEventBus.emitSync('error:occurred', {
        error: testError,
        context: 'test context',
        recoverable: true
      });

      // 等待错误处理
      await testEnv.waitForAsync();

      // 模拟错误恢复
      cardEditEventBus.emitSync('error:recovered', {
        error: testError,
        strategy: 'test-recovery'
      });

      // 验证系统继续正常工作
      cardEditStore.dispatch({
        type: ActionType.UPDATE_CONTENT,
        payload: { content: '恢复后的内容' }
      });

      const state = cardEditStore.getCurrentState();
      expect(state.markdownContent).toBe('恢复后的内容');
    });
  });

  describe('用户交互场景', () => {
    it('应该处理快速连续编辑', async () => {
      const { getByRole } = render(CardEditModalV2, {
        props: {
          card: mockCard,
          decks: mockDecks,
          dataStorage: mockDataStorage,
          plugin: mockPlugin,
          onClose: () => {},
          onSave: () => {}
        }
      });

      await waitFor(() => {
        expect(getByRole('dialog')).toBeInTheDocument();
      });

      // 快速连续编辑
      const updates = [
        '第一次更新',
        '第二次更新',
        '第三次更新',
        '最终更新'
      ];

      for (const update of updates) {
        cardEditStore.dispatch({
          type: ActionType.UPDATE_CONTENT,
          payload: { content: update }
        });
      }

      // 验证最终状态
      await waitFor(() => {
        const state = cardEditStore.getCurrentState();
        expect(state.markdownContent).toBe('最终更新');
        expect(state.editorState.isDirty).toBe(true);
      });
    });

    it('应该处理键盘快捷键', async () => {
      const { getByRole } = render(CardEditModalV2, {
        props: {
          card: mockCard,
          decks: mockDecks,
          dataStorage: mockDataStorage,
          plugin: mockPlugin,
          onClose: () => {},
          onSave: () => {}
        }
      });

      await waitFor(() => {
        expect(getByRole('dialog')).toBeInTheDocument();
      });

      // 先编辑内容使其变脏
      cardEditStore.dispatch({
        type: ActionType.UPDATE_CONTENT,
        payload: { content: '新内容' }
      });

      // 模拟Ctrl+S保存快捷键
      await fireEvent.keyDown(window, { key: 's', ctrlKey: true });

      // 验证保存被触发
      await waitFor(() => {
        expect(mockDataStorage.saveCard).toHaveBeenCalled();
      });
    });

    it('应该处理取消编辑确认', async () => {
      // Mock window.confirm
      const originalConfirm = window.confirm;
      window.confirm = testEnv.createEventSpy({}, 'confirm').spy.mockReturnValue(false);

      const { getByRole, getByText } = render(CardEditModalV2, {
        props: {
          card: mockCard,
          decks: mockDecks,
          dataStorage: mockDataStorage,
          plugin: mockPlugin,
          onClose: () => {},
          onSave: () => {}
        }
      });

      await waitFor(() => {
        expect(getByRole('dialog')).toBeInTheDocument();
      });

      // 编辑内容
      cardEditStore.dispatch({
        type: ActionType.UPDATE_CONTENT,
        payload: { content: '未保存的更改' }
      });

      // 尝试关闭
      const closeButton = getByText('取消');
      await fireEvent.click(closeButton);

      // 验证确认对话框被调用
      expect(window.confirm).toHaveBeenCalled();

      // 恢复原始confirm
      window.confirm = originalConfirm;
    });
  });

  describe('数据一致性验证', () => {
    it('应该保持编辑器和状态的同步', async () => {
      const { getByRole } = render(CardEditModalV2, {
        props: {
          card: mockCard,
          decks: mockDecks,
          dataStorage: mockDataStorage,
          plugin: mockPlugin,
          onClose: () => {},
          onSave: () => {}
        }
      });

      await waitFor(() => {
        expect(getByRole('dialog')).toBeInTheDocument();
      });

      // 通过状态管理器更新内容
      const newContent = '通过状态管理器更新的内容';
      cardEditStore.dispatch({
        type: ActionType.UPDATE_CONTENT,
        payload: { content: newContent }
      });

      // 验证状态同步
      await waitFor(() => {
        const state = cardEditStore.getCurrentState();
        expect(state.markdownContent).toBe(newContent);
      });

      // 模拟编辑器内容变更事件
      cardEditEventBus.emitSync('content:changed', {
        content: '通过编辑器更新的内容',
        source: 'markdown'
      });

      // 验证事件被正确处理
      await testEnv.waitForAsync();
    });

    it('应该正确处理并发状态更新', async () => {
      const { getByRole } = render(CardEditModalV2, {
        props: {
          card: mockCard,
          decks: mockDecks,
          dataStorage: mockDataStorage,
          plugin: mockPlugin,
          onClose: () => {},
          onSave: () => {}
        }
      });

      await waitFor(() => {
        expect(getByRole('dialog')).toBeInTheDocument();
      });

      // 并发更新不同的字段
      const updates = [
        { type: ActionType.UPDATE_CONTENT, payload: { content: '新内容' } },
        { type: ActionType.UPDATE_FIELD, payload: { fieldKey: 'question', value: '新问题' } },
        { type: ActionType.UPDATE_TAGS, payload: { tags: ['新标签'] } },
        { type: ActionType.UPDATE_DECK, payload: { deckId: 'deck-2' } }
      ];

      // 同时分发所有更新
      updates.forEach(update => {
        cardEditStore.dispatch(update);
      });

      // 验证所有更新都被正确应用
      await waitFor(() => {
        const state = cardEditStore.getCurrentState();
        expect(state.markdownContent).toBe('新内容');
        expect(state.fields.question).toBe('新问题');
        expect(state.tags).toEqual(['新标签']);
        expect(state.deckId).toBe('deck-2');
        expect(state.editorState.isDirty).toBe(true);
      });
    });
  });

  describe('边界情况处理', () => {
    it('应该处理空内容编辑', async () => {
      const emptyCard = createMockCard({
        fields: { question: '', answer: '', notes: '' },
        tags: []
      });

      const { getByRole } = render(CardEditModalV2, {
        props: {
          card: emptyCard,
          decks: mockDecks,
          dataStorage: mockDataStorage,
          plugin: mockPlugin,
          onClose: () => {},
          onSave: () => {}
        }
      });

      await waitFor(() => {
        expect(getByRole('dialog')).toBeInTheDocument();
      });

      // 验证空卡片加载正确
      const state = cardEditStore.getCurrentState();
      expect(state.markdownContent).toBe('');
      expect(state.fields.question).toBe('');
      expect(state.tags).toEqual([]);
    });

    it('应该处理大量内容编辑', async () => {
      const largeContent = 'x'.repeat(100000); // 100KB内容
      const largeCard = createMockCard({
        fields: {
          question: '大内容测试',
          answer: '大内容答案',
          notes: largeContent
        }
      });

      const { getByRole } = render(CardEditModalV2, {
        props: {
          card: largeCard,
          decks: mockDecks,
          dataStorage: mockDataStorage,
          plugin: mockPlugin,
          onClose: () => {},
          onSave: () => {}
        }
      });

      await waitFor(() => {
        expect(getByRole('dialog')).toBeInTheDocument();
      });

      // 验证大内容加载正确
      const state = cardEditStore.getCurrentState();
      expect(state.markdownContent).toBe(largeContent);
      expect(state.markdownContent.length).toBe(100000);
    });

    it('应该处理网络错误场景', async () => {
      // Mock保存失败
      const failingDataStorage = {
        ...mockDataStorage,
        saveCard: testEnv.createEventSpy({}, 'saveCard').spy.mockRejectedValue(new Error('网络错误'))
      };

      const { getByRole, getByText } = render(CardEditModalV2, {
        props: {
          card: mockCard,
          decks: mockDecks,
          dataStorage: failingDataStorage,
          plugin: mockPlugin,
          onClose: () => {},
          onSave: () => {}
        }
      });

      await waitFor(() => {
        expect(getByRole('dialog')).toBeInTheDocument();
      });

      // 编辑内容
      cardEditStore.dispatch({
        type: ActionType.UPDATE_CONTENT,
        payload: { content: '新内容' }
      });

      // 尝试保存
      const saveButton = getByText('保存');
      await fireEvent.click(saveButton);

      // 验证错误被正确处理
      await waitFor(() => {
        expect(failingDataStorage.saveCard).toHaveBeenCalled();
      });

      // 验证错误状态
      await testEnv.waitForAsync();
      const state = cardEditStore.getCurrentState();
      expect(state.phase).toBe('error');
    });
  });
});
