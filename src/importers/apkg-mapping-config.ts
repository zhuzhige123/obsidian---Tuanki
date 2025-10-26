// APKG到tuanki数据映射配置
// 定义APKG数据结构到tuanki数据模型的转换规则

import type { Card, Deck, DeckSettings, FSRSCard, ReviewLog } from "../data/types";
import { CardState, Rating, CardType } from "../data/types";

/**
 * APKG数据接口定义
 */
export interface APKGData {
  // SQLite col表数据
  collection: {
    id: number;
    crt: number; // 创建时间戳(秒)
    mod: number; // 修改时间戳(毫秒)
    conf: string; // JSON配置
    models: string; // JSON模型定义
    decks: string; // JSON牌组定义
    dconf: string; // JSON牌组配置
    tags: string; // 标签缓存
  };

  // 解析后的数据（可选）
  models?: AnkiModel[];
  decks?: AnkiDeck[];
  
  // SQLite notes表数据
  notes: Array<{
    id: number;
    guid: string;
    mid: number; // 模型ID
    mod: number; // 修改时间戳(秒)
    usn: number; // 更新序列号
    tags: string; // 标签（空格分隔）
    flds: string; // 字段内容（0x1f分隔）
    sfld: number; // 排序字段
    csum: number; // 校验和
  }>;
  
  // SQLite cards表数据
  cards: Array<{
    id: number;
    nid: number; // 笔记ID
    did: number; // 牌组ID
    ord: number; // 卡片序号
    mod: number; // 修改时间戳(秒)
    usn: number; // 更新序列号
    type: number; // 卡片类型：0=新卡,1=学习,2=复习,3=重学
    queue: number; // 队列状态
    due: number; // 到期时间
    ivl: number; // 间隔天数
    factor: number; // 难度因子(千分比)
    reps: number; // 复习次数
    lapses: number; // 遗忘次数
    left: number; // 剩余学习次数
    odue: number; // 原始到期时间
    odid: number; // 原始牌组ID
    flags: number; // 标记
    data: string; // 额外数据
  }>;
  
  // SQLite revlog表数据
  reviewLogs: Array<{
    id: number;
    cid: number; // 卡片ID
    usn: number; // 更新序列号
    ease: number; // 评分：1=重来,2=困难,3=良好,4=简单
    ivl: number; // 间隔
    lastIvl: number; // 上次间隔
    factor: number; // 难度因子
    time: number; // 用时(毫秒)
    type: number; // 类型：0=学习,1=复习,2=重学,3=过滤,4=手动
  }>;
  
  // 媒体文件映射
  media: Record<string, string>;
}

/**
 * Anki模型定义接口
 */
export interface AnkiModel {
  id: number;
  name: string;
  type: number; // 0=普通卡片,1=挖空卡片
  flds: Array<{
    name: string;
    ord: number;
    sticky: boolean;
    rtl: boolean;
    font: string;
    size: number;
    description?: string;
  }>;
  tmpls: Array<{
    name: string;
    ord: number;
    qfmt: string; // 问题格式
    afmt: string; // 答案格式
    bqfmt?: string;
    bafmt?: string;
    did?: number;
  }>;
  css: string;
  did?: number;
  req: any[];
  tags?: string[];
}

/**
 * Anki牌组定义接口  
 */
export interface AnkiDeck {
  id: number;
  name: string;
  collapsed: boolean;
  browserCollapsed: boolean;
  desc: string;
  dyn: number; // 0=普通牌组,1=过滤牌组
  conf?: number; // 配置组ID
  usn: number;
  mod: number;
}

/**
 * 数据映射工具类
 */
export class APKGMappingConfig {
  
  /**
   * 将Anki时间戳转换为ISO字符串
   */
  static convertAnkiTimestamp(ankiTimestamp: number, isMilliseconds = false): string {
    const timestamp = isMilliseconds ? ankiTimestamp : ankiTimestamp * 1000;
    return new Date(timestamp).toISOString();
  }
  
  /**
   * 将Anki卡片类型映射到tuanki CardType
   */
  static mapCardType(ankiModel: AnkiModel): CardType {
    if (ankiModel.type === 1) {
      return CardType.Cloze; // 挖空卡片
    }

    // 根据模板数量和内容判断卡片类型
    if (ankiModel.tmpls.length === 1) {
      return CardType.Basic; // 基础卡片
    }

    // 检查是否包含选择题特征
    const hasMultipleChoice = ankiModel.tmpls.some(tmpl =>
      tmpl.qfmt.includes("{{type:") ||
      tmpl.qfmt.includes("choice") ||
      tmpl.afmt.includes("choice")
    );

    if (hasMultipleChoice) {
      return CardType.Multiple; // 多选卡片
    }

    // 检查是否包含代码特征
    const hasCode = ankiModel.tmpls.some(tmpl =>
      tmpl.qfmt.includes("<code>") ||
      tmpl.qfmt.includes("{{code") ||
      (tmpl as any).css?.includes("code") ||
      (tmpl as any).css?.includes("pre")
    );

    if (hasCode) {
      return CardType.Code; // 代码卡片
    }

    return CardType.Basic; // 默认基础卡片
  }
  
  /**
   * 映射Anki卡片状态到tuanki CardState
   */
  static mapCardState(ankiCardType: number): CardState {
    switch (ankiCardType) {
      case 0: return CardState.New;
      case 1: return CardState.Learning;
      case 2: return CardState.Review;
      case 3: return CardState.Relearning;
      default: return CardState.New;
    }
  }
  
