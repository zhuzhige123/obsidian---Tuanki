/**
 * 设置界面相关的常量定义
 * 消除硬编码，提供统一的配置管理
 */

import type { SettingsTab } from '../types/settings-types';

// 标签页配置
export const SETTINGS_TABS: SettingsTab[] = [
  { id: "basic", label: "基础" },
  { id: "fsrs6", label: "FSRS6算法" },
  { id: "annotation", label: "标注同步块" },
  { id: "card-parsing", label: "卡片解析" },
  { id: "ai-config", label: "AI制卡" },
  { id: "virtualization", label: "性能优化" },
  { id: "data-management", label: "数据管理" },
  { id: "anki-connect", label: "Anki 同步" },
  { id: "about", label: "关于" }
];

// 默认标签页
export const DEFAULT_ACTIVE_TAB = "basic";

// 链接样式选项
export const LINK_STYLES = {
  WIKILINK: 'wikilink',
  MARKDOWN: 'markdown'
} as const;

export const LINK_STYLE_OPTIONS = [
  { id: 'wikilink', label: 'Wikilink [[Page]]' },
  { id: 'markdown', label: 'Markdown [text](path)' }
];

// 链接路径选项
export const LINK_PATHS = {
  SHORT: 'short',
  RELATIVE: 'relative',
  ABSOLUTE: 'absolute'
} as const;

export const LINK_PATH_OPTIONS = [
  { id: 'short', label: '最短路径（文件名）' },
  { id: 'relative', label: '相对路径' },
  { id: 'absolute', label: '绝对路径' }
];

// 链接路径显示文本映射
export const LINK_PATH_DISPLAY_MAP: Record<string, string> = {
  short: '最短',
  relative: '相对',
  absolute: '绝对'
};



// 许可证类型
export const LICENSE_TYPES = {
  TRIAL: 'trial',
  STANDARD: 'standard',
  PREMIUM: 'premium'
} as const;

// 许可证状态
export const LICENSE_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  EXPIRED: 'expired',
  TRIAL: 'trial'
} as const;

// 许可证状态图标映射
export const LICENSE_STATUS_ICONS: Record<string, string> = {
  active: '✅',
  inactive: '⚠️',
  expired: '❌',
  trial: '🔄'
};

// 错误类型图标映射
export const ERROR_ICONS: Record<string, string> = {
  format: '🔍',
  expired: '⏰',
  device: '🔒',
  network: '🌐',
  permission: '🛡️',
  default: '❌'
};

// 通知持续时间
export const NOTIFICATION_DURATION = {
  SHORT: 3000,
  MEDIUM: 5000,
  LONG: 8000,
  ERROR: 5000,
  SUCCESS: 3000
} as const;

// 默认设置值
export const DEFAULT_SETTINGS = {
  DATA_FOLDER: 'tuanki',
  BACKUP_RETENTION_COUNT: 10,
  BACKUP_INTERVAL_HOURS: 24,
  ATTACHMENT_DIR: 'Tuanki Assets',
  MAX_FILES_PER_BATCH: 50,
  BATCH_START_MARKER: '<!-- tuanki-start -->',
  BATCH_END_MARKER: '<!-- tuanki-end -->',
  BATCH_TAG_MARKER: '#tuanki'
} as const;

// 编辑器模态窗尺寸预设
export const MODAL_SIZE_PRESETS = {
  small: { width: 600, height: 400, label: '小 (600×400)' },
  medium: { width: 700, height: 500, label: '中 (700×500)' },
  large: { width: 800, height: 600, label: '大 (800×600)' },
  'extra-large': { width: 1000, height: 700, label: '超大 (1000×700)' },
  custom: { width: 800, height: 600, label: '自定义' }
} as const;

// 模态窗尺寸限制
export const MODAL_SIZE_LIMITS = {
  MIN_WIDTH: 400,
  MAX_WIDTH: 1400,
  MIN_HEIGHT: 300,
  MAX_HEIGHT: 900,
  RESIZE_HANDLE_SIZE: 8 // 拖拽手柄大小(px)
} as const;

// 产品信息
export const PRODUCT_INFO = {
  NAME: 'Tuanki - 智能记忆卡片插件',
  VERSION: 'v0.5.0',
  ALGORITHM: 'FSRS6 (Free Spaced Repetition Scheduler v6.1.1)',
  PLATFORM: 'Obsidian',
  DEVELOPER: 'Tuanki 团队',
  LICENSE_MODEL: '免费插件 + 高级功能许可证'
} as const;

// 联系信息
export const CONTACT_INFO = {
  GITHUB_URL: 'https://github.com/zhuzhige123/obsidian---Tuanki',
  EMAIL: 'tutaoyuan8@outlook.com',
  SUPPORT_EMAIL_SUBJECT: 'Tuanki插件许可证购买咨询'
} as const;

