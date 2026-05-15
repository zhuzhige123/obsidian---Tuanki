import { requestUrl } from "obsidian";
import type { App } from "obsidian";
import { logger } from "../utils/logger";
import { vaultStorage } from "./vault-local-storage";
/**
 * Sealos云端License验证器
 */

export interface CloudActivationResult {
	success: boolean;
	message?: string;
	devices_count?: number;
	max_devices?: number;
	error?: string;
	is_network_error?: boolean;
}

export interface CloudValidationResult {
	valid: boolean;
	expires_at?: string;
	devices_count?: number;
	max_devices?: number;
	error?: string;
	is_network_error?: boolean;
}

export class CloudLicenseValidator {
	private readonly apiUrl = "https://ahwhophvla.bja.sealos.run";
	private readonly cacheKey = "weave_cloud_cache";
	private readonly cacheTTL = 7 * 24 * 60 * 60 * 1000; // 7天
	private app: App | null = null;

	setApp(app: App): void {
		this.app = app;
	}

	/**
	 * 激活设备
	 */
	async activate(
		activationCode: string,
		deviceFingerprint: string,
		email: string,
		platform: string
	): Promise<CloudActivationResult> {
		try {
			const response = await requestUrl({
				url: `${this.apiUrl}/activate`,
				method: "POST",
				contentType: "application/json",
				body: JSON.stringify({
					activation_code: activationCode,
					device_fingerprint: deviceFingerprint,
					email: email.toLowerCase().trim(),
					platform,
				}),
				throw: false,
			});

			const data = response.json;

			if (response.status !== 200 || !data.success) {
				return {
					success: false,
					error: data.error || "激活失败",
					is_network_error: false,
				};
			}

			return {
				success: true,
				message: data.message,
				devices_count: data.devices_count,
				max_devices: data.max_devices,
			};
		} catch (error) {
			logger.error("激活请求失败:", error);

			const isNetworkError =
				error instanceof TypeError || (error instanceof Error && error.name === "AbortError");

			return {
				success: false,
				error: isNetworkError ? "网络连接失败" : "激活失败",
				is_network_error: isNetworkError,
			};
		}
	}

	/**
	 * 验证设备
	 */
	async validate(
		activationCode: string,
		deviceFingerprint: string,
		email: string
	): Promise<CloudValidationResult> {
		try {
			// 检查缓存
			const cache = this.getCache();
			if (cache && this.isCacheValid(cache)) {
				return cache.result;
			}

			const response = await requestUrl({
				url: `${this.apiUrl}/validate`,
				method: "POST",
				contentType: "application/json",
				body: JSON.stringify({
					activation_code: activationCode,
					device_fingerprint: deviceFingerprint,
					email: email.toLowerCase().trim(),
				}),
				throw: false,
			});

			const data = response.json;

			if (response.status !== 200 || !data.valid) {
				return {
					valid: false,
					error: data.error || "验证失败",
					is_network_error: false,
				};
			}

			const result: CloudValidationResult = {
				valid: true,
				expires_at: data.expires_at,
				devices_count: data.devices_count,
				max_devices: data.max_devices,
			};

			this.setCache(result);
			return result;
		} catch (error) {
			logger.error("验证请求失败:", error);

			const isNetworkError =
				error instanceof TypeError || (error instanceof Error && error.name === "AbortError");

			return {
				valid: false,
				error: isNetworkError ? "网络连接失败" : "验证失败",
				is_network_error: isNetworkError,
			};
		}
	}

	private getCache(): { result: CloudValidationResult; cached_at: number } | null {
		try {
			const cached = vaultStorage.getItem(this.cacheKey);
			return cached ? JSON.parse(cached) : null;
		} catch {
			return null;
		}
	}

	private isCacheValid(cache: { cached_at: number }): boolean {
		return Date.now() - cache.cached_at < this.cacheTTL;
	}

	private setCache(result: CloudValidationResult): void {
		try {
			vaultStorage.setItem(
				this.cacheKey,
				JSON.stringify({
					result,
					cached_at: Date.now(),
				})
			);
		} catch {
			// 忽略存储错误
		}
	}

	clearCache(): void {
		try {
			vaultStorage.removeItem(this.cacheKey);
		} catch {
			// 忽略
		}
	}
}
