/**
 * 许可证管理器 - 开源免费版本
 * 所有功能完全免费，此模块仅用于兼容性
 */

export interface LicenseInfo {
    activationCode: string;
    isActivated: boolean;
    activatedAt: string;
    deviceFingerprint: string;
    expiresAt: string;
    productVersion: string;
    licenseType: 'lifetime' | 'subscription';
}

export class LicenseManager {
    private static instance: LicenseManager;
    
    private constructor() {}
    
    public static getInstance(): LicenseManager {
        if (!LicenseManager.instance) {
            LicenseManager.instance = new LicenseManager();
        }
        return LicenseManager.instance;
    }
    
    /**
     * 获取许可证信息（开源版本始终激活）
     */
    public async getLicenseInfo(): Promise<LicenseInfo | null> {
        return {
            activationCode: 'OPENSOURCE-FREE-VERSION',
            isActivated: true,
            activatedAt: new Date().toISOString(),
            deviceFingerprint: 'opensource',
            expiresAt: '2099-12-31T23:59:59.999Z',
            productVersion: '1.0.0',
            licenseType: 'lifetime'
        };
    }
    
    /**
     * 验证激活码（开源版本始终返回成功）
     */
    public async validateActivationCode(code: string): Promise<{success: boolean; message: string}> {
        return {
            success: true,
            message: '开源免费版本，所有功能已解锁'
        };
    }
    
    /**
     * 激活许可证（开源版本无需激活）
     */
    public async activateLicense(code: string): Promise<{success: boolean; message: string}> {
        return {
            success: true,
            message: '开源免费版本，所有功能已解锁'
        };
    }
    
    /**
     * 检查是否激活（始终返回 true）
     */
    public isActivated(): boolean {
        return true;
    }
}

export const licenseManager = LicenseManager.getInstance();
