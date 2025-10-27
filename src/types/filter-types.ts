/**
 * 筛选系统类型定义
 * 支持高级筛选条件构建和保存
 */

/**
 * 筛选条件字段类型
 */
export type FilterField = 
  | 'status'           // 卡片状态
  | 'deck'             // 所属牌组
  | 'tags'             // 标签
  | 'priority'         // 优先级
  | 'created'          // 创建时间
  | 'modified'         // 修改时间
  | 'due'              // 到期时间
  | 'difficulty'       // 难度
  | 'stability'        // 稳定性
  | 'source_document'  // 源文档
  | 'front'            // 正面内容
  | 'back';            // 背面内容

/**
 * 筛选操作符
 */
export type FilterOperator = 
  | 'equals'           // 等于
  | 'not_equals'       // 不等于
  | 'contains'         // 包含
  | 'not_contains'     // 不包含
  | 'starts_with'      // 开始于
  | 'ends_with'        // 结束于
  | 'greater_than'     // 大于
  | 'less_than'        // 小于
  | 'greater_equal'    // 大于等于
  | 'less_equal'       // 小于等于
  | 'is_empty'         // 为空
  | 'is_not_empty'     // 不为空
  | 'in_last'          // 在最近N天
  | 'not_in_last';     // 不在最近N天

/**
 * 字段配置（用于UI渲染）
 */
export interface FilterFieldConfig {
  field: FilterField;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect';
  operators: FilterOperator[];
  icon?: string;
}

/**
 * 操作符配置
 */
export interface FilterOperatorConfig {
  operator: FilterOperator;
  label: string;
  requiresValue: boolean;
  valueType?: 'text' | 'number' | 'date';
}

/**
 * 单个筛选条件
 */
export interface FilterCondition {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: string | number | Date | string[];
  enabled: boolean;
}

/**
 * 筛选条件组（支持AND/OR逻辑）
 */
export interface FilterGroup {
  id: string;
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}

/**
 * 完整筛选配置
 */
export interface FilterConfig {
  groups: FilterGroup[];
  globalLogic: 'AND' | 'OR'; // 组之间的逻辑关系
}

/**
 * 保存的筛选器
 */
export interface SavedFilter {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  config: FilterConfig;
  
  // 元数据
  createdAt: string;
  updatedAt: string;
  lastUsed?: string;
  useCount: number;
  isPinned: boolean;
  isBuiltIn: boolean;
}

/**
 * 筛选器存储结构
 */
export interface FilterStorage {
  version: string;
  savedFilters: SavedFilter[];
  recentFilterIds: string[];
  defaultFilterId?: string;
}

/**
 * 字段配置映射
 */
export const FILTER_FIELD_CONFIGS: FilterFieldConfig[] = [
  {
    field: 'status',
    label: '卡片状态',
    type: 'select',
    operators: ['equals', 'not_equals'],
    icon: 'circle-dot'
  },
  {
    field: 'deck',
    label: '所属牌组',
    type: 'select',
    operators: ['equals', 'not_equals'],
    icon: 'book'
  },
  {
    field: 'tags',
    label: '标签',
    type: 'multiselect',
    operators: ['contains', 'not_contains', 'is_empty', 'is_not_empty'],
    icon: 'tag'
  },
  {
    field: 'created',
    label: '创建时间',
    type: 'date',
    operators: ['greater_than', 'less_than', 'in_last', 'not_in_last'],
    icon: 'calendar-plus'
  },
  {
    field: 'modified',
    label: '修改时间',
    type: 'date',
    operators: ['greater_than', 'less_than', 'in_last', 'not_in_last'],
    icon: 'calendar-clock'
  },
  {
    field: 'due',
    label: '到期时间',
    type: 'date',
    operators: ['greater_than', 'less_than', 'in_last', 'not_in_last'],
    icon: 'clock'
  },
  {
    field: 'difficulty',
    label: '难度',
    type: 'number',
    operators: ['equals', 'greater_than', 'less_than', 'greater_equal', 'less_equal'],
    icon: 'gauge'
  },
  {
    field: 'stability',
    label: '稳定性',
    type: 'number',
    operators: ['equals', 'greater_than', 'less_than', 'greater_equal', 'less_equal'],
    icon: 'chart-line'
  },
  {
    field: 'source_document',
    label: '源文档',
    type: 'text',
    operators: ['equals', 'contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'],
    icon: 'file-text'
  },
  {
    field: 'front',
    label: '正面内容',
    type: 'text',
    operators: ['contains', 'not_contains', 'starts_with', 'ends_with'],
    icon: 'align-left'
  },
  {
    field: 'back',
    label: '背面内容',
    type: 'text',
    operators: ['contains', 'not_contains', 'starts_with', 'ends_with'],
    icon: 'align-right'
  }
];

/**
 * 操作符配置映射
 */
export const FILTER_OPERATOR_CONFIGS: FilterOperatorConfig[] = [
  { operator: 'equals', label: '等于', requiresValue: true, valueType: 'text' },
  { operator: 'not_equals', label: '不等于', requiresValue: true, valueType: 'text' },
  { operator: 'contains', label: '包含', requiresValue: true, valueType: 'text' },
  { operator: 'not_contains', label: '不包含', requiresValue: true, valueType: 'text' },
  { operator: 'starts_with', label: '开始于', requiresValue: true, valueType: 'text' },
  { operator: 'ends_with', label: '结束于', requiresValue: true, valueType: 'text' },
  { operator: 'greater_than', label: '大于', requiresValue: true, valueType: 'number' },
  { operator: 'less_than', label: '小于', requiresValue: true, valueType: 'number' },
  { operator: 'greater_equal', label: '大于等于', requiresValue: true, valueType: 'number' },
  { operator: 'less_equal', label: '小于等于', requiresValue: true, valueType: 'number' },
  { operator: 'is_empty', label: '为空', requiresValue: false },
  { operator: 'is_not_empty', label: '不为空', requiresValue: false },
  { operator: 'in_last', label: '在最近N天', requiresValue: true, valueType: 'number' },
  { operator: 'not_in_last', label: '不在最近N天', requiresValue: true, valueType: 'number' }
];

