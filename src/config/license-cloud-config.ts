/**
 * 云端许可证 API 配置
 *
 * 部署阿里云函数计算后，将 LICENSE_CLOUD_API_BASE_URL 改为你的 HTTPS 触发器地址（无尾部斜杠）。
 * 本地调试可先运行 cloud-license-service：npm run dev，再设为 http://127.0.0.1:8787
 */
export const LICENSE_CLOUD_API_BASE_URL =
	"https://weave-c-license-emylixqfay.cn-hangzhou.fcapp.run";

/** 定期云端复检间隔（天） */
export const LICENSE_CLOUD_REVALIDATION_DAYS = 7;

/** 产品标准：每台许可证最多 5 台物理设备（早期码内嵌 3 会在云端/插件侧自动提升到 5） */
export const LICENSE_CLOUD_MAX_DEVICES = 5;

/** 插件端验证结果本地缓存（天），弱网时减少请求 */
export const LICENSE_CLOUD_CACHE_DAYS = 7;

export function isCloudLicenseConfigured(): boolean {
	const url = LICENSE_CLOUD_API_BASE_URL.trim();
	if (!url) {
		return false;
	}
	if (/YOUR_FC|REPLACE_ME|example\.com/i.test(url)) {
		return false;
	}
	return url.startsWith("https://") || url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost");
}

export function getLicenseCloudApiBaseUrl(): string {
	return LICENSE_CLOUD_API_BASE_URL.replace(/\/+$/, "");
}
