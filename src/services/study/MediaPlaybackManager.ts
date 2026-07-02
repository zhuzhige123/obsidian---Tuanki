/**
 * 学习界面媒体播放管理器
 *
 * 职责：
 * - 自动播放媒体文件
 * - 媒体元素查找和管理
 * - 播放时机控制
 * - 播放设置管理
 *
 * @created 2025-11-29
 */

import { tick } from "svelte";
import type { WeavePlugin } from "../../main";
import { createErrorMessage } from "../../utils/helpers";
import { logger } from "../../utils/logger";

/**
 * 播放模式
 */
export type PlayMode = "first" | "all";

/**
 * 播放时机
 */
export type PlayTiming = "cardChange" | "showAnswer";

/**
 * 媒体播放设置
 */
export interface MediaPlaybackSettings {
	enabled: boolean;
	mode: PlayMode;
	timing: PlayTiming;
	playbackInterval: number;
}

/**
 * 播放触发来源
 */
export type PlayTrigger = "callback" | "mutation" | "manual";

/**
 * 媒体播放管理器
 */
export class MediaPlaybackManager {
	private settings: MediaPlaybackSettings;

	constructor(private plugin: WeavePlugin) {
		this.settings = this.loadSettings();
	}

	/**
	 * 加载播放设置
	 */
	private loadSettings(): MediaPlaybackSettings {
		const mediaAutoPlay = this.plugin.settings.mediaAutoPlay;
		return {
			enabled: mediaAutoPlay?.enabled ?? false,
			mode: mediaAutoPlay?.mode ?? "first",
			timing: mediaAutoPlay?.timing ?? "cardChange",
			playbackInterval: mediaAutoPlay?.playbackInterval ?? 2000,
		};
	}

	/**
	 * 获取当前设置
	 */
	getSettings(): MediaPlaybackSettings {
		return { ...this.settings };
	}

	/**
	 * 更新设置
	 */
	async updateSetting(
		setting: keyof MediaPlaybackSettings,
		value: boolean | PlayMode | PlayTiming | number
	): Promise<void> {
		this.settings = { ...this.settings, [setting]: value };

		const currentMediaAutoPlay = this.plugin.settings.mediaAutoPlay ?? {
			enabled: false,
			mode: "first" as const,
			timing: "cardChange" as const,
			playbackInterval: 2000,
		};
		this.plugin.settings.mediaAutoPlay = { ...currentMediaAutoPlay, [setting]: value };

		// 保存设置
		await this.plugin.saveSettings();
	}

	/**
	 * 自动播放媒体文件
	 *
	 * 四重策略确保可靠性：
	 * 1. 立即查找（快速响应）
	 * 2. 重试机制（应对渲染延迟）
	 * 3. 深度调试查找（media-extended 等插件支持）
	 * 4. MutationObserver（备用方案）
	 */
	async autoPlay(triggeredBy: PlayTrigger = "manual"): Promise<void> {
		if (!this.settings.enabled) {
			return; // 未启用自动播放
		}

		logger.debug(` 🎵 开始自动播放媒体 (触发方式: ${triggeredBy})`);

		// ⚡ 策略1: 立即查找（最快，无调试）
		await tick(); // 等待 Svelte 更新 DOM
		let mediaElements = this.findMediaElements();

		if (mediaElements.length > 0) {
			logger.debug(" ✅ 立即找到媒体元素");
			await this.playMediaElements(mediaElements);
			return;
		}

		// 🔄 策略2: 重试机制（应对异步渲染延迟）
		const MAX_RETRIES = 3;
		const RETRY_DELAY = 200; // 200ms 间隔

		for (let i = 0; i < MAX_RETRIES; i++) {
			await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY));
			mediaElements = this.findMediaElements();

			if (mediaElements.length > 0) {
				logger.debug(`✅ 重试成功找到媒体元素 (第 ${i + 1} 次重试)`);
				await this.playMediaElements(mediaElements);
				return;
			}

