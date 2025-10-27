/**
 * 安全配置管理系统
 * 外部化所有安全相关的配置，消除硬编码风险
 */

export interface SecurityConfig {
  readonly encryption: {
    rsaPublicKey: string;
    keyVersion: string;
    algorithm: 'RSASSA-PKCS1-v1_5';
    hashAlgorithm: 'SHA-256';
  };
  readonly product: {
    id: string;
    version: string;
    compatibleVersions: string[];
  };
  readonly validation: {
    fingerprintSimilarityThreshold: number;
    deviceChangeWarningThreshold: number;
    expiryWarningDays: number;
    maxActivationAttempts: number;
    lockoutDurationMs: number;
    attemptWindowMs: number;
  };
  readonly fingerprint: {
    version: string;
    componentWeights: Record<string, number>;
    enabledComponents: string[];
  };
}

/**
 * 默认安全配置
 * 注意：生产环境应从环境变量或配置文件加载
 */
const DEFAULT_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4yHCz/ejp63RLRZW/UKs
jqNNESIYZ1+WCkwQLtg8enZnpDP5dAfXzQFRqL2VqyQ8wk811WdFjyRljpPjoPyO
A4oyy5HB8o+aObWb1yz4KEf4QBsZ4+vxDXb1E89HUadhBCLSsDSm4q6yKUvxZYmh
SR6zxWYg3vSB98FBdZ8m1eWOv61lvFkqT/RWcXsc69LQTUMWwnprhiJvTvUhIkZL
QLsE41Yjsatmvn320MnNIU+l9YYxA0z3ZvCs5tOuimtpsjsL0OqI474XgPVTuKut
0kfbOLtOk1R7o0mUWSdGtdGQO8w7vgFiSMryOaCsHaJUOg6Ko7wSXniGlbjvpnxf
NQIDAQAB
-----END PUBLIC KEY-----`;

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  encryption: {
    rsaPublicKey: DEFAULT_RSA_PUBLIC_KEY,
    keyVersion: '1.0.0',
    algorithm: 'RSASSA-PKCS1-v1_5',
    hashAlgorithm: 'SHA-256'
  },
  product: {
    id: 'tuanki-obsidian-plugin',
    version: '0.5.0',
    compatibleVersions: ['0.5.0', '0.4.x']
  },
  validation: {
    fingerprintSimilarityThreshold: 0.7,
    deviceChangeWarningThreshold: 0.9,
    expiryWarningDays: 30,
    maxActivationAttempts: 5,
    lockoutDurationMs: 15 * 60 * 1000, // 15分钟
    attemptWindowMs: 5 * 60 * 1000 // 5分钟
  },
  fingerprint: {
    version: '2.0.0',
    componentWeights: {
      userAgent: 0.2,
      screen: 0.15,
      timezone: 0.1,
      language: 0.1,
      hardware: 0.15,
      obsidian: 0.2,
      canvas: 0.05,
      webgl: 0.05
    },
    enabledComponents: [
      'userAgent', 'screen', 'timezone', 'language', 
      'hardware', 'obsidian', 'canvas', 'webgl'
    ]
  }
};

/**
 * 安全配置加载器
 */
export class SecurityConfigLoader {
  private static instance: SecurityConfigLoader;
  private config: SecurityConfig | null = null;

  private constructor() {}

  static getInstance(): SecurityConfigLoader {
    if (!SecurityConfigLoader.instance) {
      SecurityConfigLoader.instance = new SecurityConfigLoader();
    }
    return SecurityConfigLoader.instance;
  }

  /**
   * 加载安全配置
   * 优先级：环境变量 > 配置文件 > 默认配置
   */
  async loadConfig(): Promise<SecurityConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      // 尝试从环境变量加载
      const envConfig = this.loadFromEnvironment();
      if (envConfig) {
        this.config = envConfig;
        return this.config;
      }

      // 尝试从配置文件加载
      const fileConfig = await this.loadFromFile();
      if (fileConfig) {
        this.config = fileConfig;
        return this.config;
      }

      // 使用默认配置
      console.warn('使用默认安全配置，建议在生产环境中配置外部安全参数');
      this.config = DEFAULT_SECURITY_CONFIG;
      return this.config;
    } catch (error) {
      console.error('加载安全配置失败，使用默认配置:', error);
      this.config = DEFAULT_SECURITY_CONFIG;
      return this.config;
    }
  }

  /**
   * 从环境变量加载配置
   */
  private loadFromEnvironment(): SecurityConfig | null {
    try {
      const rsaPublicKey = process.env.TUANKI_RSA_PUBLIC_KEY;
      const productId = process.env.TUANKI_PRODUCT_ID;
      const version = process.env.TUANKI_VERSION;

      if (!rsaPublicKey || !productId || !version) {
        return null;
      }

      return {
        ...DEFAULT_SECURITY_CONFIG,
        encryption: {
          ...DEFAULT_SECURITY_CONFIG.encryption,
          rsaPublicKey
        },
        product: {
          ...DEFAULT_SECURITY_CONFIG.product,
          id: productId,
          version
        }
      };
    } catch (error) {
      console.warn('从环境变量加载配置失败:', error);
      return null;
    }
  }

  /**
   * 从配置文件加载配置
   */
  private async loadFromFile(): Promise<SecurityConfig | null> {
    try {
      // 在Obsidian环境中，尝试从插件配置目录加载
      const configPath = 'tuanki-security-config.json';
      
      // 这里需要根据实际的文件系统API实现
      // 暂时返回null，表示文件配置暂未实现
      return null;
    } catch (error) {
      console.warn('从配置文件加载配置失败:', error);
      return null;
    }
  }

  /**
   * 验证配置完整性
   */
  validateConfig(config: SecurityConfig): boolean {
    try {
      // 验证必需字段
      if (!config.encryption.rsaPublicKey || !config.product.id || !config.product.version) {
        return false;
      }

      // 验证RSA公钥格式
      if (!config.encryption.rsaPublicKey.includes('BEGIN PUBLIC KEY')) {
        return false;
      }

      // 验证数值范围
      const validation = config.validation;
      if (validation.fingerprintSimilarityThreshold < 0 || validation.fingerprintSimilarityThreshold > 1) {
        return false;
      }

      if (validation.maxActivationAttempts < 1 || validation.maxActivationAttempts > 20) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('配置验证失败:', error);
      return false;
    }
  }

  /**
   * 重新加载配置
   */
  async reloadConfig(): Promise<SecurityConfig> {
    this.config = null;
    return this.loadConfig();
  }
}

/**
 * 获取安全配置的便捷函数
 */
export async function getSecurityConfig(): Promise<SecurityConfig> {
  const loader = SecurityConfigLoader.getInstance();
  return loader.loadConfig();
}

/**
 * 配置验证工具
 */
export function validateSecurityConfig(config: SecurityConfig): boolean {
  const loader = SecurityConfigLoader.getInstance();
  return loader.validateConfig(config);
}
