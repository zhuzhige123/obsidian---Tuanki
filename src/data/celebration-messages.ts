import type { CongratulationMessage, NeuroScienceQuote } from '../types/celebration-types';

/**
 * 恭喜文案库（可爱风格）
 */
export const CONGRATULATION_MESSAGES: CongratulationMessage[] = [
  { emoji: '🎉', text: '太棒啦！你已经完成了今天的所有学习任务！' },
  { emoji: '✨', text: '哇哦！所有卡片都被你征服啦！' },
  { emoji: '🌟', text: '恭喜！大脑已经成功记住这些知识点啦！' },
  { emoji: '🎊', text: '完美！你的学习节奏把握得很好呢！' },
  { emoji: '💪', text: '干得漂亮！所有待学习的卡片都搞定了！' },
  { emoji: '🏆', text: '棒棒哒！又完成了一轮完美学习！' },
  { emoji: '🎯', text: '太厉害了！学习目标100%达成！' },
  { emoji: '🌈', text: '耶！知识的彩虹又多了一道！' }
];

/**
 * 神经科学名言库
 */
export const NEUROSCIENCE_QUOTES: NeuroScienceQuote[] = [
  {
    icon: '🧠',
    text: '间隔效应是记忆的黄金法则',
    author: 'Hermann Ebbinghaus',
    note: '艾宾浩斯遗忘曲线的发现者'
  },
  {
    icon: '💤',
    text: '睡眠是巩固记忆的最佳时间',
    author: '神经科学研究',
    note: '大脑在睡眠中整理和强化记忆'
  },
  {
    icon: '✍️',
    text: '主动回忆比被动复习效果好10倍',
    author: '认知心理学',
    note: '测试效应（Testing Effect）'
  },
  {
    icon: '🌱',
    text: '遗忘不是失败，而是学习的必要部分',
    author: 'Robert Bjork',
    note: 'UCLA 记忆研究专家'
  },
  {
    icon: '💎',
    text: '适度的困难能促进长期记忆',
    author: 'Desirable Difficulty',
    note: '合适的挑战让学习更有效'
  },
  {
    icon: '🔄',
    text: '重复是记忆之母',
    author: '古罗马谚语',
    note: '被现代神经科学证实'
  },
  {
    icon: '📚',
    text: '分散学习比集中学习效果更持久',
    author: '学习科学',
    note: '多次短时间学习优于一次长时间'
  },
  {
    icon: '🎯',
    text: '检索练习能让记忆更牢固',
    author: '认知心理学',
    note: '回忆过程本身就是学习'
  },
  {
    icon: '🌟',
    text: '情绪与记忆紧密相连',
    author: '神经科学',
    note: '带有情感的记忆更容易保留'
  },
  {
    icon: '🔬',
    text: '大脑喜欢模式和关联',
    author: '认知神经科学',
    note: '建立知识网络让学习更高效'
  },
  {
    icon: '⚡',
    text: '短暂的休息能提升学习效率',
    author: 'Pomodoro Technique',
    note: '劳逸结合，张弛有度'
  },
  {
    icon: '🎨',
    text: '多感官学习能加深记忆',
    author: '教育心理学',
    note: '视觉+听觉+动手效果最佳'
  }
];

/**
 * 鼓励语库
 */
export const ENCOURAGEMENTS: string[] = [
  '💡 根据遗忘曲线理论，适时复习是记忆的关键哦~',
  '🧠 大脑需要时间巩固记忆，休息一下也很重要！',
  '⏰ 间隔重复学习法能让记忆保持得更久呢~',
  '🎯 保持规律的学习节奏，效果会更好哦！',
  '🌱 知识就像种子，需要时间和重复才能生根发芽~',
  '✨ 每一次复习都在强化神经连接，继续加油！',
  '🌟 你的大脑正在变得越来越强大！',
  '💫 坚持就是胜利，你做得很棒！'
];

/**
 * 随机获取恭喜消息
 */
export function getRandomCongratulation(): CongratulationMessage {
  return CONGRATULATION_MESSAGES[
    Math.floor(Math.random() * CONGRATULATION_MESSAGES.length)
  ];
}

/**
 * 随机获取神经科学名言
 */
export function getRandomQuote(): NeuroScienceQuote {
  return NEUROSCIENCE_QUOTES[
    Math.floor(Math.random() * NEUROSCIENCE_QUOTES.length)
  ];
}

/**
 * 随机获取鼓励语
 */
export function getRandomEncouragement(): string {
  return ENCOURAGEMENTS[
    Math.floor(Math.random() * ENCOURAGEMENTS.length)
  ];
}


