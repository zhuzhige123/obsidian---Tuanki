/**
 * 简化卡片解析器测试
 */

import { SimplifiedCardParser } from './SimplifiedCardParser';
import { DEFAULT_SIMPLIFIED_PARSING_SETTINGS } from '../../types/newCardParsingTypes';
import type { ParseConfig, SingleCardParseConfig } from '../../types/newCardParsingTypes';
import { CardType } from '../../data/types';

describe('SimplifiedCardParser', () => {
  let parser: SimplifiedCardParser;
  let config: ParseConfig;

  beforeEach(() => {
    parser = new SimplifiedCardParser(DEFAULT_SIMPLIFIED_PARSING_SETTINGS);
    config = {
      settings: DEFAULT_SIMPLIFIED_PARSING_SETTINGS,
      scenario: 'newCard',
      enableValidation: true,
      enableStats: true
    };
  });

  afterEach(() => {
    parser.destroy();
    vi.restoreAllMocks();
  });

  describe('标签触发检查', () => {
    test('应该检测到触发标签', async () => {
      const content = '这是一个测试内容 #weave';
      const result = await parser.parseContent(content, config);
      expect(result.success).toBe(true);
    });

    test('应该跳过没有触发标签的内容', async () => {
      const content = '这是一个测试内容 #其他标签';
      const result = await parser.parseContent(content, config);
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('validation');
    });

    test('禁用标签触发时应该解析所有内容', async () => {
      const settingsWithoutTrigger = {
        ...DEFAULT_SIMPLIFIED_PARSING_SETTINGS,
        enableTagTrigger: false
      };
      const parserWithoutTrigger = new SimplifiedCardParser(settingsWithoutTrigger);
      
      const content = '这是一个测试内容';
      const result = await parserWithoutTrigger.parseContent(content, {
        ...config,
        settings: settingsWithoutTrigger
      });
      expect(result.success).toBe(true);
    });
  });

  describe('单卡解析', () => {
    test('应该解析基础问答题', async () => {
      const content = `## 什么是间隔重复？
间隔重复是一种学习方法。
---div---
间隔重复通过在最佳时机复习来提高记忆效率。
#学习方法 #weave`;

      const card = await parser.parseSingleCard(content, config as SingleCardParseConfig);
      
      expect(card).not.toBeNull();
      expect(card?.type).toBe(CardType.Basic);
      expect(card?.content).toContain('什么是间隔重复');
      expect(card?.content).toContain('最佳时机复习');
      expect(card?.tags).toContain('学习方法');
      expect(card?.tags).toContain('weave');
    });

    test('应该解析无背面的卡片', async () => {
      const content = `## 什么是FSRS算法？
FSRS是一种现代化的间隔重复算法。
#算法 #weave`;

      const card = await parser.parseSingleCard(content, config as SingleCardParseConfig);
      
      expect(card).not.toBeNull();
      expect(card?.type).toBe(CardType.Basic);
      expect(card?.content).toContain('FSRS算法');
      expect(card?.content).not.toContain('---div---');
      expect(card?.tags).toContain('算法');
    });

    test('应该检测挖空题', async () => {
      const content = `==艾宾浩斯遗忘曲线==表明人们在学习后会快速遗忘。
研究发现，在学习后的==20分钟==内会遗忘42%的内容。
#记忆科学 #weave`;

      const card = await parser.parseSingleCard(content, config as SingleCardParseConfig);
      
      expect(card).not.toBeNull();
      expect(card?.type).toBe('cloze');
      expect(card?.content).toContain('艾宾浩斯遗忘曲线');
      expect(card?.content).toContain('20分钟');
    });

    test('应该检测选择题', async () => {
      const content = `## Java中哪个不是基本数据类型？ #编程 #weave
A) int
B) boolean  
C) String
D) double
---div---
String是引用类型，不是基本数据类型。`;

      const card = await parser.parseSingleCard(content, config as SingleCardParseConfig);
      
      expect(card).not.toBeNull();
      expect(card?.type).toBe(CardType.Multiple);
      expect(card?.content).toContain('基本数据类型');
      expect(card?.content).toContain('引用类型');
    });
  });

  describe('批量解析', () => {
    test('应该解析批量卡片', async () => {
      const content = `<->
## 问题1：什么是Obsidian？
---div---
Obsidian是一款基于Markdown的知识管理工具。
#工具 #weave

<->

## 选择题：哪个是Markdown语法？ #语法 #weave
A) **粗体**
B) <b>粗体</b>
C) [粗体]
---div---
Markdown使用**文本**或__文本__表示粗体。

<->

间隔重复的核心是在==遗忘临界点==进行复习。
这样可以最大化==学习效率==。
#学习方法 #weave
<->`;

      const batchConfig = {
        ...config,
        scenario: 'batch' as const,
        maxCards: 10,
        skipErrors: true
      };

      const result = await parser.parseContent(content, batchConfig);
      
      expect(result.success).toBe(true);
      expect(result.cards).toHaveLength(3);
      
      // 检查第一张卡片
      expect(result.cards[0].type).toBe(CardType.Basic);
      expect(result.cards[0].content).toContain('Obsidian');
      
      // 检查第二张卡片
      expect(result.cards[1].type).toBe(CardType.Multiple);
      expect(result.cards[1].content).toContain('Markdown语法');
      
      // 检查第三张卡片
      expect(result.cards[2].type).toBe(CardType.Cloze);
      expect(result.cards[2].content).toContain('遗忘临界点');
    });
  });

  describe('模板验证', () => {
    test('应该验证有效的单字段模板', () => {
      const template = {
        id: 'test-template',
        name: '测试模板',
        type: 'single-field' as const,
        fields: [
          { name: 'Front', pattern: '^(.+?)(?=---div---|$)', isRegex: true, required: true },
          { name: 'Back', pattern: '(?<=---div---)(.+)$', isRegex: true, required: false }
        ],
        scenarios: ['newCard' as const]
      };

      const result = parser.validateTemplate(template);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('应该检测无效的模板', () => {
      const template = {
        id: 'invalid-template',
        name: '',
        type: 'single-field' as const,
        fields: [
          { name: '', pattern: '', isRegex: true, required: true }
        ],
        scenarios: []
      };

      const result = parser.validateTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('符号验证', () => {
    test('应该验证有效的符号配置', () => {
      const symbols = {
        rangeStart: '---start---',
        rangeEnd: '---end---',
        cardDelimiter: '---卡片---',
        faceDelimiter: '---div---',
        clozeMarker: '=='
      };

      const result = parser.validateSymbols(symbols);
      expect(result.isValid).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    test('应该检测重复的符号', () => {
      const symbols = {
        rangeStart: '---start---',
        rangeEnd: '---start---', // 重复
        cardDelimiter: '---卡片---',
        faceDelimiter: '---div---',
        clozeMarker: '=='
      };

      const result = parser.validateSymbols(symbols);
      expect(result.isValid).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    test('应该检测空符号', () => {
      const symbols = {
        rangeStart: '',
        rangeEnd: '---end---',
        cardDelimiter: '---卡片---',
        faceDelimiter: '---div---',
        clozeMarker: '=='
      };

      const result = parser.validateSymbols(symbols);
      expect(result.isValid).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('统计信息', () => {
    test('应该生成正确的统计信息', async () => {
      const content = `<->
## 问答题 #weave
答案内容
---div---
背面内容

<->

==挖空题==内容 #weave

<->

## 选择题 #weave
A) 正确答案
B) 错误答案
<->`;

      const result = await parser.parseContent(content, {
        ...config,
        scenario: 'batch'
      });

      expect(result.stats.totalCards).toBe(3);
      expect(result.stats.successfulCards).toBe(3);
      expect(result.stats.cardTypes[CardType.Basic]).toBe(1);
      expect(result.stats.cardTypes[CardType.Cloze]).toBe(1);
      expect(result.stats.cardTypes[CardType.Multiple]).toBe(1);
      expect(result.stats.processingTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('生命周期清理', () => {
    test('destroy 应该清理缓存定时器并重置内部状态', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      expect((parser as any).cacheCleanupInterval).not.toBeNull();

      parser.clearCache = vi.fn(parser.clearCache.bind(parser));
      parser.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(parser.clearCache).toHaveBeenCalledTimes(1);
      expect((parser as any).cacheCleanupInterval).toBeNull();
      expect((parser as any).lastCardsPosition).toBeUndefined();
    });
  });
});
