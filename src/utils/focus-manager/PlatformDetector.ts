/**
 * 平台检测器
 *
 * 使用 Obsidian Platform API 检测运行环境，
 * 决定使用哪种焦点恢复策略。
 */

import { Platform } from "obsidian";
import { readUnknownProperty } from "../dynamic-access";
import { logger } from "../logger";
import type { IPlatformDetector, PlatformInfo } from "./types";

/**
 * 平台检测器实现
 */
export class PlatformDetector implements IPlatformDetector {
	private cachedInfo: PlatformInfo | null = null;

	/**
	 * 检测平台信息
	 * 结果会被缓存，因为平台信息在运行时不会改变
	 */
	detect(): PlatformInfo {
		if (this.cachedInfo) {
			return this.cachedInfo;
		}

		try {
			// 使用 Obsidian Platform API
			const isMobile = Platform.isMobile || Platform.isMobileApp;
			const isDesktop = Platform.isDesktop || Platform.isDesktopApp;

			// iOS 检测
			const isIOS = this.detectIOS();

			// Android 检测
			const isAndroid = this.detectAndroid();

			this.cachedInfo = {
				isMobile,
				isDesktop: isDesktop && !isMobile,
				isIOS,
				isAndroid,
			};

			logger.debug("[PlatformDetector] 平台检测结果:", this.cachedInfo);
			return this.cachedInfo;
		} catch {
			// API 不可用时的降级处理
			logger.warn("[PlatformDetector] Platform API 不可用，使用降级检测");
			return this.fallbackDetect();
		}
	}

	/**
	 * 是否为移动应用
	 */
	isMobileApp(): boolean {
		const info = this.detect();
		return info.isMobile;
	}

	/**
	 * 检测 iOS
	 */
	private detectIOS(): boolean {
		try {
			// 优先使用 Obsidian API
			if (typeof Platform !== "undefined" && "isIosApp" in Platform) {
				return readUnknownProperty(Platform, "isIosApp") === true;
			}

			// 降级：使用 userAgent 检测
			return false;
		} catch {
			return false;
		}
	}

	/**
	 * 检测 Android
	 */
	private detectAndroid(): boolean {
		try {
			// 优先使用 Obsidian API
			if (typeof Platform !== "undefined" && "isAndroidApp" in Platform) {
				return readUnknownProperty(Platform, "isAndroidApp") === true;
			}

			// 降级：使用 userAgent 检测
			return false;
		} catch {
			return false;
		}
	}

	/**
	 * 降级检测方法
	 * 当 Obsidian Platform API 不可用时使用
	 */
	private fallbackDetect(): PlatformInfo {
		const isMobile = this.fallbackIsMobile();
		const isIOS = this.detectIOS();
		const isAndroid = this.detectAndroid();

		this.cachedInfo = {
			isMobile,
			isDesktop: !isMobile,
			isIOS,
			isAndroid,
		};

		logger.debug("[PlatformDetector] 降级检测结果:", this.cachedInfo);
		return this.cachedInfo;
	}

	/**
	 * 降级移动端检测
	 */
	private fallbackIsMobile(): boolean {
		try {
			if (typeof window === "undefined") return false;

			// 检查触摸支持
			const hasTouch =
				"ontouchstart" in window ||
				(typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);

			// 检查屏幕尺寸
			const isSmallScreen = window.innerWidth <= 768;

			// 检查 userAgent
			const hasCoarsePointer =
				typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

			// 综合判断：有触摸 + (小屏幕 或 移动端UA)
			return (hasTouch || hasCoarsePointer) && isSmallScreen;
		} catch {
			return false;
		}
	}

	/**
	 * 清除缓存（用于测试）
	 */
	clearCache(): void {
		this.cachedInfo = null;
	}
}

// 导出单例
let platformDetectorInstance: PlatformDetector | null = null;

export function getPlatformDetector(): PlatformDetector {
	if (!platformDetectorInstance) {
		platformDetectorInstance = new PlatformDetector();
	}
	return platformDetectorInstance;
}
