/**
 * 卡片模态窗相关类型定义
 * 用于新建和编辑卡片的 Modal 封装
 */

import type { Card } from '../data/types';

/**
 * 创建卡片选项
 * 用于 plugin.openCreateCardModal() 方法
 */
export interface CreateCardOptions {
  /** 初始内容 */
  initialContent?: string;
  
  /** 已解析的卡片数据 */
  parsedCard?: Partial<Card>;
  
  /** 来源信息 */
  sourceInfo?: {
    /** 源文件路径 */
    file?: string;
    /** 块ID */
    blockId?: string;
    /** 块链接 */
    blockLink?: string;
  };
  
  /** 选定的模板ID */
  selectedTemplate?: string;
  
  /** 字段内容映射 */
  contentMapping?: Record<string, string>;
  
  /** 成功回调 */
  onSuccess?: (card: Card) => void;
  
  /** 取消回调 */
  onCancel?: () => void;
}

/**
 * 编辑卡片选项
 * 用于 plugin.openEditCardModal() 方法（可选功能）
 */
export interface EditCardOptions {
  /** 要编辑的卡片 */
  card: Card;
  
  /** 成功回调 */
  onSuccess?: (card: Card) => void;
  
  /** 取消回调 */
  onCancel?: () => void;
}

/**
 * CardEditorModal 构造选项
 * 内部使用，统一新建和编辑的参数
 */
export interface CardEditorModalOptions {
  /** 编辑模式 */
  mode: 'create' | 'edit';
  
  /** 卡片数据 */
  card: Card;
  
  /** 是否新建卡片 */
  isNew?: boolean;
  
  /** 初始内容（可选，用于拖拽创建等场景） */
  initialContent?: string;
  
  /** 内容映射（可选，用于字段预填充） */
  contentMapping?: Record<string, string>;
  
  /** 保存成功回调 */
  onSave?: (updatedCard: Card) => void | Promise<void>;
  
  /** 取消回调 */
  onCancel?: () => void;
}










