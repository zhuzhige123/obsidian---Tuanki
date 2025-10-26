/**
 * 选择题界面演示
 * 展示新的Cursor风格选择题界面功能
 */

import { ChoiceCardRenderer } from '../components/preview/renderers/ChoiceCardRenderer';
import type { PreviewData, PreviewOptions } from '../components/preview/ContentPreviewEngine';

export class ChoiceUIDemo {
  private renderer: ChoiceCardRenderer;
  private container: HTMLElement;

  constructor(plugin: any, container: HTMLElement) {
    this.renderer = new ChoiceCardRenderer(plugin);
    this.container = container;
  }

  /**
   * 运行选择题界面演示
   */
  async runDemo(): Promise<void> {
    console.log('🎯 开始选择题界面演示');

    // 清空容器
    this.container.innerHTML = '';

    // 创建演示标题
    const title = document.createElement('h2');
    title.textContent = '选择题界面演示 - Cursor风格设计';
    title.style.cssText = `
      color: var(--text-normal);
      margin-bottom: 2rem;
      text-align: center;
      font-size: 1.5rem;
      font-weight: 600;
    `;
    this.container.appendChild(title);

    // 演示1: 单选题
    await this.demonstrateSingleChoice();

    // 演示2: 多选题
    await this.demonstrateMultipleChoice();

    // 演示3: 复杂选择题
    await this.demonstrateComplexChoice();

    console.log('✅ 选择题界面演示完成');
  }

