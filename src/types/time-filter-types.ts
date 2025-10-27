/**
 * 时间筛选类型定义
 * 基于Anki的时间筛选功能
 */

export type TimeFilterType = 
  | 'today'              // 今天（今天到期或需要复习的）
  | 'due-today'          // 今天到期的
  | 'added-today'        // 今天添加的
  | 'edited-today'       // 今天编辑的
  | 'reviewed-today'     // 今天复习的
  | 'first-review'       // 首次复习的（学习中状态）
  | 'retry-today'        // 今天重来的（重新学习状态）
  | 'never-reviewed'     // 从未复习
  | null;

export interface TimeFilterOption {
  value: TimeFilterType;
  label: string;
  icon: string;
  description?: string;
}

/**
 * 时间筛选配置
 */
export const TIME_FILTER_OPTIONS: TimeFilterOption[] = [
  { 
    value: null, 
    label: '全部', 
    icon: 'calendar',
    description: '显示所有卡片'
  },
  { 
    value: 'today', 
    label: '今天', 
    icon: 'sun',
    description: '今天到期或需要复习的卡片'
  },
  { 
    value: 'due-today', 
    label: '今天到期的', 
    icon: 'clock',
    description: '今天到期的卡片'
  },
  { 
    value: 'added-today', 
    label: '今天添加的', 
    icon: 'plus-circle',
    description: '今天新添加的卡片'
  },
  { 
    value: 'edited-today', 
    label: '今天编辑的', 
    icon: 'edit',
    description: '今天修改过的卡片'
  },
  { 
    value: 'reviewed-today', 
    label: '今天复习的', 
    icon: 'check-circle',
    description: '今天已复习过的卡片'
  },
  { 
    value: 'first-review', 
    label: '首次复习的', 
    icon: 'zap',
    description: '处于学习中状态的卡片'
  },
  { 
    value: 'retry-today', 
    label: '今天重来的', 
    icon: 'rotate-cw',
    description: '今天重新学习的卡片'
  },
  { 
    value: 'never-reviewed', 
    label: '从未复习', 
    icon: 'inbox',
    description: '从未复习过的新卡片'
  }
];


