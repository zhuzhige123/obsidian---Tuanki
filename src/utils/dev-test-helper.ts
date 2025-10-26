/**
 * 开发者测试助手
 * 在Obsidian开发环境中运行智能解析测试
 */

import { Notice } from 'obsidian';
import type AnkiPlugin from '../main';

/**
 * 开发者测试助手类
 */
export class DevTestHelper {
  constructor(private plugin: AnkiPlugin) {}

  /**
   * 快速测试当前选中的文本
   */
  async testSelectedText(): Promise<void> {
    try {
      const activeView = this.plugin.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
      if (!activeView) {
        new Notice('请在Markdown视图中选择文本');
        return;
      }

      const editor = activeView.editor;
      const selectedText = editor.getSelection();
      
      if (!selectedText || selectedText.trim().length === 0) {
        new Notice('请先选择要测试的文本');
        return;
      }

      console.log('🧪 [DevTestHelper] 开始测试选中文本:', selectedText.substring(0, 50) + '...');

      // 动态导入测试模块
      const { parseContentIntelligently } = await import('../utils/content-pattern-recognition');
      const { convertParseResultToCardData } = await import('../utils/template-selection-engine');
      const { OFFICIAL_TRIAD_TEMPLATES } = await import('../data/official-triad-templates');

      // 1. 解析内容
      const parseResult = parseContentIntelligently(selectedText);
      
      // 2. 转换为卡片数据
      const cardData = convertParseResultToCardData(
        parseResult,
        {
          blockLink: `[[${activeView.file?.name || '未知文件'}#^test]]`,
          sourceDocument: activeView.file?.name || '未知文件',
          sourceFile: activeView.file?.path || '未知路径',
          lineNumber: editor.getCursor().line + 1
        },
        OFFICIAL_TRIAD_TEMPLATES
      );

      // 3. 显示结果
      this.showTestResult(selectedText, parseResult, cardData);

    } catch (error) {
      console.error('❌ [DevTestHelper] 测试失败:', error);
      new Notice(`测试失败: ${error.message}`);
    }
  }

  /**
   * 显示测试结果
   */
  private showTestResult(originalText: string, parseResult: any, cardData: any): void {
    const resultModal = new TestResultModal(this.plugin.app, {
      originalText,
      parseResult,
      cardData
    });
    resultModal.open();

    // 同时在控制台输出详细信息
    console.log('📊 [DevTestHelper] 测试结果详情:');
    console.log('原始文本:', originalText);
    console.log('解析结果:', parseResult);
    console.log('卡片数据:', cardData);

    // 显示简要通知
    new Notice(`解析成功！模式: ${parseResult.pattern}, 模板: ${cardData.templateName}`, 5000);
  }

  /**
   * 运行预定义测试套件
   */
  async runTestSuite(): Promise<void> {
    try {
      new Notice('开始运行测试套件...');
      
      // 动态导入测试模块
      const { runFullTestSuite } = await import('../tests/test-runner');
      
      // 在后台运行测试
      setTimeout(() => {
        try {
          runFullTestSuite();
          new Notice('测试套件运行完成，请查看控制台输出');
        } catch (error) {
          console.error('❌ 测试套件运行失败:', error);
          new Notice(`测试套件失败: ${error.message}`);
        }
      }, 100);

    } catch (error) {
      console.error('❌ [DevTestHelper] 测试套件启动失败:', error);
      new Notice(`测试套件启动失败: ${error.message}`);
    }
  }

  /**
   * 测试二级标题解析
   */
  async testH2Parsing(): Promise<void> {
    try {
      new Notice('开始二级标题解析测试...');
      
      const { testH2Parsing } = await import('../tests/test-runner');
      
      setTimeout(() => {
        try {
          testH2Parsing();
          new Notice('二级标题测试完成，请查看控制台输出');
        } catch (error) {
          console.error('❌ 二级标题测试失败:', error);
          new Notice(`二级标题测试失败: ${error.message}`);
        }
      }, 100);

    } catch (error) {
      console.error('❌ [DevTestHelper] 二级标题测试启动失败:', error);
      new Notice(`二级标题测试启动失败: ${error.message}`);
    }
  }

