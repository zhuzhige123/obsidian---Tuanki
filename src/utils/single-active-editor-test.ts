/**
 * 单一活跃编辑器功能测试
 * 用于验证字段编辑模式下的单一活跃编辑器逻辑
 */

import { globalEditorManager } from './unifiedStateManager';

/**
 * 测试单一活跃编辑器功能
 */
export function testSingleActiveEditor() {
  console.log('🧪 开始测试单一活跃编辑器功能...');

  // 模拟多个编辑器实例
  const editorIds = ['editor-question', 'editor-answer', 'editor-options'];
  const fieldKeys = ['question', 'answer', 'options'];

  // 测试1: 设置活跃编辑器
  console.log('📝 测试1: 设置活跃编辑器');
  globalEditorManager.setActiveEditor(editorIds[0], fieldKeys[0]);
  
  if (globalEditorManager.isActiveEditor(editorIds[0])) {
    console.log('✅ 测试1通过: 成功设置活跃编辑器');
  } else {
    console.error('❌ 测试1失败: 未能设置活跃编辑器');
  }

  // 测试2: 切换活跃编辑器
  console.log('📝 测试2: 切换活跃编辑器');
  globalEditorManager.setActiveEditor(editorIds[1], fieldKeys[1]);
  
  if (globalEditorManager.isActiveEditor(editorIds[1]) && !globalEditorManager.isActiveEditor(editorIds[0])) {
    console.log('✅ 测试2通过: 成功切换活跃编辑器');
  } else {
    console.error('❌ 测试2失败: 未能正确切换活跃编辑器');
  }

  // 测试3: 编辑器状态管理
  console.log('📝 测试3: 编辑器状态管理');
  const state1 = globalEditorManager.getEditorState(editorIds[1]);
  const state0 = globalEditorManager.getEditorState(editorIds[0]);
  
  if (state1 === 'editing' && state0 === 'preview') {
    console.log('✅ 测试3通过: 编辑器状态正确');
  } else {
    console.error('❌ 测试3失败: 编辑器状态不正确', { state1, state0 });
  }

  // 测试4: 重置所有编辑器
  console.log('📝 测试4: 重置所有编辑器');
  globalEditorManager.resetAllToPreview();
  
  const allPreview = editorIds.every(id => globalEditorManager.getEditorState(id) === 'preview');
  const noActive = editorIds.every(id => !globalEditorManager.isActiveEditor(id));
  
  if (allPreview && noActive) {
    console.log('✅ 测试4通过: 成功重置所有编辑器');
  } else {
    console.error('❌ 测试4失败: 未能正确重置编辑器');
  }

  console.log('🎉 单一活跃编辑器功能测试完成!');
}

/**
 * 监听编辑器状态变更事件的测试
 */
export function testEditorStateChangeEvents() {
  console.log('🧪 开始测试编辑器状态变更事件...');

  let eventReceived = false;
  
  // 添加事件监听器
  const handleStateChange = (event: Event) => {
    if (event instanceof CustomEvent) {
      console.log('📡 收到编辑器状态变更事件:', event.detail);
      eventReceived = true;
    }
  };

  window.addEventListener('tuanki-editor-state-change', handleStateChange);

  // 触发状态变更
  globalEditorManager.setActiveEditor('test-editor', 'test-field');

  // 等待事件处理
  setTimeout(() => {
    if (eventReceived) {
      console.log('✅ 事件测试通过: 成功接收状态变更事件');
    } else {
      console.error('❌ 事件测试失败: 未接收到状态变更事件');
    }

    // 清理
    window.removeEventListener('tuanki-editor-state-change', handleStateChange);
    console.log('🎉 编辑器状态变更事件测试完成!');
  }, 100);
}

// 在开发模式下自动运行测试
if (process.env.NODE_ENV === 'development') {
  // 延迟执行测试，确保模块加载完成
  setTimeout(() => {
    testSingleActiveEditor();
    testEditorStateChangeEvents();
  }, 1000);
}
