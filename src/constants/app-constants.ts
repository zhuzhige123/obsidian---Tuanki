/**
 * 应用常量定义
 * 统一管理所有硬编码的魔法数字和配置值
 */

// 时间相关常量（毫秒）
export const TIME_CONSTANTS = {
  // 基础时间单位
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  
  // 超时时间
  DEFAULT_TIMEOUT: 10 * 1000,        // 10秒
  NETWORK_TIMEOUT: 30 * 1000,        // 30秒
  LONG_OPERATION_TIMEOUT: 60 * 1000, // 1分钟
  
  // 间隔时间
  MONITORING_INTERVAL: 30 * 1000,     // 30秒
  CLEANUP_INTERVAL: 5 * 60 * 1000,    // 5分钟
  BACKUP_INTERVAL: 24 * 60 * 60 * 1000, // 24小时
  
  // 延迟时间
  DEBOUNCE_DELAY: 300,               // 300毫秒
  RETRY_DELAY: 1000,                 // 1秒
  ANIMATION_DELAY: 150,              // 150毫秒
  
  // 验证延迟
  VALIDATION_DELAY: 100,             // 100毫秒
  
  // 时间差阈值
  MODIFICATION_TIME_THRESHOLD: 60 * 1000, // 1分钟
} as const;

// 批处理相关常量
export const BATCH_CONSTANTS = {
  // 批处理大小
  DEFAULT_BATCH_SIZE: 50,
  MIN_BATCH_SIZE: 5,
  MAX_BATCH_SIZE: 200,
  
  // 并发控制
  DEFAULT_CONCURRENCY: 5,
  MAX_CONCURRENCY: 10,
  
  // 重试配置
  DEFAULT_RETRY_ATTEMPTS: 3,
  MAX_RETRY_ATTEMPTS: 5,
  RETRY_BACKOFF_MULTIPLIER: 2,
} as const;

// 内存相关常量（字节）
export const MEMORY_CONSTANTS = {
  // 基础单位
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  
  // 内存池配置
  DEFAULT_POOL_SIZE: 100 * 1024 * 1024,  // 100MB
  MAX_POOL_SIZE: 500 * 1024 * 1024,      // 500MB
  
  // 块大小
  SMALL_BLOCK: 1024,                     // 1KB
  MEDIUM_BLOCK: 4096,                    // 4KB
  LARGE_BLOCK: 16384,                    // 16KB
  XLARGE_BLOCK: 65536,                   // 64KB
  
  // 阈值
  GC_THRESHOLD: 0.8,                     // 80%
  MEMORY_WARNING_THRESHOLD: 0.7,        // 70%
  MEMORY_CRITICAL_THRESHOLD: 0.9,       // 90%
  
  // 文件大小限制
  MAX_FILE_SIZE: 50 * 1024 * 1024,       // 50MB
  MAX_IMAGE_SIZE: 10 * 1024 * 1024,      // 10MB
  MAX_AUDIO_SIZE: 25 * 1024 * 1024,      // 25MB
} as const;

// 网络相关常量
export const NETWORK_CONSTANTS = {
  // 连接配置
  MAX_CONNECTIONS: 10,
  MAX_CONNECTIONS_PER_HOST: 4,
  CONNECTION_TIMEOUT: 30 * 1000,         // 30秒
  KEEP_ALIVE_TIMEOUT: 60 * 1000,         // 1分钟
  
  // 重试配置
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,                     // 1秒
  
  // 批量请求
  MAX_BATCH_SIZE: 10,
  BATCH_TIMEOUT: 150,                    // 150毫秒
} as const;

// 性能监控常量
export const PERFORMANCE_CONSTANTS = {
  // 监控间隔 - 进一步优化减少开销
  COLLECT_INTERVAL: 10000,               // 10秒（从5秒优化为10秒）
  REPORT_INTERVAL: 5 * 60 * 1000,        // 5分钟

  // 历史记录限制 - 减少内存占用
  MAX_METRICS_HISTORY: 500,              // 从1000减少到500
  MAX_REPORTS_HISTORY: 25,               // 从50减少到25

  // 性能阈值 - 更合理的内存阈值
  MEMORY_WARNING_MB: 150,                // 150MB（从100MB提高）
  MEMORY_CRITICAL_MB: 300,               // 300MB（从200MB提高）
  MEMORY_WARNING_PERCENT: 85,            // 85%（从70%提高）
  MEMORY_CRITICAL_PERCENT: 98,           // 98%（从95%提高）
  CPU_WARNING_PERCENT: 75,               // 75%（从70%提高）
  CPU_CRITICAL_PERCENT: 95,              // 95%（从90%提高）
  RESPONSE_TIME_WARNING_MS: 1500,        // 1.5秒（从1秒放宽）
  RESPONSE_TIME_CRITICAL_MS: 5000,       // 5秒（从3秒放宽）
  RENDER_TIME_WARNING_MS: 150,           // 150毫秒（从100毫秒放宽）
  RENDER_TIME_CRITICAL_MS: 500,          // 500毫秒（从300毫秒放宽）
} as const;