  /**
   * 映射Anki评分到tuanki Rating
   */
  static mapRating(ankiEase: number): Rating {
    switch (ankiEase) {
      case 1: return Rating.Again;
      case 2: return Rating.Hard;
      case 3: return Rating.Good;
      case 4: return Rating.Easy;
      default: return Rating.Good;
    }
  }
  
  /**
   * 解析Anki字段内容（0x1f分隔）
   */
  static parseAnkiFields(fieldsString: string, modelFields: AnkiModel['flds']): Record<string, string> {
    const fieldValues = fieldsString.split('\x1f');
    const fields: Record<string, string> = {};
    
    modelFields.forEach((field, index) => {
      fields[field.name] = fieldValues[index] || '';
    });
    
    return fields;
  }

  /**
   * 根据用户定义的映射转换字段对象
   */
  static applyFieldMapping(
    ankiFields: Record<string, string>, 
    mapping: Record<string, string>
  ): Record<string, string> {
    const tuankiFields: Record<string, string> = {};
    for (const ankiFieldName in ankiFields) {
      const tuankiFieldName = mapping[ankiFieldName];
      if (tuankiFieldName) {
        tuankiFields[tuankiFieldName] = ankiFields[ankiFieldName];
      }
    }
    // 确保核心字段存在，即使没有映射
    if (!tuankiFields.question) tuankiFields.question = '';
    if (!tuankiFields.answer) tuankiFields.answer = '';
    
    return tuankiFields;
  }
  
  /**
   * 生成tuanki默认牌组设置
   */
  static generateDefaultDeckSettings(): DeckSettings {
    return {
      newCardsPerDay: 20,
      maxReviewsPerDay: 200,
      enableAutoAdvance: false,
      showAnswerTime: 0,
      fsrsParams: {
        // 使用标准FSRS6默认权重参数 (21个参数)
        w: [
          0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
          0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729,
          0.5425, 0.0912, 0.0658, 0.1542
        ],
        requestRetention: 0.9,
        maximumInterval: 36500,
        enableFuzz: true
      },
      learningSteps: [1, 10],
      relearningSteps: [10],
      graduatingInterval: 1,
      easyInterval: 4
    };
  }
  
  /**
   * 创建默认FSRS卡片状态
   */
  static createDefaultFSRSCard(): FSRSCard {
    const now = new Date().toISOString();
    return {
      due: now,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
      lastReview: now,
      retrievability: 0
    };
  }
  
  /**
   * 从Anki卡片数据创建FSRS状态
   */
  static createFSRSFromAnkiCard(ankiCard: APKGData['cards'][0]): FSRSCard {
    // Anki的due字段含义：
    // - 对于新卡片(type=0): due是在学习队列中的位置
    // - 对于学习卡片(type=1): due是Unix时间戳(秒)
    // - 对于复习卡片(type=2): due是相对于集合创建时间的天数
    let dueDate: string;
    
    if (ankiCard.type === 0) {
      // 新卡片：设为当前时间
      dueDate = new Date().toISOString();
    } else if (ankiCard.type === 1) {
      // 学习卡片：due是时间戳
      dueDate = this.convertAnkiTimestamp(ankiCard.due);
    } else {
      // 复习卡片：due是天数，需要转换为绝对日期
      const baseDate = new Date(1970, 0, 1); // Anki基准日期
      const dueTimestamp = baseDate.getTime() + (ankiCard.due * 24 * 60 * 60 * 1000);
      dueDate = new Date(dueTimestamp).toISOString();
    }
    
    return {
      due: dueDate,
      stability: Math.max(0, ankiCard.ivl || 0),
      difficulty: Math.max(1.3, Math.min(10, (ankiCard.factor / 1000) || 2.5)), // Anki存储为千分比，限制范围
      elapsedDays: 0, // 需要根据复习历史计算
      scheduledDays: Math.max(0, ankiCard.ivl || 0),
      reps: Math.max(0, ankiCard.reps || 0),
      lapses: Math.max(0, ankiCard.lapses || 0),
      state: this.mapCardState(ankiCard.type),
      lastReview: this.convertAnkiTimestamp(ankiCard.mod),
      retrievability: 0.9 // 默认值，可以根据算法调整
    };
  }
  
  /**
   * 从Anki复习记录创建ReviewLog
   */
  static createReviewLogFromAnki(ankiLog: APKGData['reviewLogs'][0]): ReviewLog {
    return {
      rating: this.mapRating(ankiLog.ease),
      state: ankiLog.type === 0 ? CardState.Learning : 
             ankiLog.type === 1 ? CardState.Review :
             ankiLog.type === 2 ? CardState.Relearning : CardState.New,
      due: this.convertAnkiTimestamp(ankiLog.id, true), // revlog.id是时间戳
      stability: ankiLog.ivl > 0 ? ankiLog.ivl : 0,
      difficulty: (ankiLog.factor / 1000) || 2.5,
      elapsedDays: ankiLog.lastIvl || 0,
      lastElapsedDays: ankiLog.lastIvl || 0,
      scheduledDays: ankiLog.ivl || 0,
      review: this.convertAnkiTimestamp(ankiLog.id, true)
    };
  }
  
  /**
   * 清理HTML内容，移除Anki特有标记
   */
  static cleanAnkiHTML(html: string): string {
    if (!html) return '';
    
    return html
      // 移除Anki模板语法
      .replace(/\{\{[^}]+\}\}/g, '')
      // 移除FrontSide引用
      .replace(/\{\{FrontSide\}\}/g, '')
      // 移除cloze标记
      .replace(/\{\{c\d+::/g, '')
      .replace(/\}\}/g, '')
      // 清理多余空白
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  /**
   * 提取纯文本内容
   */
  static extractPlainText(html: string): string {
    if (!html) return '';
    
    // 基础HTML标签移除
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