// CSS 类名常量
export const CSS_CLASSES = {
  // 主容器
  SETTINGS_ROOT: 'anki-app settings-root',
  HEADER: 'header',
  TITLE: 'title',
  
  // 标签页
  TABS: 'tabs',
  
  // 卡片和区域
  CARD: 'card',
  SECTION: 'section',
  GROUP: 'settings-group',
  GROUP_HEADER: 'group-header',
  GROUP_CONTENT: 'group-content',
  
  // 表单元素
  ROW: 'row',
  MODERN_SWITCH: 'modern-switch',
  SWITCH_SLIDER: 'switch-slider',
  MODERN_SELECT: 'modern-select',
  
  // 许可证相关
  LICENSE_SECTION: 'license-section',
  LICENSE_STATUS: 'license-status',
  STATUS_INDICATOR: 'status-indicator',
  ACTIVATION_FORM: 'activation-form',
  ACTIVATION_INPUT: 'activation-input',
  ACTIVATION_BUTTON: 'activation-button',
  
  // 消息和通知
  MESSAGE: 'message',
  MESSAGE_SUCCESS: 'message success',
  MESSAGE_ERROR: 'message error',
  MESSAGE_ICON: 'message-icon',
  MESSAGE_CONTENT: 'message-content',
  

  
  // 工具栏
  TOOLBAR: 'toolbar',
  
  // 状态类
  VALID: 'valid',
  INVALID: 'invalid',
  LOADING: 'loading',
  DISABLED: 'disabled',
  ACTIVE: 'active',
  INACTIVE: 'inactive'
} as const;

// 验证规则
export const VALIDATION_RULES = {
  ACTIVATION_CODE: {
    MIN_LENGTH: 10,
    PATTERN: /^[A-Za-z0-9\-\.]+$/,
    REQUIRED: true
  },
  RETENTION_RATE: {
    MIN: 0.1,
    MAX: 1.0,
    STEP: 0.01
  },
  MAX_INTERVAL: {
    MIN: 1,
    MAX: 36500,
    STEP: 1
  },
  BACKUP_COUNT: {
    MIN: 3,
    MAX: 50,
    STEP: 1
  }
} as const;



// 功能特性列表
export const FEATURES = {
  FREE: [
    '基础间隔重复学习',
    'FSRS6 智能算法',
    '卡片创建和编辑',
    '学习进度跟踪',
    '数据本地存储',
    '基础统计分析'
  ],
  PREMIUM: [
    '高级学习模式',
    '详细数据分析',
    'AI 批量制卡（开发中）',
    '刷题模式（开发中）'
  ]
} as const;

// 开发状态标记
export const DEV_STATUS = {
  STABLE: '稳定',
  BETA: '测试版',
  ALPHA: '内测版',
  DEVELOPMENT: '开发中',
  PLANNED: '计划中'
} as const;

// ================================
// AI配置相关常量
// ================================

// AI配置默认值
export const DEFAULT_AI_CONFIG = {
  apiKeys: {
    openai: { apiKey: '', model: 'gpt-4o-mini', verified: false },
    gemini: { apiKey: '', model: 'gemini-1.5-pro', verified: false },
    anthropic: { apiKey: '', model: 'claude-3-5-sonnet-20241022', verified: false },
    deepseek: { apiKey: '', model: 'deepseek-chat', verified: false },
    zhipu: { apiKey: '', model: 'glm-4-flash', verified: false },
    siliconflow: { apiKey: '', model: 'Qwen/Qwen2.5-7B-Instruct', verified: false }
  },
  defaultProvider: 'zhipu' as const,
  formattingProvider: undefined,  // 默认未设置，将使用 defaultProvider
  splittingProvider: undefined,   // AI拆分默认提供商，默认未设置，将使用 defaultProvider
  formatting: {
    enabled: true  // 仅保留总开关
  },
  globalParams: {
    temperature: 0.7,
    maxTokens: 2000,
    requestTimeout: 30,
    concurrentLimit: 3
  },
  // 🆕 全局系统提示词配置
  systemPromptConfig: {
    useBuiltin: true,
    customPrompt: '',
    lastModified: undefined
  },
  promptTemplates: {
    official: [
      {
        id: 'standard-qa',
        name: '标准问答生成',
        prompt: '请根据以下内容生成{count}张问答卡片，难度为{difficulty}。要求问题简洁明确，答案完整准确。',
        useBuiltinSystemPrompt: true,
        description: '适用于一般性学习材料，生成标准问答卡片，包含多种题型',
        variables: ['count', 'difficulty', 'template'],
        createdAt: new Date().toISOString()
      },
      {
        id: 'concept-explain',
        name: '概念解释型',
        prompt: '请提取关键概念并生成解释型卡片，包含定义、特点、应用场景。',
        useBuiltinSystemPrompt: true,
        description: '专注于概念理解，生成定义类、解释类卡片',
        variables: ['count'],
        createdAt: new Date().toISOString()
      },
      {
        id: 'deep-understanding',
        name: '深度理解型',
        prompt: '生成需要深度思考的卡片，重点考察理解、分析、应用能力。避免简单记忆型问题。',
        useBuiltinSystemPrompt: true,
        description: '生成高阶思维卡片，强调理解和应用',
        variables: ['count', 'difficulty'],
        createdAt: new Date().toISOString()
      },
      {
        id: 'cloze-fill',
        name: '挖空填充型',
        prompt: '生成挖空题，使用{{c1::}}语法标记关键词。每张卡片1-3个挖空点。',
        useBuiltinSystemPrompt: true,
        description: '专注于生成挖空题，适合记忆关键术语和概念',
        variables: ['count'],
        createdAt: new Date().toISOString()
      }
    ],
    custom: []
  },
  imageGeneration: {
    defaultSyntax: 'wiki' as const,
    attachmentDir: 'attachments/ai-generated',
    autoCreateSubfolders: true,
    includeTimestamp: true,
    includeCaption: true
  },
  history: {
    enabled: true,
    retentionDays: 30,
    showCostStats: true,
    autoCleanFailures: true
  },
  statistics: {
    totalGenerations: 0,
    totalCards: 0,
    successfulImports: 0,
    totalCost: 0,
    monthlyCost: 0
  },
  security: {
    encryptApiKeys: true,
    enableContentFilter: true,
    anonymousStats: false
  },
  shortcuts: {
    // 默认不设置快捷键，由用户自行配置
  },
  // 🆕 AI拆分卡片配置
  cardSplitting: {
    enabled: true,
    defaultTargetCount: 0,  // 0表示让AI自动决定，通常生成2-5张
    minContentLength: 100,   // 最小内容长度（字符数）
    maxContentLength: 5000,  // 最大内容长度
    autoInheritTags: true,   // 自动继承父卡片标签
    autoInheritSource: true, // 自动继承来源信息
    requireConfirmation: true, // 收入前是否需要确认
    defaultInstruction: '',  // 默认拆分指令（可选）
  }
} as const;