// 缓存相关常量
export const CACHE_CONSTANTS = {
  // L1缓存（内存）
  L1_MAX_SIZE: 100,
  L1_MAX_MEMORY: 50 * 1024 * 1024,       // 50MB
  
  // L2缓存（IndexedDB）
  L2_MAX_SIZE: 500,
  
  // L3缓存（持久化）
  L3_MAX_SIZE: 1000,
  
  // TTL配置
  DEFAULT_TTL: 60 * 60 * 1000,           // 1小时
  SHORT_TTL: 5 * 60 * 1000,              // 5分钟
  LONG_TTL: 24 * 60 * 60 * 1000,         // 24小时
  
  // 清理间隔
  CLEANUP_INTERVAL: 5 * 60 * 1000,       // 5分钟
} as const;

// 健康检查常量
export const HEALTH_CHECK_CONSTANTS = {
  // 检查间隔
  FUNCTIONALITY_INTERVAL: 60 * 1000,     // 1分钟
  DATA_INTEGRITY_INTERVAL: 5 * 60 * 1000, // 5分钟
  SERVICE_STATUS_INTERVAL: 30 * 1000,    // 30秒
  PERFORMANCE_INTERVAL: 2 * 60 * 1000,   // 2分钟
  SECURITY_INTERVAL: 10 * 60 * 1000,     // 10分钟
  
  // 超时时间
  FUNCTIONALITY_TIMEOUT: 10 * 1000,      // 10秒
  DATA_INTEGRITY_TIMEOUT: 15 * 1000,     // 15秒
  SERVICE_STATUS_TIMEOUT: 5 * 1000,      // 5秒
  PERFORMANCE_TIMEOUT: 5 * 1000,         // 5秒
  SECURITY_TIMEOUT: 10 * 1000,           // 10秒
  
  // 重试次数
  FUNCTIONALITY_RETRIES: 2,
  DATA_INTEGRITY_RETRIES: 1,
  SERVICE_STATUS_RETRIES: 3,
  PERFORMANCE_RETRIES: 1,
  SECURITY_RETRIES: 1,
} as const;

// UI相关常量
export const UI_CONSTANTS = {
  // 动画时间
  ANIMATION_DURATION: 300,               // 300毫秒
  FAST_ANIMATION: 150,                   // 150毫秒
  SLOW_ANIMATION: 500,                   // 500毫秒

  // 通知时间
  DEFAULT_NOTICE_DURATION: 5000,         // 5秒
  SHORT_NOTICE_DURATION: 2000,           // 2秒
  LONG_NOTICE_DURATION: 10000,           // 10秒

  // 防抖时间
  INPUT_DEBOUNCE: 300,                   // 300毫秒
  SEARCH_DEBOUNCE: 500,                  // 500毫秒
  RESIZE_DEBOUNCE: 100,                  // 100毫秒

  // 分页配置
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  // 滑块配置
  SLIDER_MIN_INTERVAL: 30,               // 30天
  SLIDER_MAX_INTERVAL: 365,              // 365天
  SLIDER_STEP: 5,                        // 5天步长

  // 模板菜单定位常量
  ESTIMATED_WIDTH: 300,                  // 模板菜单预估宽度
  GAP: 8,                               // 模板菜单与按钮间距
} as const;



// 学习相关常量
export const LEARNING_CONSTANTS = {
  // 默认学习步骤（分钟）
  DEFAULT_LEARNING_STEPS: [1, 10] as number[],
  
  // 默认间隔（天）
  DEFAULT_GRADUATING_INTERVAL: 1,
  DEFAULT_EASY_INTERVAL: 4,
  
  // 复习限制
  DEFAULT_REVIEWS_PER_DAY: 20,
  MAX_REVIEWS_PER_DAY: 200,
  
  // FSRS参数
  DEFAULT_REQUEST_RETENTION: 0.9,        // 90%
  DEFAULT_MAXIMUM_INTERVAL: 36500,       // 100年
  
  // 自动显示答案时间（秒）
  AUTO_SHOW_ANSWER_DISABLED: 0,
} as const;

// 文件处理常量
export const FILE_CONSTANTS = {
  // 支持的图片格式
  SUPPORTED_IMAGE_FORMATS: [
    'image/png', 'image/jpeg', 'image/jpg', 'image/gif',
    'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff'
  ],
  
  // 支持的音频格式
  SUPPORTED_AUDIO_FORMATS: [
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
    'audio/aac', 'audio/flac', 'audio/m4a', 'audio/wma'
  ],
  
  // 支持的视频格式
  SUPPORTED_VIDEO_FORMATS: [
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
    'video/webm', 'video/ogg', 'video/3gpp', 'video/x-flv'
  ],
  
  // 文件大小限制
  MAX_FILE_SIZE: 50 * 1024 * 1024,       // 50MB
  
  // 批量导入配置
  MAX_FILES_PER_BATCH: 100,
  DEFAULT_MAX_FILES_PER_BATCH: 50,
} as const;

// 正则表达式常量
export const REGEX_CONSTANTS = {
  // Wiki链接
  WIKI_LINK: /\[\[([^\]]+)\]\]/g,
  
  // 标签
  TAG: /#[\w\u4e00-\u9fff]+/g,
  
  // 数学公式
  INLINE_MATH: /\$([^$]+)\$/g,
  BLOCK_MATH: /\$\$([^$]+)\$\$/g,
  
  // Callouts
  CALLOUT: /^>\s*\[!(\w+)\]/gm,
} as const;

// 错误代码常量
export const ERROR_CODES = {
  // 网络错误
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  
  // 数据错误
  DATA_CORRUPTION: 'DATA_CORRUPTION',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  
  // 权限错误
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  
  // 系统错误
  MEMORY_ERROR: 'MEMORY_ERROR',
  DISK_FULL: 'DISK_FULL',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;