			logger.debug(`⏳ 重试 ${i + 1}/${MAX_RETRIES} 未找到媒体元素`);
		}

		// 🔍 策略3: 深度调试查找（启用完整调试信息）
		logger.debug("🔍 启动深度调试查找（支持 media-extended 等插件）");
		await new Promise((resolve) => window.setTimeout(resolve, 300)); // 额外延迟
		mediaElements = this.findMediaElements(undefined, true); // 🔥 启用调试模式

		if (mediaElements.length > 0) {
			logger.debug("✅ 深度调试查找成功");
			await this.playMediaElements(mediaElements);
			return;
		}

		// 👀 策略4: MutationObserver 备用方案（最可靠）
		logger.debug("⏳ 启动 MutationObserver 监听媒体元素");
		await this.observeMediaElements();
	}

	/**
	 * 播放媒体元素，支持等待加载和顺序播放
	 */
	private async playMediaElements(mediaElements: HTMLMediaElement[]): Promise<void> {
		if (mediaElements.length === 0) {
			logger.debug(" 没有媒体元素需要播放");
			return;
		}

		logger.debug(`🎵 找到 ${mediaElements.length} 个媒体元素，播放模式: ${this.settings.mode}`);

		try {
			if (this.settings.mode === "first") {
				// 只播放第一个（等待就绪）
				const firstMedia = mediaElements[0];
				await this.playMediaElement(firstMedia, 1, 1);
			} else {
				// 🔥 改进：顺序播放所有媒体（而非同时播放）
				logger.debug(" 🎵 开始顺序播放所有媒体");
				for (let i = 0; i < mediaElements.length; i++) {
					const media = mediaElements[i];

					// 🎬 播放当前媒体并等待播放完成
					await this.playMediaElementSequentially(media, i + 1, mediaElements.length);

					// ⏸️ 如果不是最后一个，等待间隔后再播放下一个
					if (i < mediaElements.length - 1) {
						logger.debug(`⏸️ 等待 ${this.settings.playbackInterval}ms 后播放下一个媒体`);
						await new Promise((resolve) => window.setTimeout(resolve, this.settings.playbackInterval));
					}
				}
			}
		} catch (error) {
			logger.error("播放媒体失败:", error);
		}
	}

	/**
	 * 顺序播放单个媒体元素
	 */
	private async playMediaElementSequentially(
		media: HTMLMediaElement,
		index: number,
		total: number
	): Promise<void> {
		const prefix = total > 1 ? `${index}/${total}` : "";
		const logTag = prefix ? `[${prefix}]` : "";

		try {
			logger.debug(`🎬 ${logTag} 开始播放媒体:`, {
				tagName: media.tagName,
				src: media.src || media.currentSrc || "no-src",
				duration: media.duration || "unknown",
			});

			// 重置到开头
			media.currentTime = 0;

			// 等待媒体就绪（5秒超时）
			await this.waitForMediaReady(media, 5000);

			// 开始播放
			await media.play();
			logger.debug(`✅ ${logTag} 媒体开始播放`);

			// 等待播放完成（15秒超时）
			await new Promise<void>((resolve, _reject) => {
				let resolved = false;
				const timeout = window.setTimeout(() => {
					if (!resolved) {
						resolved = true;
						logger.debug(`⏰ ${logTag} 播放超时，强制结束`);
						resolve();
					}
				}, 15000);

				const onEnded = () => {
					if (!resolved) {
						resolved = true;
						window.clearTimeout(timeout);
						media.removeEventListener("ended", onEnded);
						logger.debug(`🏁 ${logTag} 媒体播放完成`);
						resolve();
					}
				};

				media.addEventListener("ended", onEnded);

				// 如果媒体已经结束或暂停
				if (media.ended || media.paused) {
					onEnded();
				}
			});
		} catch (error) {
			logger.error(`播放媒体失败 ${logTag}:`, error);
			throw error;
		}
	}

	/**
	 * 播放单个媒体元素（带重试）
	 */
	private async playMediaElement(
		media: HTMLMediaElement,
		index: number,
		total: number
	): Promise<void> {
		const prefix = total > 1 ? `${index}/${total}` : "";
		const logTag = prefix ? `[${prefix}]` : "";

		try {
			logger.debug(`🎬 ${logTag} 准备播放媒体:`, {
				tagName: media.tagName,
				src: media.src || media.currentSrc || "no-src",
				readyState: media.readyState,
				paused: media.paused,
			});

			// 重置到开头
			media.currentTime = 0;

			// 等待媒体就绪（3秒超时）
			await this.waitForMediaReady(media, 3000);

			// 尝试播放
			await media.play();
			logger.debug(`✅ ${logTag} 媒体播放成功`);
		} catch (error: unknown) {
			if (error instanceof DOMException && error.name === "NotAllowedError") {
				logger.debug(`🔇 ${logTag} 浏览器阻止自动播放（用户交互要求）`);
			} else if (error instanceof DOMException && error.name === "NotSupportedError") {
				logger.warn(`❌ ${logTag} 媒体格式不支持:`, media.src);
			} else {
				logger.warn(`⚠️ ${logTag} 播放失败:`, createErrorMessage(error));
				throw error;
			}
		}
	}

	/**
	 * 等待媒体就绪
	 */
	private waitForMediaReady(media: HTMLMediaElement, timeout: number): Promise<void> {
		return new Promise((resolve, reject) => {
			// 如果已经就绪，立即返回
			if (media.readyState >= 2) {
				resolve();
				return;
			}

			let resolved = false;
			const timeoutId = window.setTimeout(() => {
				if (!resolved) {
					resolved = true;
					cleanup();
					reject(new Error("Media loading timeout"));
				}
			}, timeout);

			const onLoadedData = () => {
				if (!resolved && media.readyState >= 2) {
					resolved = true;
					cleanup();
					resolve();
				}
			};

			const onCanPlay = () => {
				if (!resolved && media.readyState >= 2) {
					resolved = true;
					cleanup();
					resolve();
				}
			};

			const onError = (e: Event) => {
				if (!resolved) {
					resolved = true;
					cleanup();
					reject(new Error(`Media loading error: ${(e as ErrorEvent).message || "unknown"}`));
				}
			};

			function cleanup() {
				window.clearTimeout(timeoutId);
				media.removeEventListener("loadeddata", onLoadedData);
				media.removeEventListener("canplay", onCanPlay);
				media.removeEventListener("error", onError);
			}

			// 添加事件监听器
			media.addEventListener("loadeddata", onLoadedData);
			media.addEventListener("canplay", onCanPlay);
			media.addEventListener("error", onError);

			// 🔥 关键：主动触发加载（如果还未开始）
			if (media.networkState === 0) {
				// NETWORK_EMPTY
				logger.debug("[waitForMediaReady] 主动触发加载: load()");
				media.load();
			}
		});
	}

	/**
	 * 查找媒体元素，兼容更多插件和结构
	 */
	private findMediaElements(rootContainer?: HTMLElement, debug = false): HTMLMediaElement[] {
		const container = rootContainer || activeDocument.body;
		const elementsSet = new Set<HTMLMediaElement>();

		if (debug) {
			logger.debug("[findMediaElements] 🔍 开始媒体元素搜索");
			logger.debug("[findMediaElements] 容器:", container.className, container.id);
		}

		// 基础媒体选择器（标准 + 常见嵌套结构）
		const standardSelectors = [
			"audio",
			"video",
			"audio[src]",
			"video[src]",
			".media-embed audio",
			".media-embed video",
			".markdown-preview-view audio",
			".markdown-preview-view video",
			".el-embed audio",
			".el-embed video",
			".block-language-audio audio",
			".block-language-video video",
			'div[data-type="audio"] audio',
			'div[data-type="video"] video',
		];

		standardSelectors.forEach((_selector) => {
			try {
				const elements = container.querySelectorAll<HTMLMediaElement>(_selector);
				elements.forEach((el) => elementsSet.add(el));
				if (debug && elements.length > 0) {
					logger.debug(
						`[findMediaElements] ✅ 标准选择器 "${_selector}" 找到 ${elements.length} 个元素`
					);
				}
			} catch (e) {
				logger.warn(`[findMediaElements] 选择器查询失败: ${_selector}`, e);
			}
		});

		// Media Extended 插件专用选择器（可选）
		const mediaExtendedSelectors = [
			".media-extended audio",
			".media-extended video",
			'[data-media-type="audio"]',
			'[data-media-type="video"]',
			".mx-audio",
			".mx-video",
		];

		mediaExtendedSelectors.forEach((_selector) => {
			try {
				const elements = container.querySelectorAll<HTMLMediaElement>(_selector);
				elements.forEach((el) => elementsSet.add(el));
				if (debug && elements.length > 0) {
					logger.debug(
						`[findMediaElements] 🔌 media-extended 选择器 "${_selector}" 找到 ${elements.length} 个元素`
					);
				}
			} catch {
				// 静默失败，因为这些是可选选择器
			}
		});

		// 深度遍历备用方案（包括 Shadow DOM）
		const deepFindMedia = (element: Element) => {
			if (element.tagName === "AUDIO" || element.tagName === "VIDEO") {
				elementsSet.add(element as HTMLMediaElement);
				if (debug) {
					logger.debug(`[findMediaElements] 🌲 深度遍历找到: ${element.tagName}`, {
						src: (element as HTMLMediaElement).src,
						parent: element.parentElement?.className,
					});
				}
			}

			// 遍历子元素（包括 Shadow DOM）
			if (element.shadowRoot) {
				if (debug) {
					logger.debug("[findMediaElements] 🌑 检测到 Shadow DOM");
				}
				element.shadowRoot.querySelectorAll("audio, video").forEach((_media) => {
					elementsSet.add(_media as HTMLMediaElement);
					if (debug) {
						logger.debug(`[findMediaElements] 🌑 Shadow DOM 找到: ${_media.tagName}`);
					}
				});
			}

			Array.from(element.children).forEach((child) => deepFindMedia(child));
		};

		// 仅在前两个策略失败时进行深度遍历（性能优化）
		if (elementsSet.size === 0) {
			if (debug) {
				logger.debug("[findMediaElements] ⚠️ 前两个策略未找到媒体，启动深度遍历");
			}
			deepFindMedia(container);
		}

		// 检查 iframe（跨域安全处理）
		container.querySelectorAll("iframe").forEach((_iframe) => {
			try {
				if (_iframe.contentDocument) {
					_iframe.contentDocument
						.querySelectorAll<HTMLMediaElement>("audio, video")
						.forEach((_media) => {
							elementsSet.add(_media);
							if (debug) {
								logger.debug(`[findMediaElements] 🖼️ iframe 内找到: ${_media.tagName}`);
							}
						});
				}
			} catch {
				// 跨域 iframe 无法访问，静默失败
				if (debug) {
					logger.debug("[findMediaElements] ⚠️ iframe 跨域，无法访问内容");
				}
			}
		});

		const result = Array.from(elementsSet);

		if (debug) {
			logger.debug(`[findMediaElements] 📊 总计找到 ${result.length} 个媒体元素`);
			if (result.length > 0) {
				result.forEach((media, index) => {
					logger.debug(`[findMediaElements]   ${index + 1}. ${media.tagName}:`, {
						src: media.src || media.currentSrc || "no-src",
						className: media.className,
						parent: media.parentElement?.className,
						readyState: media.readyState,
					});
				});
			}
		}

		return result;
	}

	/**
	 * 👀 使用 MutationObserver 监听媒体元素出现
	 */
	private observeMediaElements(): Promise<void> {
		return new Promise((resolve) => {
			const container = activeDocument.querySelector(".main-study-area") || activeDocument.body;
			let resolved = false;
			let checkCount = 0;

			const observer = new MutationObserver((_mutations) => {
				if (resolved) return;

				checkCount++;
				logger.debug(`🔍 MutationObserver 检查 #${checkCount}`);

				// 使用调试模式查找（显示详细信息）
				const mediaElements = this.findMediaElements(container as HTMLElement, true);
				if (mediaElements.length > 0) {
					resolved = true;
					observer.disconnect();
					logger.debug("✅ MutationObserver 检测到媒体元素");
					void this.playMediaElements(mediaElements);
					resolve();
				}
			});

			// 监听 DOM 变化（包括子树和属性变化）
			observer.observe(container, {
				childList: true, // 监听子节点添加/删除
				subtree: true, // 监听所有后代节点
				attributes: true, // 监听属性变化（media-extended 可能动态设置属性）
				attributeFilter: ["src", "data-src", "data-media-type"], // 关注的属性
			});

			// 3秒后自动停止（避免永远等待）
			window.setTimeout(() => {
				if (!resolved) {
					resolved = true;
					observer.disconnect();
					logger.debug("⏰ MutationObserver 超时停止");
					resolve();
				}
			}, 3000);
		});
	}

	/**
	 * 📢 处理渲染完成回调
	 */
	handleRenderComplete(): void {
		logger.debug(" 📢 收到渲染完成回调");

		// 如果启用了自动播放且时机为切换卡片
		if (this.settings.enabled && this.settings.timing === "cardChange") {
			// 使用回调触发方式，优先级最高
			void this.autoPlay("callback");
		}
	}

	/**
	 * 检查是否应该播放（根据时机设置）
	 */
	shouldPlay(timing: PlayTiming): boolean {
		return this.settings.enabled && this.settings.timing === timing;
	}
}