// AI模型选项
export const AI_MODEL_OPTIONS = {
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o', description: '最新模型，性价比最高' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: '高性能，成本较高' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', description: '经济型选择' }
  ],
  gemini: [
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', description: '最新模型' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', description: '快速响应' }
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', description: '最新模型' },
    { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus', description: '最强性能' }
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek Chat', description: '通用对话模型' },
    { id: 'deepseek-coder', label: 'DeepSeek Coder', description: '代码专用' }
  ],
  zhipu: [
    { id: 'glm-4-flash', label: 'GLM-4 Flash', description: '快速响应，免费使用' },
    { id: 'glm-4-air', label: 'GLM-4 Air', description: '轻量版本，经济实惠' },
    { id: 'glm-4', label: 'GLM-4', description: '标准版本，性能均衡' }
  ],
  siliconflow: [
    // 通义千问系列
    { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5 7B', description: '通义千问 - 快速响应' },
    { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5 72B', description: '通义千问 - 高性能' },
    
    // DeepSeek系列
    { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3', description: '深度求索最新版' },
    { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1', description: '推理增强版' },
    
    // GLM系列
    { id: 'THUDM/glm-4-9b-chat', label: 'GLM-4 9B', description: '智谱清言' },
    
    // Meta Llama系列
    { id: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B', description: 'Meta开源' },
    
    // Google Gemma系列
    { id: 'google/gemma-2-9b-it', label: 'Gemma 2 9B', description: 'Google轻量版' },
    
    // 01-ai系列
    { id: 'Pro/01-ai/Yi-Lightning', label: 'Yi Lightning', description: '零一万物 - 极速版' }
  ]
} as const;

// AI提供商标签
export const AI_PROVIDER_LABELS = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  zhipu: '智谱清言',
  siliconflow: '硅基流动'
} as const;

// AI提供商类型
export type AIProvider = 'openai' | 'gemini' | 'anthropic' | 'deepseek' | 'zhipu' | 'siliconflow';

// ================================
// 致谢信息配置
// ================================

// 致谢对象列表
export const ACKNOWLEDGMENTS = [
  {
    id: 'fsrs',
    name: 'FSRS算法',
    icon: '🧠',
    description: '科学的间隔重复算法',
    url: 'https://github.com/open-spaced-repetition/fsrs4anki'
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    icon: '💎',
    description: '优秀的知识管理平台',
    url: 'https://obsidian.md/'
  },
  {
    id: 'anki',
    name: 'Anki',
    icon: '🎴',
    description: '间隔重复学习先驱',
    url: 'https://apps.ankiweb.net/'
  },
  {
    id: 'samdagreatwzzz',
    name: 'SamdaGreatzzz',
    icon: '🎬',
    description: 'AI制卡设计灵感',
    url: 'https://space.bilibili.com/22291849/'
  }
] as const;
