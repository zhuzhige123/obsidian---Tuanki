/**
 * 离线激活码管理系统
 * 基于 RSA 数字签名的安全激活码验证
 */

export interface LicenseInfo {
    activationCode: string;
    isActivated: boolean;
    activatedAt: string;
    deviceFingerprint: string;
    expiresAt: string;
    productVersion: string;
    licenseType: 'lifetime' | 'subscription';
    fingerprintVersion?: number; // 设备指纹版本：1=旧版(含vault路径), 2=新版(不含vault路径)
}

export interface ActivationCodeData {
    userId: string;
    productId: string;
    licenseType: 'lifetime' | 'subscription';
    expiresAt: string;
    maxDevices: number;
    features: string[];
    issuedAt: string;
}

export class LicenseManager {
    // RSA 公钥用于验证激活码签名（私钥由服务端保管）
    private readonly PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuFbE7080dfi90uTpCncI
n9wCXxPwz2r485ckXN0HO7yawwZTcSPf9I03GUg0EeyCj378AgnFUcj7GZ14Cnox
aCFhKje/u9PwBkUGiEb9Cgu6KkY29S1BPFZC9FBYE/N9Ymkw/vPZbR+0/4c8Uhu7
ou+Do+2e+C7s3UVBKRnXea4E54v/mGPOWttjvF+vwStg/x3hvDjIcfMqg3s74OVt
2vJqfOoVvqNnEVzx4wEPnAi5xD5p4Bxz2gXDlzRL+6HV2n55fdBJou+avIihxwUM
KiqnLPDZDoj1QmooLvpFj3j7/9dWyUfbKmJv3D1+hmdbeltKDYZJc9WdIU+v7Bmi
+wIDAQAB
-----END PUBLIC KEY-----`;

    private readonly PRODUCT_ID = "tuanki-obsidian-plugin";
    private readonly CURRENT_VERSION = "0.5.0";

    /**
     * 生成增强的设备指纹
     */
    private async generateDeviceFingerprint(): Promise<string> {
        const components = await this.collectDeviceComponents();
        const fingerprint = components.join('|');
        return this.sha256(fingerprint);
    }

    /**
     * 收集设备特征信息
     */
    private async collectDeviceComponents(): Promise<string[]> {
        const components: string[] = [];

        // 基础浏览器信息
        components.push(navigator.userAgent || 'unknown');
        components.push(navigator.language || 'unknown');
        components.push(navigator.languages?.join(',') || 'unknown');
        components.push(navigator.platform || 'unknown');

        // 屏幕信息
        components.push(`${screen.width}x${screen.height}`);
        components.push(`${screen.colorDepth}bit`);
        components.push(`${screen.pixelDepth}px`);
        components.push(`${window.devicePixelRatio || 1}dpr`);

        // 时区和地区信息
        components.push(new Date().getTimezoneOffset().toString());
        components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown');

        // 硬件信息
        components.push(navigator.hardwareConcurrency?.toString() || '0');
        components.push(navigator.maxTouchPoints?.toString() || '0');

        // 内存信息（如果可用）
        const memory = (navigator as any).deviceMemory;
        if (memory) {
            components.push(`${memory}GB`);
        }

        // 网络信息（如果可用）
        const connection = (navigator as any).connection;
        if (connection) {
            components.push(connection.effectiveType || 'unknown');
            components.push(connection.downlink?.toString() || 'unknown');
        }

        // Obsidian 特有信息
        const obsidianApp = (window as any).app;
        if (obsidianApp) {
            components.push(obsidianApp.appId || 'obsidian');
            // 移除 vault.adapter.path，避免路径变化触发设备变更
        }

        // 系统信息（如果可用）
        try {
            const os = (window as any).require?.('os');
            if (os) {
                components.push(os.platform() || 'unknown');
                components.push(os.arch() || 'unknown');
                components.push(os.hostname() || 'unknown');
            }
        } catch {
            components.push('no-os-info');
        }

        // Canvas指纹（轻量级）
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.textBaseline = 'top';
                ctx.font = '14px Arial';
                ctx.fillText('Tuanki Device Fingerprint', 2, 2);
                components.push(canvas.toDataURL().substring(0, 50));
            }
        } catch {
            components.push('no-canvas');
        }

        // WebGL信息（如果可用）
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
            if (gl) {
                const renderer = gl.getParameter(gl.RENDERER);
                const vendor = gl.getParameter(gl.VENDOR);
                components.push(renderer || 'unknown-renderer');
                components.push(vendor || 'unknown-vendor');
            }
        } catch {
            components.push('no-webgl');
        }

        // 音频上下文指纹（轻量级）
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const analyser = audioContext.createAnalyser();
            const gainNode = audioContext.createGain();

            oscillator.connect(analyser);
            analyser.connect(gainNode);
            gainNode.connect(audioContext.destination);

            components.push(audioContext.sampleRate.toString());
            components.push(analyser.frequencyBinCount.toString());

            audioContext.close();
        } catch {
            components.push('no-audio');
        }

        // 插件和扩展检测（基础）
        const plugins = Array.from(navigator.plugins || []).map(p => p.name).slice(0, 5);
        components.push(plugins.join(',') || 'no-plugins');

        return components.filter(c => c && c !== 'undefined');
    }

    /**
     * SHA256 哈希函数
     */
    private async sha256(message: string): Promise<string> {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Base64 解码
     */
    private base64Decode(str: string): Uint8Array {
        const binaryString = atob(str);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * 验证 RSA 签名
     */
    private async verifySignature(data: string, signature: string): Promise<boolean> {
        try {
            // 导入公钥
            const publicKey = await crypto.subtle.importKey(
                'spki',
                new Uint8Array(this.base64Decode(this.PUBLIC_KEY.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''))),
                {
                    name: 'RSASSA-PKCS1-v1_5',
                    hash: 'SHA-256'
                },
                false,
                ['verify']
            );

            // 验证签名
            const dataBuffer = new TextEncoder().encode(data);
            const signatureBuffer = this.base64Decode(signature);

            return await crypto.subtle.verify(
                'RSASSA-PKCS1-v1_5',
                publicKey,
                new Uint8Array(signatureBuffer),
                dataBuffer
            );
        } catch (error) {
            console.error('签名验证失败:', error);
            return false;
        }
    }

    /**
     * 解析激活码
     */
    private parseActivationCode(activationCode: string): { data: string; signature: string } | null {
        try {
            // 激活码格式: BASE64_DATA.BASE64_SIGNATURE
            const parts = activationCode.split('.');
            if (parts.length !== 2) {
                return null;
            }

            const [dataBase64, signatureBase64] = parts;
            const data = atob(dataBase64);

            return {
                data,
                signature: signatureBase64
            };
        } catch (error) {
            console.error('激活码解析失败:', error);
            return null;
        }
    }

    /**
     * 验证激活码
     */
    async validateActivationCode(activationCode: string, deviceFingerprint?: string): Promise<{
        isValid: boolean;
        data?: ActivationCodeData;
        error?: string;
    }> {
        try {
            // 解析激活码
            const parsed = this.parseActivationCode(activationCode);
            if (!parsed) {
                return { isValid: false, error: '激活码格式无效' };
            }

            // 验证签名
            const isSignatureValid = await this.verifySignature(parsed.data, parsed.signature);
            if (!isSignatureValid) {
                return { isValid: false, error: '激活码签名验证失败' };
            }

            // 解析数据
            const data: ActivationCodeData = JSON.parse(parsed.data);

            // 验证产品ID
            if (data.productId !== this.PRODUCT_ID) {
                return { isValid: false, error: '激活码不适用于当前产品' };
            }

            // 验证过期时间
            const now = new Date();
            const expiresAt = new Date(data.expiresAt);
            if (now > expiresAt) {
                return { isValid: false, error: '激活码已过期' };
            }

            // 验证设备数量限制（现在支持最多5台设备）
            // 设备绑定和验证在 validateCurrentLicense 中处理

            return { isValid: true, data };
        } catch (error) {
            console.error('激活码验证失败:', error);
            return { isValid: false, error: '激活码验证过程中发生错误' };
        }
    }

    /**
     * 激活许可证
     */
    async activateLicense(activationCode: string): Promise<{
        success: boolean;
        licenseInfo?: LicenseInfo;
        error?: string;
    }> {
        try {
            // 生成设备指纹
            const deviceFingerprint = await this.generateDeviceFingerprint();

            // 验证激活码
            const validation = await this.validateActivationCode(activationCode, deviceFingerprint);
            if (!validation.isValid || !validation.data) {
                return { success: false, error: validation.error };
            }

            const data = validation.data;

            // 创建许可证信息
            const licenseInfo: LicenseInfo = {
                activationCode,
                isActivated: true,
                activatedAt: new Date().toISOString(),
                deviceFingerprint,
                expiresAt: data.expiresAt,
                productVersion: this.CURRENT_VERSION,
                licenseType: data.licenseType,
                fingerprintVersion: 2 // 新版本指纹（不含vault路径）
            };

            return { success: true, licenseInfo };
        } catch (error) {
            console.error('许可证激活失败:', error);
            return { success: false, error: '激活过程中发生错误' };
        }
    }

    /**
     * 验证当前许可证状态（增强版）
     */
    async validateCurrentLicense(licenseInfo: LicenseInfo): Promise<{
        isValid: boolean;
        error?: string;
        warnings?: string[];
    }> {
        const warnings: string[] = [];

        try {
            // 基础状态检查
            if (!licenseInfo.isActivated) {
                return { isValid: false, error: '许可证未激活' };
            }

            if (!licenseInfo.activationCode) {
                return { isValid: false, error: '激活码信息缺失' };
            }

            // 验证许可证数据完整性
            const requiredFields = ['activationCode', 'activatedAt', 'deviceFingerprint', 'expiresAt', 'productVersion'];
            for (const field of requiredFields) {
                if (!licenseInfo[field as keyof LicenseInfo]) {
                    return { isValid: false, error: `许可证数据不完整，缺少${field}字段` };
                }
            }

            // 验证时间有效性
            const now = new Date();
            const activatedAt = new Date(licenseInfo.activatedAt);
            const expiresAt = new Date(licenseInfo.expiresAt);

            // 检查激活时间是否合理
            if (activatedAt > now) {
                return { isValid: false, error: '许可证激活时间异常' };
            }

            // 检查过期时间
            if (now > expiresAt) {
                return { isValid: false, error: '许可证已过期' };
            }

            // 检查即将过期的情况
            const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (licenseInfo.licenseType !== 'lifetime' && daysUntilExpiry <= 30) {
                warnings.push(`许可证将在${daysUntilExpiry}天后过期`);
            }

            // 验证设备指纹（支持多设备许可）
            const currentFingerprint = await this.generateDeviceFingerprint();
            
            // 🔧 向后兼容性处理：自动迁移旧版本指纹
            if (!licenseInfo.fingerprintVersion || licenseInfo.fingerprintVersion === 1) {
                // 旧版本指纹（包含vault路径），静默迁移到新版本
                console.log('🔄 检测到旧版本设备指纹，正在迁移到新版本...');
                licenseInfo.deviceFingerprint = currentFingerprint;
                licenseInfo.fingerprintVersion = 2;
                warnings.push('设备指纹已自动更新到新版本');
                // 迁移后直接通过验证，跳过后续检查
                return {
                    isValid: true,
                    warnings: warnings.length > 0 ? warnings : undefined
                };
            }
            
            // 重新验证激活码获取设备限制信息
            const codeValidation = await this.validateActivationCode(licenseInfo.activationCode);
            if (!codeValidation.isValid || !codeValidation.data) {
                return { isValid: false, error: '激活码验证失败' };
            }
            
            const maxDevices = codeValidation.data.maxDevices || 5; // 默认5台设备
            
            if (licenseInfo.deviceFingerprint !== currentFingerprint) {
                // 设备指纹不匹配，检测到不同设备
                if (maxDevices > 1) {
                    // 多设备许可：允许使用，给出提示
                    warnings.push(`此许可证支持最多${maxDevices}台设备，检测到在新设备上使用`);
                } else {
                    // 单设备许可：拒绝使用
                    return { isValid: false, error: '设备指纹不匹配，此许可证仅限单设备使用' };
                }
            }

            // 重新验证激活码
            const validation = await this.validateActivationCode(licenseInfo.activationCode);
            if (!validation.isValid) {
                return { isValid: false, error: validation.error };
            }

            // 验证产品版本兼容性
            if (licenseInfo.productVersion && licenseInfo.productVersion !== this.CURRENT_VERSION) {
                warnings.push(`许可证版本(${licenseInfo.productVersion})与当前版本(${this.CURRENT_VERSION})不匹配`);
            }

            // 检查激活时间是否过于久远（可能的时钟问题）
            const daysSinceActivation = Math.ceil((now.getTime() - activatedAt.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceActivation > 3650) { // 超过10年
                warnings.push('许可证激活时间异常久远，请检查系统时间');
            }

            return {
                isValid: true,
                warnings: warnings.length > 0 ? warnings : undefined
            };
        } catch (error) {
            console.error('许可证验证失败:', error);
            return { isValid: false, error: '验证过程中发生错误' };
        }
    }

    /**
     * 计算设备指纹相似度
     * 注意：此方法已废弃，因为对SHA256哈希进行相似度计算无意义
     * 保留此方法仅用于向后兼容，实际不再使用
     * @deprecated 使用简单的匹配/不匹配判断代替
     */
    private calculateFingerprintSimilarity(fingerprint1: string, fingerprint2: string): number {
        if (fingerprint1 === fingerprint2) return 1.0;
        return 0.0; // 不同的哈希值完全不相似
    }

    /**
     * 定期验证许可证状态
     */
    async performPeriodicValidation(licenseInfo: LicenseInfo): Promise<{
        isValid: boolean;
        shouldReactivate: boolean;
        error?: string;
        warnings?: string[];
    }> {
        const validation = await this.validateCurrentLicense(licenseInfo);

        if (!validation.isValid) {
            // 判断是否需要重新激活
            const shouldReactivate = !!(validation.error?.includes('设备指纹') ||
                                   validation.error?.includes('数据不完整') ||
                                   validation.error?.includes('激活码'));

            return {
                isValid: false,
                shouldReactivate,
                error: validation.error,
                warnings: validation.warnings
            };
        }

        return {
            isValid: true,
            shouldReactivate: false,
            warnings: validation.warnings
        };
    }

    /**
     * 获取许可证剩余天数
     */
    getLicenseRemainingDays(licenseInfo: LicenseInfo): number {
        const now = new Date();
        const expiresAt = new Date(licenseInfo.expiresAt);
        const diffTime = expiresAt.getTime() - now.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    /**
     * 检查是否为试用版
     */
    isTrialVersion(licenseInfo: LicenseInfo): boolean {
        return !licenseInfo.isActivated || licenseInfo.activationCode === '';
    }
}

/**
 * 激活码前端验证结果
 */
export interface ActivationCodeValidationResult {
    isValid: boolean;
    error?: string;
    warning?: string;
}

/**
 * 激活尝试记录
 */
interface ActivationAttempt {
    timestamp: number;
    success: boolean;
    deviceFingerprint: string;
}

/**
 * 防暴力破解限制器
 */
export class ActivationAttemptLimiter {
    private static readonly MAX_ATTEMPTS = 5; // 最大尝试次数
    private static readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 锁定时间：15分钟
    private static readonly ATTEMPT_WINDOW = 5 * 60 * 1000; // 时间窗口：5分钟
    private static readonly STORAGE_KEY = 'tuanki_activation_attempts';

    /**
     * 检查是否可以尝试激活
     */
    static async canAttemptActivation(): Promise<{ canAttempt: boolean; error?: string; remainingTime?: number }> {
        const deviceFingerprint = await this.generateSimpleFingerprint();
        const attempts = this.getAttempts();
        const now = Date.now();

        // 清理过期的尝试记录
        const validAttempts = attempts.filter(attempt =>
            now - attempt.timestamp < this.ATTEMPT_WINDOW
        );

        // 获取当前设备的尝试记录
        const deviceAttempts = validAttempts.filter(attempt =>
            attempt.deviceFingerprint === deviceFingerprint
        );

        // 检查是否被锁定
        const lastFailedAttempt = deviceAttempts
            .filter(attempt => !attempt.success)
            .sort((a, b) => b.timestamp - a.timestamp)[0];

        if (lastFailedAttempt) {
            const timeSinceLastAttempt = now - lastFailedAttempt.timestamp;
            const failedAttempts = deviceAttempts.filter(attempt =>
                !attempt.success && now - attempt.timestamp < this.LOCKOUT_DURATION
            );

            if (failedAttempts.length >= this.MAX_ATTEMPTS) {
                const remainingTime = this.LOCKOUT_DURATION - timeSinceLastAttempt;
                if (remainingTime > 0) {
                    return {
                        canAttempt: false,
                        error: `激活尝试次数过多，请等待 ${Math.ceil(remainingTime / 60000)} 分钟后重试`,
                        remainingTime
                    };
                }
            }
        }

        // 保存清理后的尝试记录
        this.saveAttempts(validAttempts);

        return { canAttempt: true };
    }

    /**
     * 记录激活尝试
     */
    static async recordAttempt(success: boolean): Promise<void> {
        const deviceFingerprint = await this.generateSimpleFingerprint();
        const attempts = this.getAttempts();

        attempts.push({
            timestamp: Date.now(),
            success,
            deviceFingerprint
        });

        this.saveAttempts(attempts);
    }

    /**
     * 获取尝试记录
     */
    private static getAttempts(): ActivationAttempt[] {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }

    /**
     * 保存尝试记录
     */
    private static saveAttempts(attempts: ActivationAttempt[]): void {
        try {
            // 只保留最近的50条记录
            const recentAttempts = attempts.slice(-50);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentAttempts));
        } catch {
            // 忽略存储错误
        }
    }

    /**
     * 生成简单的设备指纹（用于尝试限制）
     */
    private static async generateSimpleFingerprint(): Promise<string> {
        const components = [
            navigator.userAgent,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset().toString()
        ];

        const fingerprint = components.join('|');
        const encoder = new TextEncoder();
        const data = encoder.encode(fingerprint);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    }

    /**
     * 重置尝试记录（用于测试）
     */
    static resetAttempts(): void {
        localStorage.removeItem(this.STORAGE_KEY);
    }
}

/**
 * 激活码前端验证工具
 */
export class ActivationCodeValidator {
    /**
     * 验证激活码格式
     */
    static validateFormat(activationCode: string): ActivationCodeValidationResult {
        // 基础检查
        if (!activationCode || typeof activationCode !== 'string') {
            return {
                isValid: false,
                error: '请输入激活码'
            };
        }

        const trimmedCode = activationCode.trim();

        // 长度检查 - 真实激活码通常在500-800字符之间
        if (trimmedCode.length < 200) {
            return {
                isValid: false,
                error: '激活码长度过短，请检查是否完整复制'
            };
        }

        if (trimmedCode.length > 2000) {
            return {
                isValid: false,
                error: '激活码长度过长，请检查是否包含多余内容'
            };
        }

        // 格式检查: BASE64_DATA.BASE64_SIGNATURE
        const parts = trimmedCode.split('.');
        if (parts.length !== 2) {
            return {
                isValid: false,
                error: '激活码格式不正确，应为两部分用点号分隔'
            };
        }

        const [dataBase64, signatureBase64] = parts;

        // 检查Base64格式
        try {
            atob(dataBase64);
            atob(signatureBase64);
        } catch (error) {
            return {
                isValid: false,
                error: '激活码包含无效字符，请检查是否正确复制'
            };
        }

        // 检查数据部分是否为有效JSON
        try {
            const dataString = atob(dataBase64);
            const data = JSON.parse(dataString);

            // 检查必要字段
            const requiredFields = ['userId', 'productId', 'licenseType', 'expiresAt'];
            for (const field of requiredFields) {
                if (!data[field]) {
                    return {
                        isValid: false,
                        error: `激活码数据不完整，缺少${field}字段`
                    };
                }
            }

            // 检查产品ID
            if (data.productId !== 'tuanki-obsidian-plugin') {
                return {
                    isValid: false,
                    error: '此激活码不适用于当前产品'
                };
            }

            // 检查过期时间格式
            const expiresAt = new Date(data.expiresAt);
            if (isNaN(expiresAt.getTime())) {
                return {
                    isValid: false,
                    error: '激活码过期时间格式无效'
                };
            }

            // 检查是否已过期
            if (expiresAt < new Date()) {
                return {
                    isValid: false,
                    error: '激活码已过期'
                };
            }

        } catch (error) {
            return {
                isValid: false,
                error: '激活码数据格式无效'
            };
        }

        return {
            isValid: true
        };
    }

    /**
     * 实时验证激活码输入
     */
    static validateInput(input: string): ActivationCodeValidationResult {
        if (!input.trim()) {
            return { isValid: false };
        }

        // 检查是否包含非法字符
        const validChars = /^[A-Za-z0-9+/=.\s-]+$/;
        if (!validChars.test(input)) {
            return {
                isValid: false,
                warning: '激活码包含特殊字符，请检查是否正确复制'
            };
        }

        // 检查基本长度
        if (input.length < 100) {
            return {
                isValid: false,
                warning: '激活码长度不足，请继续输入'
            };
        }

        // 检查是否包含点号分隔符
        if (!input.includes('.')) {
            return {
                isValid: false,
                warning: '激活码应包含点号分隔符'
            };
        }

        return { isValid: true };
    }
}

export const licenseManager = new LicenseManager();
