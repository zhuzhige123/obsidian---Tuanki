/**
 * 许可证系统类型定义
 * 提供完整的类型安全保障，消除any类型使用
 */

// ==================== 基础类型定义 ====================

/**
 * 许可证类型
 */
export type LicenseType = 'lifetime' | 'subscription';

/**
 * 激活码错误类型
 */
export enum ActivationErrorCode {
  // 格式错误
  INVALID_FORMAT = 'INVALID_FORMAT',
  INCOMPLETE_DATA = 'INCOMPLETE_DATA',
  MALFORMED_STRUCTURE = 'MALFORMED_STRUCTURE',
  
  // 验证错误
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
  EXPIRED_CODE = 'EXPIRED_CODE',
  PRODUCT_ID_MISMATCH = 'PRODUCT_ID_MISMATCH',
  UNSUPPORTED_VERSION = 'UNSUPPORTED_VERSION',
  
  // 设备相关错误
  DEVICE_FINGERPRINT_MISMATCH = 'DEVICE_FINGERPRINT_MISMATCH',
  DEVICE_LIMIT_EXCEEDED = 'DEVICE_LIMIT_EXCEEDED',
  
  // 尝试限制错误
  ATTEMPT_LIMIT_EXCEEDED = 'ATTEMPT_LIMIT_EXCEEDED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // 系统错误
  CRYPTO_ERROR = 'CRYPTO_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// ==================== 设备指纹相关类型 ====================

/**
 * 浏览器信息
 */
export interface BrowserInfo {
  readonly userAgent: string;
  readonly language: string;
  readonly languages: readonly string[];
  readonly platform: string;
  readonly cookieEnabled: boolean;
  readonly doNotTrack: string | null;
  readonly onLine: boolean;
}

/**
 * 系统信息
 */
export interface SystemInfo {
  readonly timezone: string;
  readonly timezoneOffset: number;
  readonly locale: string;
  readonly osInfo?: {
    readonly platform: string;
    readonly arch: string;
    readonly hostname: string;
  };
}

/**
 * 硬件信息
 */
export interface HardwareInfo {
  readonly screenResolution: string;
  readonly colorDepth: number;
  readonly pixelDepth: number;
  readonly devicePixelRatio: number;
  readonly hardwareConcurrency: number;
  readonly maxTouchPoints: number;
  readonly deviceMemory?: number;
}

/**
 * Obsidian特定信息
 */
export interface ObsidianInfo {
  readonly appId: string;
  readonly vaultPath: string;
  readonly version?: string;
  readonly plugins?: readonly string[];
}

/**
 * Canvas指纹信息
 */
export interface CanvasInfo {
  readonly fingerprint: string;
  readonly supported: boolean;
}

/**
 * WebGL信息
 */
export interface WebGLInfo {
  readonly renderer: string;
  readonly vendor: string;
  readonly version: string;
  readonly supported: boolean;
}

/**
 * 音频指纹信息
 */
export interface AudioInfo {
  readonly sampleRate: number;
  readonly frequencyBinCount: number;
  readonly supported: boolean;
}

/**
 * 网络信息
 */
export interface NetworkInfo {
  readonly effectiveType?: string;
  readonly downlink?: number;
  readonly rtt?: number;
  readonly saveData?: boolean;
}

/**
 * 设备组件信息
 */
export interface DeviceComponents {
  readonly browser: BrowserInfo;
  readonly system: SystemInfo;
  readonly hardware: HardwareInfo;
  readonly obsidian: ObsidianInfo;
  readonly canvas?: CanvasInfo;
  readonly webgl?: WebGLInfo;
  readonly audio?: AudioInfo;
  readonly network?: NetworkInfo;
}

/**
 * 设备指纹
 */
export interface DeviceFingerprint {
  readonly hash: string;
  readonly components: DeviceComponents;
  readonly generatedAt: string;
  readonly version: string;
  readonly weights: Record<string, number>;
}

// ==================== 激活码相关类型 ====================

/**
 * 激活码数据结构
 */
export interface ActivationCodeData {
  readonly userId: string;
  readonly productId: string;
  readonly licenseType: LicenseType;
  readonly expiresAt: string;
  readonly maxDevices: number;
  readonly features: readonly string[];
  readonly issuedAt: string;
  readonly version?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * 激活码解析结果
 */
export interface ParsedActivationCode {
  readonly data: string;
  readonly signature: string;
  readonly isValid: boolean;
}

/**
 * 激活码验证结果
 */
export interface ActivationCodeValidationResult {
  readonly isValid: boolean;
  readonly data?: ActivationCodeData;
  readonly error?: string;
  readonly warning?: string;
  readonly details?: string;
}

// ==================== 许可证相关类型 ====================

/**
 * 许可证信息
 */
export interface LicenseInfo {
  readonly activationCode: string;
  readonly isActivated: boolean;
  readonly activatedAt: string;
  readonly deviceFingerprint: string;
  readonly expiresAt: string;
  readonly productVersion: string;
  readonly licenseType: LicenseType;
  readonly userId: string;
  readonly features: readonly string[];
  readonly maxDevices: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * 许可证验证结果
 */
export interface LicenseValidationResult {
  readonly isValid: boolean;
  readonly error?: string;
  readonly warnings?: readonly string[];
  readonly remainingDays?: number;
  readonly deviceSimilarity?: number;
}

// ==================== 错误处理类型 ====================

/**
 * 激活错误信息
 */
export interface ActivationError {
  readonly code: ActivationErrorCode;
  readonly message: string;
  readonly details?: string;
  readonly recoverable: boolean;
  readonly suggestedAction?: string;
  readonly timestamp: string;
  readonly context?: Record<string, unknown>;
}

/**
 * 激活结果
 */
export interface ActivationResult {
  readonly success: boolean;
  readonly licenseInfo?: LicenseInfo;
  readonly error?: ActivationError;
  readonly warnings?: readonly string[];
}

// ==================== 尝试限制相关类型 ====================

/**
 * 激活尝试记录
 */
export interface ActivationAttempt {
  readonly timestamp: number;
  readonly success: boolean;
  readonly deviceFingerprint: string;
  readonly errorCode?: ActivationErrorCode;
  readonly ipAddress?: string;
}

/**
 * 尝试限制检查结果
 */
export interface AttemptLimitCheckResult {
  readonly allowed: boolean;
  readonly remainingAttempts: number;
  readonly lockoutTimeRemaining?: number;
  readonly message?: string;
  readonly nextAttemptAllowedAt?: number;
}

// ==================== 配置相关类型 ====================

/**
 * 验证配置
 */
export interface ValidationConfig {
  readonly fingerprintSimilarityThreshold: number;
  readonly deviceChangeWarningThreshold: number;
  readonly expiryWarningDays: number;
  readonly maxActivationAttempts: number;
  readonly lockoutDurationMs: number;
  readonly attemptWindowMs: number;
}

// ==================== 工具类型 ====================

/**
 * 只读深度类型
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * 可选字段类型
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * 必需字段类型
 */
export type Required<T, K extends keyof T> = T & { [P in K]-?: T[P] };

// ==================== 类型守卫 ====================

/**
 * 检查是否为有效的许可证类型
 */
export function isValidLicenseType(value: unknown): value is LicenseType {
  return typeof value === 'string' && ['lifetime', 'subscription'].includes(value);
}

/**
 * 检查是否为有效的激活错误代码
 */
export function isValidActivationErrorCode(value: unknown): value is ActivationErrorCode {
  return typeof value === 'string' && Object.values(ActivationErrorCode).includes(value as ActivationErrorCode);
}

/**
 * 检查是否为有效的设备指纹
 */
export function isValidDeviceFingerprint(value: unknown): value is DeviceFingerprint {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  
  const fingerprint = value as Record<string, unknown>;
  return (
    typeof fingerprint.hash === 'string' &&
    typeof fingerprint.generatedAt === 'string' &&
    typeof fingerprint.version === 'string' &&
    typeof fingerprint.components === 'object' &&
    fingerprint.components !== null
  );
}

/**
 * 检查是否为有效的许可证信息
 */
export function isValidLicenseInfo(value: unknown): value is LicenseInfo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  
  const license = value as Record<string, unknown>;
  return (
    typeof license.activationCode === 'string' &&
    typeof license.isActivated === 'boolean' &&
    typeof license.activatedAt === 'string' &&
    typeof license.deviceFingerprint === 'string' &&
    typeof license.expiresAt === 'string' &&
    typeof license.productVersion === 'string' &&
    isValidLicenseType(license.licenseType)
  );
}
