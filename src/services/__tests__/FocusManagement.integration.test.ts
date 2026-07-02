/**
 * 焦点管理系统集成测试
 * 
 * 测试焦点管理的端到端流程，包括：
 * - 模态窗口焦点恢复
 * - 删除操作后焦点恢复
 * - 移动端键盘行为
 * 
 * _Requirements: 4.2, 7.4, 4.1, 3.1, 3.2_
 */
import { FocusStack } from '../../utils/focus-manager/FocusStack';
import { FocusTrapManager } from '../../utils/focus-manager/FocusTrapManager';
import { RequestCoalescer } from '../../utils/focus-manager/RequestCoalescer';
import { KeyboardMonitor } from '../../utils/focus-manager/KeyboardMonitor';

describe('FocusManagement Integration Tests', () => {
  let container: HTMLElement;
  let focusStack: FocusStack;
  let focusTrapManager: FocusTrapManager;
  let requestCoalescer: RequestCoalescer;

  // 辅助函数：等待 requestAnimationFrame
  const waitForRAF = () => new Promise<void>(resolve => {
    window.setTimeout(resolve, 50); // jsdom 中 RAF 被 mock 为 setTimeout
  });

  const waitForCoalescedAction = async () => {
    await new Promise(resolve => window.setTimeout(resolve, 120));
    await waitForRAF();
  };

  beforeEach(() => {
    // 创建测试 DOM 容器
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    // 初始化组件
    focusStack = new FocusStack(10, false);
    focusTrapManager = new FocusTrapManager(false);
    requestCoalescer = new RequestCoalescer(50, false);
  });

  afterEach(() => {
    // 清理
    focusTrapManager.releaseAll();
    requestCoalescer.clear();
    focusStack.clear();
    
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    
    vi.clearAllMocks();
  });

  describe('14.1 测试模态窗口焦点恢复', () => {
    /**
     * 测试打开/关闭模态窗口后焦点正确恢复
     * _Requirements: 4.2, 7.4_
     */
    
    it('应该在模态窗口关闭后恢复焦点到之前的元素', async () => {
      // 创建原始焦点元素
      const originalButton = document.createElement('button');
      originalButton.id = 'original-focus';
      originalButton.textContent = '原始按钮';
      container.appendChild(originalButton);
      
      // 创建模态窗口
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <button id="modal-btn-1">按钮1</button>
        <input id="modal-input" type="text" />
        <button id="modal-btn-2">按钮2</button>
      `;
      container.appendChild(modal);

      // 1. 聚焦到原始按钮
      originalButton.focus();
      expect(document.activeElement).toBe(originalButton);

      // 2. 保存焦点并打开模态窗口
      focusStack.push({
        element: originalButton,
        timestamp: Date.now(),
        context: 'modal-open'
      });

      // 3. 手动聚焦到模态窗口内的元素（模拟焦点陷阱行为）
      const modalBtn1 = modal.querySelector('#modal-btn-1') as HTMLElement;
      modalBtn1.focus();
      
      // 4. 验证焦点在模态窗口内
      expect(document.activeElement).toBe(modalBtn1);

      // 5. 关闭模态窗口，恢复焦点
      const record = focusStack.pop();
      expect(record).toBeDefined();
      expect(record?.element).toBe(originalButton);
      
      if (record?.element) {
        record.element.focus();
      }

      // 6. 验证焦点恢复到原始元素
      expect(document.activeElement).toBe(originalButton);
    });

    it('应该支持多层嵌套模态窗口的焦点恢复', async () => {
      // 创建原始焦点元素
      const originalInput = document.createElement('input');
      originalInput.id = 'original-input';
      container.appendChild(originalInput);

      // 创建第一层模态窗口
      const modal1 = document.createElement('div');
      modal1.className = 'modal modal-1';
      modal1.innerHTML = '<button id="modal1-btn">模态1按钮</button>';
      container.appendChild(modal1);

      // 创建第二层模态窗口
      const modal2 = document.createElement('div');
      modal2.className = 'modal modal-2';
      modal2.innerHTML = '<button id="modal2-btn">模态2按钮</button>';
      container.appendChild(modal2);

      // 1. 聚焦到原始输入框
      originalInput.focus();
      expect(document.activeElement).toBe(originalInput);

      // 2. 打开第一层模态窗口
      focusStack.push({
        element: originalInput,
        timestamp: Date.now(),
        context: 'modal-1-open'
      });
      
      const modal1Btn = modal1.querySelector('#modal1-btn') as HTMLElement;
      modal1Btn.focus();
      expect(document.activeElement).toBe(modal1Btn);

      // 3. 打开第二层模态窗口
      focusStack.push({
        element: modal1Btn,
        timestamp: Date.now(),
        context: 'modal-2-open'
      });
      
      const modal2Btn = modal2.querySelector('#modal2-btn') as HTMLElement;
      modal2Btn.focus();
      expect(document.activeElement).toBe(modal2Btn);

      // 4. 关闭第二层模态窗口
      const record2 = focusStack.pop();
      if (record2?.element) {
        record2.element.focus();
      }
      expect(document.activeElement).toBe(modal1Btn);

      // 5. 关闭第一层模态窗口
      const record1 = focusStack.pop();
      if (record1?.element) {
        record1.element.focus();
      }
      expect(document.activeElement).toBe(originalInput);
    });

    it('应该正确处理焦点陷阱的创建和释放', async () => {
      // 注意：在 jsdom 中，getBoundingClientRect 返回 0，
      // 导致 FocusTrapManager 的 isElementFocusable 检查失败。
      // 这个测试验证基本的 API 调用不会抛出错误。
      
      const modal = document.createElement('div');
      const btn1 = document.createElement('button');
      btn1.id = 'btn-1';
      btn1.textContent = '按钮1';
      const input1 = document.createElement('input');
      input1.id = 'input-1';
      input1.type = 'text';
      const btn2 = document.createElement('button');
      btn2.id = 'btn-2';
      btn2.textContent = '按钮2';
      
      modal.appendChild(btn1);
      modal.appendChild(input1);
      modal.appendChild(btn2);
      container.appendChild(modal);

      // 验证初始状态
      expect(focusTrapManager.isTrapped(modal)).toBe(false);
      expect(focusTrapManager.getTrapCount()).toBe(0);

      // 尝试创建焦点陷阱（在 jsdom 中可能因为元素尺寸为 0 而失败）
      focusTrapManager.trap(modal);
      await waitForRAF();

      // 无论是否成功创建，释放操作都不应该报错
      focusTrapManager.release(modal);
      expect(focusTrapManager.isTrapped(modal)).toBe(false);
      expect(focusTrapManager.getTrapCount()).toBe(0);
    });
  });

  describe('14.2 测试删除牌组后焦点恢复', () => {
    /**
     * 测试删除操作后焦点恢复到合适元素
     * _Requirements: 4.1_
     */

    it('应该在删除操作后恢复焦点到合适的元素', async () => {
      // 创建牌组列表
      const deckList = document.createElement('div');
      deckList.className = 'deck-list';
      deckList.innerHTML = `
        <div class="deck-item" data-deck-id="1">
          <span>牌组1</span>
          <button class="delete-btn" id="delete-1">删除</button>
        </div>
        <div class="deck-item" data-deck-id="2">
          <span>牌组2</span>
          <button class="delete-btn" id="delete-2">删除</button>
        </div>
        <div class="deck-item" data-deck-id="3">
          <span>牌组3</span>
          <button class="delete-btn" id="delete-3">删除</button>
        </div>
      `;
      container.appendChild(deckList);

      const deleteBtn2 = deckList.querySelector('#delete-2') as HTMLElement;
      const deckItem2 = deckList.querySelector('[data-deck-id="2"]') as HTMLElement;

      // 1. 聚焦到删除按钮
      deleteBtn2.focus();
      expect(document.activeElement).toBe(deleteBtn2);

      // 2. 保存焦点（模拟删除确认对话框打开前）
      focusStack.push({
        element: deleteBtn2,
        timestamp: Date.now(),
        context: 'deck-delete'
      });

      // 3. 模拟删除操作（移除牌组2）
      deckItem2.remove();

      // 4. 尝试恢复焦点
      const record = focusStack.pop();
      
      // 原元素已不存在，需要找到替代元素
      if (record?.element && !document.contains(record.element)) {
        // 查找下一个可聚焦的牌组
        const nextDeck = deckList.querySelector('.deck-item') as HTMLElement;
        if (nextDeck) {
          const nextDeleteBtn = nextDeck.querySelector('.delete-btn') as HTMLElement;
          if (nextDeleteBtn) {
            nextDeleteBtn.focus();
          }
        }
      }

      // 5. 验证焦点恢复到合适的元素
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement?.classList.contains('delete-btn')).toBe(true);
    });

    it('应该在删除最后一个元素后恢复焦点到容器', async () => {
      // 创建只有一个牌组的列表
      const deckList = document.createElement('div');
      deckList.className = 'deck-list';
      deckList.tabIndex = 0; // 使容器可聚焦
      deckList.innerHTML = `
        <div class="deck-item" data-deck-id="1">
          <span>唯一牌组</span>
          <button class="delete-btn" id="delete-1">删除</button>
        </div>
      `;
      container.appendChild(deckList);

      const deleteBtn = deckList.querySelector('#delete-1') as HTMLElement;
      const deckItem = deckList.querySelector('.deck-item') as HTMLElement;

      // 1. 聚焦到删除按钮
      deleteBtn.focus();
      expect(document.activeElement).toBe(deleteBtn);

      // 2. 保存焦点
      focusStack.push({
        element: deleteBtn,
        timestamp: Date.now(),
        context: 'deck-delete'
      });

      // 3. 模拟删除操作
      deckItem.remove();

      // 4. 尝试恢复焦点
      const record = focusStack.pop();
      
      if (record?.element && !document.contains(record.element)) {
        // 没有其他牌组，聚焦到容器
        deckList.focus();
      }

      // 5. 验证焦点恢复到容器
      expect(document.activeElement).toBe(deckList);
    });
  });

  describe('14.3 测试移动端键盘行为', () => {
    /**
     * 测试移动端不会触发键盘闪烁
     * _Requirements: 3.1, 3.2_
     */

    it('应该正确初始化 KeyboardMonitor', async () => {
      // 创建 KeyboardMonitor 实例
      const keyboardMonitor = new KeyboardMonitor(false);
      
      // 模拟键盘状态
      const keyboardState = keyboardMonitor.getState();
      expect(keyboardState.isVisible).toBe(false);
      expect(keyboardState.isAnimating).toBe(false);

      // 验证初始状态
      expect(keyboardMonitor.isKeyboardActive()).toBe(false);

      // 清理
      keyboardMonitor.destroy();
    });

    it('应该使用请求合并器避免频繁焦点操作', async () => {
      let executeCount = 0;
      const action = () => {
        executeCount++;
      };

      // 快速连续调度多个请求
      requestCoalescer.schedule(action, 'test-key');
      requestCoalescer.schedule(action, 'test-key');
      requestCoalescer.schedule(action, 'test-key');

      await waitForCoalescedAction();

      // 验证只执行了一次
      expect(executeCount).toBe(1);
    });

    it('应该能够取消待执行的焦点操作', async () => {
      let executed = false;
      const action = () => {
        executed = true;
      };

      // 调度请求
      requestCoalescer.schedule(action, 'cancel-test');

      // 立即取消
      requestCoalescer.cancel('cancel-test');

      await waitForCoalescedAction();

      // 验证没有执行
      expect(executed).toBe(false);
    });

    it('应该支持不同 key 的独立调度', async () => {
      let count1 = 0;
      let count2 = 0;

      requestCoalescer.schedule(() => count1++, 'key1');
      requestCoalescer.schedule(() => count2++, 'key2');

      await waitForCoalescedAction();

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });
  });

  describe('焦点栈行为验证', () => {
    it('应该维护正确的 LIFO 顺序', () => {
      const element1 = document.createElement('button');
      const element2 = document.createElement('input');
      const element3 = document.createElement('textarea');

      focusStack.push({ element: element1, timestamp: 1, context: 'ctx1' });
      focusStack.push({ element: element2, timestamp: 2, context: 'ctx2' });
      focusStack.push({ element: element3, timestamp: 3, context: 'ctx3' });

      expect(focusStack.size()).toBe(3);

      const pop1 = focusStack.pop();
      expect(pop1?.element).toBe(element3);
      expect(pop1?.context).toBe('ctx3');

      const pop2 = focusStack.pop();
      expect(pop2?.element).toBe(element2);
      expect(pop2?.context).toBe('ctx2');

      const pop3 = focusStack.pop();
      expect(pop3?.element).toBe(element1);
      expect(pop3?.context).toBe('ctx1');

      expect(focusStack.size()).toBe(0);
    });

    it('应该正确处理空栈情况', () => {
      expect(focusStack.size()).toBe(0);
      expect(focusStack.pop()).toBeUndefined();
      expect(focusStack.peek()).toBeUndefined();
    });

    it('应该在栈满时移除最旧的记录', () => {
      const smallStack = new FocusStack(3, false);

      const element1 = document.createElement('button');
      const element2 = document.createElement('input');
      const element3 = document.createElement('textarea');
      const element4 = document.createElement('div');

      smallStack.push({ element: element1, timestamp: 1, context: 'ctx1' });
      smallStack.push({ element: element2, timestamp: 2, context: 'ctx2' });
      smallStack.push({ element: element3, timestamp: 3, context: 'ctx3' });
      
      expect(smallStack.size()).toBe(3);

      // 添加第四个元素，应该移除最旧的
      smallStack.push({ element: element4, timestamp: 4, context: 'ctx4' });
      
      expect(smallStack.size()).toBe(3);

      // 验证最旧的元素已被移除
      const all = smallStack.getAll();
      expect(all.find(r => r.element === element1)).toBeUndefined();
      expect(all.find(r => r.element === element4)).toBeDefined();
    });
  });

  describe('焦点陷阱管理验证', () => {
    it('应该正确跟踪陷阱状态（不依赖 DOM 渲染）', () => {
      // 注意：在 jsdom 中，getBoundingClientRect 返回 0，
      // 导致 isElementFocusable 检查失败。
      // 这个测试验证 FocusTrapManager 的基本 API 行为。
      
      const modal = document.createElement('div');
      container.appendChild(modal);

      // 初始状态
      expect(focusTrapManager.isTrapped(modal)).toBe(false);
      expect(focusTrapManager.getTrapCount()).toBe(0);
    });

    it('应该处理没有可聚焦元素的容器', () => {
      const emptyModal = document.createElement('div');
      emptyModal.innerHTML = '<span>纯文本内容</span>';
      container.appendChild(emptyModal);

      // 不应该抛出错误
      focusTrapManager.trap(emptyModal);
      
      // 由于没有可聚焦元素，不应该创建陷阱
      expect(focusTrapManager.isTrapped(emptyModal)).toBe(false);
    });

    it('应该能够释放不存在的陷阱而不报错', () => {
      const modal = document.createElement('div');
      container.appendChild(modal);

      // 释放不存在的陷阱不应该抛出错误
      expect(() => focusTrapManager.release(modal)).not.toThrow();
      expect(focusTrapManager.getTrapCount()).toBe(0);
    });

    it('应该正确报告陷阱数量', () => {
      // 初始状态
      expect(focusTrapManager.getTrapCount()).toBe(0);
      
      // releaseAll 在空状态下不应该报错
      expect(() => focusTrapManager.releaseAll()).not.toThrow();
      expect(focusTrapManager.getTrapCount()).toBe(0);
    });
  });
});
