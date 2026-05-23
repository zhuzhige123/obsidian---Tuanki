import { requestUrl, type RequestUrlResponse } from "obsidian";
import type { App } from "obsidian";
import { logger } from "../utils/logger";
import { vaultStorage } from "./vault-local-storage";
import {
	getLicenseCloudApiBaseUrl,
	isCloudLicenseConfigured,
	LICENSE_CLOUD_CACHE_DAYS,
} from "../config/license-cloud-config";
import { formatCloudLicenseApiError } from "./cloud-license-api-error";

export interface CloudActivationResult {
	success: boolean;
	message?: string;
	devices_count?: number;
	max_devices?: number;
	replaced_old_device?: boolean;
	device_already_registered?: boolean;
	vaults_count?: number;
	max_vaults?: number;
	replaced_old_vault?: boolean;
	expires_at?: string;
	error?: string;
	error_code?: string;
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

function parseCloudResponseBody(
	response: RequestUrlResponse
): { data: Record<string, unknown> | null; parseError?: string } {
	const rawText = (response.text ?? "").trim();
	if (!rawText) {
		return { data: null, parseError: "云端返回为空" };
	}

	try {
		return { data: JSON.parse(rawText) as Record<string, unknown> };
	} catch (error) {
		logger.error("云端响应不是合法 JSON:", rawText.slice(0, 300), error);
		return {
			data: null,
			parseError: `云端返回格式异常（HTTP ${response.status}），请检查函数日志`,
		};
	}
}

export class CloudLicenseValidator {
	private readonly cacheKey = "weave_cloud_cache";
	private app: App | null = null;

	setApp(app: App): void {
		this.app = app;
		vaultStorage.setApp(app);
	}

	isConfigured(): boolean {
		return isCloudLicenseConfigured();
	}

	private get cacheTTL(): number {
		return LICENSE_CLOUD_CACHE_DAYS * 24 * 60 * 60 * 1000;
	}

	private get apiBaseUrl(): string {
		return getLicenseCloudApiBaseUrl();
	}

	/**
	 * 激活设备（云端权威）
	 */
	async activate(
		activationCode: string,
		deviceFingerprint: string,
		email: string,
		platform: string,
		vaultId: string
	): Promise<CloudActivationResult> {
		if (!this.isConfigured()) {
			return {
				success: false,
				error: "云服务未配置，请联系插件维护者完成授权服务器部署",
				is_network_error: false,
			};
		}

		try {
			const response = await requestUrl({
				url: `${this.apiBaseUrl}/activate`,
				method: "POST",
				contentType: "application/json",
				body: JSON.stringify({
					activation_code: activationCode,
					device_fingerprint: deviceFingerprint,
					email: email.toLowerCase().trim(),
					platform,
					vault_id: vaultId,
				}),
				throw: false,
			});

			const parsed = parseCloudResponseBody(response);
			if (!parsed.data) {
				return {
					success: false,
					error: parsed.parseError || "激活失败",
					is_network_error: false,
				};
			}
			const data = parsed.data;

			if (response.status !== 200 || !data.success) {
				return {
					success: false,
					error: formatCloudLicenseApiError(response, data, "激活"),
					error_code: typeof data.error_code === "string" ? data.error_code : undefined,
					is_network_error: false,
				};
			}

			this.clearCache();

			return {
				success: true,
				message: typeof data.message === "string" ? data.message : undefined,
				devices_count: typeof data.devices_count === "number" ? data.devices_count : undefined,
				max_devices: typeof data.max_devices === "number" ? data.max_devices : undefined,
				replaced_old_device: Boolean(data.replaced_old_device),
				device_already_registered: Boolean(data.device_already_registered),
				vaults_count: typeof data.vaults_count === "number" ? data.vaults_count : undefined,
				max_vaults: typeof data.max_vaults === "number" ? data.max_vaults : undefined,
				replaced_old_vault: Boolean(data.replaced_old_vault),
				expires_at: typeof data.expires_at === "string" ? data.expires_at : undefined,
			};
		} catch (error) {
			logger.error("激活请求失败:", error);

			const isNetworkError =
				error instanceof TypeError || (error instanceof Error && error.name === "AbortError");

			return {
				success: false,
				error: isNetworkError ? "网络连接失败，请检查网络后重试" : "激活失败",
				is_network_error: isNetworkError,
			};
		}
	}

	/**
	 * 验证设备是否仍在授权列表
	 */
	async validate(
		activationCode: string,
		deviceFingerprint: string,
		email: string,
		vaultId: string,
		options?: { bypassCache?: boolean }
	): Promise<CloudValidationResult> {
		if (!this.isConfigured()) {
			return {
				valid: false,
				error: "云服务未配置",
				is_network_error: false,
			};
		}

		try {
			if (!options?.bypassCache) {
				const cache = this.getCache();
				if (cache && this.isCacheValid(cache)) {
					return cache.result;
				}
			}

			const response = await requestUrl({
				url: `${this.apiBaseUrl}/validate`,
				method: "POST",
				contentType: "application/json",
				body: JSON.stringify({
					activation_code: activationCode,
					device_fingerprint: deviceFingerprint,
					email: email.toLowerCase().trim(),
					vault_id: vaultId,
				}),
				throw: false,
			});

			const parsed = parseCloudResponseBody(response);
			if (!parsed.data) {
				return {
					valid: false,
					error: parsed.parseError || "验证失败",
					is_network_error: false,
				};
			}
			const data = parsed.data;

			if (response.status !== 200 || !data.valid) {
				return {
					valid: false,
					error: formatCloudLicenseApiError(response, data, "验证"),
					is_network_error: false,
				};
			}

			const result: CloudValidationResult = {
				valid: true,
				expires_at: typeof data.expires_at === "string" ? data.expires_at : undefined,
				devices_count: typeof data.devices_count === "number" ? data.devices_count : undefined,
				max_devices: typeof data.max_devices === "number" ? data.max_devices : undefined,
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
