/**
 * 牌组网格卡片配色系统
 * 
 * 色卡极简风格配色方案
 * 每个牌组根据ID随机分配一种配色风格
 */

/**
 * 配色方案接口
 */
export interface ColorScheme {
  id: string;
  name: string;
  // 三种状态的配色
  urgent: ColorConfig;
  normal: ColorConfig;
  completed: ColorConfig;
  // 信息条配色
  infoBar: {
    background: string;
    textColor: string;
  };
}

/**
 * 单个状态的配色配置
 */
export interface ColorConfig {
  gradient: string;      // CSS 渐变背景
  textColor: string;     // 文字颜色
}

/**
 * 5种配色方案（完全基于HTML展示文档）
 */
export const COLOR_SCHEMES: ColorScheme[] = [
  // 方案A：冷色调系列
  {
    id: 'cool',
    name: '冷色调系列',
    urgent: {
      gradient: 'linear-gradient(135deg, #3A3E6C 0%, #2A2E4C 100%)',
      textColor: '#E8DCC4'
    },
    normal: {
      gradient: 'linear-gradient(135deg, #8387C3 0%, #6367A3 100%)',
      textColor: '#FFFFFF'
    },
    completed: {
      gradient: 'linear-gradient(135deg, #959BB5 0%, #757B95 100%)',
      textColor: '#FFFFFF'
    },
    infoBar: {
      background: 'rgba(0, 0, 0, 0.25)',
      textColor: 'rgba(255, 255, 255, 0.95)'
    }
  },
  
  // 方案B：粉紫色系列
  {
    id: 'pink',
    name: '粉紫色系列',
    urgent: {
      gradient: 'linear-gradient(135deg, #4B1535 0%, #3B0525 100%)',
      textColor: '#F3C8DD'
    },
    normal: {
      gradient: 'linear-gradient(135deg, #71557A 0%, #61456A 100%)',
      textColor: '#F3E5F5'
    },
    completed: {
      gradient: 'linear-gradient(135deg, #D186A9 0%, #C176A9 100%)',
      textColor: '#FFFFFF'
    },
    infoBar: {
      background: 'rgba(0, 0, 0, 0.25)',
      textColor: 'rgba(255, 255, 255, 0.95)'
    }
  },
  
  // 方案C：绿色系列
  {
    id: 'green',
    name: '绿色系列',
    urgent: {
      gradient: 'linear-gradient(135deg, #122B1D 0%, #0A1B0D 100%)',
      textColor: '#E8F5E9'
    },
    normal: {
      gradient: 'linear-gradient(135deg, #537E72 0%, #436E62 100%)',
      textColor: '#FFFFFF'
    },
    completed: {
      gradient: 'linear-gradient(135deg, #9CC97F 0%, #8CB96F 100%)',
      textColor: '#1B4D3E'
    },
    infoBar: {
      background: 'rgba(0, 0, 0, 0.25)',
      textColor: 'rgba(255, 255, 255, 0.95)'
    }
  },
  
  // 方案D：自然混合系列
  {
    id: 'nature',
    name: '自然混合系列',
    urgent: {
      gradient: 'linear-gradient(135deg, #2D4B48 0%, #1D3B38 100%)',
      textColor: '#E8F5E9'
    },
    normal: {
      gradient: 'linear-gradient(135deg, #5C8966 0%, #4C7956 100%)',
      textColor: '#FFFFFF'
    },
    completed: {
      gradient: 'linear-gradient(135deg, #7BB497 0%, #6BA487 100%)',
      textColor: '#1A3A2E'
    },
    infoBar: {
      background: 'rgba(0, 0, 0, 0.25)',
      textColor: 'rgba(255, 255, 255, 0.95)'
    }
  },
  
  // 方案E：现代扁平纯色
  {
    id: 'flat',
    name: '现代扁平纯色',
    urgent: {
      gradient: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
      textColor: '#FFFFFF'
    },
    normal: {
      gradient: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
      textColor: '#FFFFFF'
    },
    completed: {
      gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
      textColor: '#FFFFFF'
    },
    infoBar: {
      background: 'rgba(0, 0, 0, 0.25)',
      textColor: 'rgba(255, 255, 255, 0.95)'
    }
  }
];

/**
 * 简单哈希函数
 * 将字符串转换为稳定的数字
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // 转为32位整数
  }
  return Math.abs(hash);
}

/**
 * 根据牌组ID获取配色方案
 * 同一个牌组ID始终返回相同的配色
 */
export function getColorSchemeForDeck(deckId: string): ColorScheme {
  const hash = simpleHash(deckId);
  const index = hash % COLOR_SCHEMES.length;
  return COLOR_SCHEMES[index];
}

/**
 * 卡片状态类型
 */
export type CardState = 'urgent' | 'normal' | 'completed';

/**
 * 根据统计数据判断卡片状态
 */
export function getCardState(newCards: number, learningCards: number, reviewCards: number): CardState {
  const totalDue = newCards + learningCards + reviewCards;
  
  if (totalDue === 0) {
    return 'completed';
  }
  
  if (totalDue > 20) {
    return 'urgent';
  }
  
  return 'normal';
}

/**
 * 获取指定牌组和状态的配色
 */
export function getColorConfigForDeck(
  deckId: string,
  state: CardState
): ColorConfig {
  const scheme = getColorSchemeForDeck(deckId);
  return scheme[state];
}