  /**
   * 测试内容保护机制
   */
  async testContentProtection(): Promise<void> {
    try {
      new Notice('开始内容保护测试...');
      
      const { testContentProtection } = await import('../tests/test-runner');
      
      setTimeout(() => {
        try {
          testContentProtection();
          new Notice('内容保护测试完成，请查看控制台输出');
        } catch (error) {
          console.error('❌ 内容保护测试失败:', error);
          new Notice(`内容保护测试失败: ${error.message}`);
        }
      }, 100);

    } catch (error) {
      console.error('❌ [DevTestHelper] 内容保护测试启动失败:', error);
      new Notice(`内容保护测试启动失败: ${error.message}`);
    }
  }

  /**
   * 性能测试
   */
  async testPerformance(): Promise<void> {
    try {
      new Notice('开始性能测试...');
      
      const { testPerformance } = await import('../tests/test-runner');
      
      setTimeout(() => {
        try {
          testPerformance();
          new Notice('性能测试完成，请查看控制台输出');
        } catch (error) {
          console.error('❌ 性能测试失败:', error);
          new Notice(`性能测试失败: ${error.message}`);
        }
      }, 100);

    } catch (error) {
      console.error('❌ [DevTestHelper] 性能测试启动失败:', error);
      new Notice(`性能测试启动失败: ${error.message}`);
    }
  }
}

/**
 * 测试结果模态窗
 */
class TestResultModal extends require('obsidian').Modal {
  constructor(app: any, private result: {
    originalText: string;
    parseResult: any;
    cardData: any;
  }) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // 标题
    contentEl.createEl('h2', { text: '智能解析测试结果' });

    // 原始文本
    const originalSection = contentEl.createDiv('test-result-section');
    originalSection.createEl('h3', { text: '原始文本' });
    const originalPre = originalSection.createEl('pre');
    originalPre.textContent = this.result.originalText;
    originalPre.style.backgroundColor = '#f5f5f5';
    originalPre.style.padding = '10px';
    originalPre.style.borderRadius = '4px';
    originalPre.style.maxHeight = '200px';
    originalPre.style.overflow = 'auto';

    // 解析结果
    const parseSection = contentEl.createDiv('test-result-section');
    parseSection.createEl('h3', { text: '解析结果' });
    
    const parseInfo = parseSection.createDiv();
    parseInfo.innerHTML = `
      <p><strong>解析模式:</strong> ${this.result.parseResult.pattern}</p>
      <p><strong>置信度:</strong> ${this.result.parseResult.confidence}</p>
      <p><strong>成功状态:</strong> ${this.result.parseResult.success ? '✅ 成功' : '❌ 失败'}</p>
      <p><strong>提取字段:</strong> ${Object.keys(this.result.parseResult.fields).join(', ')}</p>
    `;

    // 字段详情
    const fieldsSection = parseSection.createDiv();
    fieldsSection.createEl('h4', { text: '提取的字段' });
    for (const [key, value] of Object.entries(this.result.parseResult.fields)) {
      const fieldDiv = fieldsSection.createDiv();
      fieldDiv.innerHTML = `<strong>${key}:</strong> ${String(value).substring(0, 100)}${String(value).length > 100 ? '...' : ''}`;
      fieldDiv.style.marginBottom = '5px';
      fieldDiv.style.padding = '5px';
      fieldDiv.style.backgroundColor = '#f9f9f9';
      fieldDiv.style.borderRadius = '3px';
    }

    // 卡片数据
    const cardSection = contentEl.createDiv('test-result-section');
    cardSection.createEl('h3', { text: '卡片数据' });
    
    const cardInfo = cardSection.createDiv();
    cardInfo.innerHTML = `
      <p><strong>选择模板:</strong> ${this.result.cardData.templateName}</p>
      <p><strong>模板ID:</strong> ${this.result.cardData.templateId}</p>
      <p><strong>UUID:</strong> ${this.result.cardData.uuid}</p>
      <p><strong>内容保护:</strong> ${this.result.cardData.notes === this.result.originalText ? '✅ 正确' : '❌ 失败'}</p>
    `;

    // 关闭按钮
    const buttonDiv = contentEl.createDiv();
    buttonDiv.style.textAlign = 'center';
    buttonDiv.style.marginTop = '20px';
    
    const closeButton = buttonDiv.createEl('button', { text: '关闭' });
    closeButton.onclick = () => this.close();
    closeButton.style.padding = '8px 16px';
    closeButton.style.backgroundColor = '#007acc';
    closeButton.style.color = 'white';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '4px';
    closeButton.style.cursor = 'pointer';
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * 创建开发者测试助手实例
 */
export function createDevTestHelper(plugin: AnkiPlugin): DevTestHelper {
  return new DevTestHelper(plugin);
}