  /**
   * 演示单选题
   */
  private async demonstrateSingleChoice(): Promise<void> {
    const section = this.createDemoSection('单选题演示', '经典的单选题格式，点击选项自动提交答案');

    const singleChoiceData: PreviewData = {
      cardType: 'multiple-choice',
      metadata: {
        cardId: 'demo-single-choice',
        sourceFile: 'demo.md',
        lastModified: Date.now()
      },
      sections: [
        {
          id: 'question',
          type: 'front',
          content: '以下哪个是JavaScript的原始数据类型？',
          renderMode: 'markdown',
          animations: [],
          interactivity: { enabled: false }
        },
        {
          id: 'options',
          type: 'options',
          content: 'A. Object\nB. Array\nC. String\nD. Function',
          renderMode: 'mixed',
          animations: [],
          interactivity: { enabled: true },
          metadata: {
            options: [
              { label: 'A', text: 'Object', index: 0 },
              { label: 'B', text: 'Array', index: 1 },
              { label: 'C', text: 'String', index: 2 },
              { label: 'D', text: 'Function', index: 3 }
            ],
            correctAnswers: ['C'],
            allowMultiple: false
          }
        },
        {
          id: 'explanation',
          type: 'explanation',
          content: 'String是JavaScript的七种原始数据类型之一。Object、Array和Function都是引用类型。',
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

    const options: PreviewOptions = {
      themeMode: 'auto',
      enableAnimations: true,
      showAnswer: false,
      maxHeight: 500
    };

    const choiceCard = this.renderer.renderChoiceCard(singleChoiceData, options);
    section.appendChild(choiceCard);
    this.container.appendChild(section);
  }

  /**
   * 演示多选题
   */
  private async demonstrateMultipleChoice(): Promise<void> {
    const section = this.createDemoSection('多选题演示', '支持多个选项选择，需要手动提交答案');

    const multipleChoiceData: PreviewData = {
      cardType: 'multiple-choice',
      metadata: {
        cardId: 'demo-multiple-choice',
        sourceFile: 'demo.md',
        lastModified: Date.now()
      },
      sections: [
        {
          id: 'question',
          type: 'front',
          content: '以下哪些是前端开发框架？（多选）',
          renderMode: 'markdown',
          animations: [],
          interactivity: { enabled: false }
        },
        {
          id: 'options',
          type: 'options',
          content: 'A. React\nB. Vue.js\nC. Django\nD. Angular\nE. Express.js',
          renderMode: 'mixed',
          animations: [],
          interactivity: { enabled: true },
          metadata: {
            options: [
              { label: 'A', text: 'React', index: 0 },
              { label: 'B', text: 'Vue.js', index: 1 },
              { label: 'C', text: 'Django', index: 2 },
              { label: 'D', text: 'Angular', index: 3 },
              { label: 'E', text: 'Express.js', index: 4 }
            ],
            correctAnswers: ['A', 'B', 'D'],
            allowMultiple: true
          }
        },
        {
          id: 'explanation',
          type: 'explanation',
          content: 'React、Vue.js和Angular都是前端框架。Django是Python后端框架，Express.js是Node.js后端框架。',
          renderMode: 'markdown',
          animations: [],
          interactivity: { enabled: false }
        }
      ],
      renderingHints: {
        preferredHeight: 500,
        enableAnimations: true,
        themeMode: 'auto'
      }
    };

    const options: PreviewOptions = {
      themeMode: 'auto',
      enableAnimations: true,
      showAnswer: false,
      maxHeight: 600
    };

    const choiceCard = this.renderer.renderChoiceCard(multipleChoiceData, options);
    section.appendChild(choiceCard);
    this.container.appendChild(section);
  }

  /**
   * 演示复杂选择题
   */
  private async demonstrateComplexChoice(): Promise<void> {
    const section = this.createDemoSection('复杂选择题演示', '包含代码和详细解析的选择题');

    const complexChoiceData: PreviewData = {
      cardType: 'multiple-choice',
      metadata: {
        cardId: 'demo-complex-choice',
        sourceFile: 'demo.md',
        lastModified: Date.now()
      },
      sections: [
        {
          id: 'question',
          type: 'front',
          content: '以下代码的输出结果是什么？\n\n```javascript\nconsole.log(typeof null);\nconsole.log(typeof undefined);\n```',
          renderMode: 'markdown',
          animations: [],
          interactivity: { enabled: false }
        },
        {
          id: 'options',
          type: 'options',
          content: 'A. "null", "undefined"\nB. "object", "undefined"\nC. "null", "object"\nD. "object", "object"',
          renderMode: 'mixed',
          animations: [],
          interactivity: { enabled: true },
          metadata: {
            options: [
              { label: 'A', text: '"null", "undefined"', index: 0 },
              { label: 'B', text: '"object", "undefined"', index: 1 },
              { label: 'C', text: '"null", "object"', index: 2 },
              { label: 'D', text: '"object", "object"', index: 3 }
            ],
            correctAnswers: ['B'],
            allowMultiple: false
          }
        },
        {
          id: 'explanation',
          type: 'explanation',
          content: '这是JavaScript的一个著名"特性"：`typeof null`返回`"object"`，这是一个历史遗留的bug。而`typeof undefined`正确返回`"undefined"`。',
          renderMode: 'markdown',
          animations: [],
          interactivity: { enabled: false }
        }
      ],
      renderingHints: {
        preferredHeight: 600,
        enableAnimations: true,
        themeMode: 'auto'
      }
    };

    const options: PreviewOptions = {
      themeMode: 'auto',
      enableAnimations: true,
      showAnswer: true, // 显示解析
      maxHeight: 700
    };

    const choiceCard = this.renderer.renderChoiceCard(complexChoiceData, options);
    section.appendChild(choiceCard);
    this.container.appendChild(section);
  }

  /**
   * 创建演示区块
   */
  private createDemoSection(title: string, description: string): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = `
      margin-bottom: 3rem;
      padding: 2rem;
      border: 1px solid var(--background-modifier-border);
      border-radius: 12px;
      background: var(--background-secondary);
    `;

    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = title;
    sectionTitle.style.cssText = `
      color: var(--text-normal);
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
      font-weight: 600;
    `;

    const sectionDesc = document.createElement('p');
    sectionDesc.textContent = description;
    sectionDesc.style.cssText = `
      color: var(--text-muted);
      margin: 0 0 1.5rem 0;
      font-size: 0.875rem;
      line-height: 1.5;
    `;

    section.appendChild(sectionTitle);
    section.appendChild(sectionDesc);

    return section;
  }

  /**
   * 清理演示
   */
  cleanup(): void {
    this.container.innerHTML = '';
    this.renderer.reset();
  }
}

/**
 * 启动选择题界面演示
 */
export async function startChoiceUIDemo(plugin: any, container: HTMLElement): Promise<ChoiceUIDemo> {
  const demo = new ChoiceUIDemo(plugin, container);
  await demo.runDemo();
  return demo;
}
