/**
 * 演示数据生成工具
 * 用于开发和测试环境
 */

import type { Card } from "../types/card-types";

/**
 * 生成演示卡片数据
 * 
 * @param count - 要生成的卡片数量
 * @returns 演示卡片数组
 */
export function generateDemoCards(count: number): Card[] {
  const cards: Card[] = [];
  const decks = ["默认牌组", "英语学习", "编程知识", "历史知识", "科学常识"];
  const tags = ["重要", "复习", "考试", "基础", "进阶", "难点"];
  const states = ["new", "learning", "review", "relearning"] as const;
  
  const questionTemplates = [
    "什么是{topic}？",
    "{topic}的定义是什么？",
    "解释{topic}的概念。",
    "描述{topic}的特点。",
    "{topic}有哪些应用？"
  ];
  
  const topics = [
    "间隔重复",
    "记忆曲线",
    "主动回忆",
    "渐进阅读",
    "知识管理",
    "笔记系统",
    "学习方法",
    "认知科学",
    "神经可塑性",
    "元认知"
  ];
  
  const answerTemplates = [
    "{topic}是一种{description}的方法。它通过{mechanism}来提高{benefit}。",
    "{topic}的核心思想是{core}。实践中可以通过{practice}来实现。",
    "关于{topic}，需要理解以下几点：\n1. {point1}\n2. {point2}\n3. {point3}",
    "{topic}在{field}领域有广泛应用。主要优势包括{advantage1}和{advantage2}。"
  ];
  
  for (let i = 0; i < count; i++) {
    const topic = topics[i % topics.length];
    const questionTemplate = questionTemplates[i % questionTemplates.length];
    const answerTemplate = answerTemplates[i % answerTemplates.length];
    
    const question = questionTemplate.replace("{topic}", topic);
    const answer = answerTemplate
      .replace(/{topic}/g, topic)
      .replace("{description}", "高效学习")
      .replace("{mechanism}", "科学规律")
      .replace("{benefit}", "学习效果")
      .replace("{core}", "系统化思维")
      .replace("{practice}", "持续实践")
      .replace("{point1}", "理论基础")
      .replace("{point2}", "实践方法")
      .replace("{point3}", "注意事项")
      .replace("{field}", "教育")
      .replace("{advantage1}", "效率提升")
      .replace("{advantage2}", "知识巩固");
    
    // 随机选择状态
    const state = states[Math.floor(Math.random() * states.length)];
    
    // 根据状态设置 FSRS 数据
    const now = Date.now();
    const due = state === "new" ? now : now + Math.random() * 7 * 24 * 60 * 60 * 1000;
    
    const card: Card = {
      id: `demo-card-${i + 1}`,
      deckId: decks[i % decks.length],
      fields: {
        front: question,
        back: answer
      },
      tags: [tags[i % tags.length], tags[(i + 1) % tags.length]],
      templateId: "official-qa",
      fsrsData: {
        state: state,
        due: new Date(due).toISOString(),
        stability: state === "new" ? 0 : Math.random() * 100,
        difficulty: Math.random() * 10,
        elapsed_days: state === "new" ? 0 : Math.floor(Math.random() * 30),
        scheduled_days: state === "new" ? 0 : Math.floor(Math.random() * 30),
        reps: state === "new" ? 0 : Math.floor(Math.random() * 20),
        lapses: Math.floor(Math.random() * 3),
        last_review: state === "new" ? undefined : new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      createdAt: new Date(now - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      sourceNote: `demo-note-${i + 1}.md`
    };
    
    cards.push(card);
  }
  
  return cards;
}

/**
 * 模拟延迟（用于测试加载状态）
 * 
 * @param ms - 延迟毫秒数
 * @returns Promise
 */
export function simulateDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 生成随机卡片
 * 
 * @returns 单张演示卡片
 */
export function generateRandomCard(): Card {
  return generateDemoCards(1)[0];
}

/**
 * 生成指定状态的卡片
 * 
 * @param state - 卡片状态
 * @param count - 数量
 * @returns 演示卡片数组
 */
export function generateCardsByState(
  state: "new" | "learning" | "review" | "relearning",
  count: number
): Card[] {
  const cards = generateDemoCards(count);
  return cards.map(card => ({
    ...card,
    fsrsData: {
      ...card.fsrsData,
      state: state
    }
  }));
}
