import { logger } from "../utils/logger";
/**
 * Obsidian导航服务
 * 实现从Weave卡片到Obsidian的跳转导航功能
 */

import { MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import type { WeavePlugin } from "../main";
import type { BlockLinkInfo } from "../utils/block-link-manager";
import { showNotification } from "../utils/notifications";
import { openFileWithExistingLeaf } from "../utils/workspace-navigation";

export interface NavigationTarget {
	/** 文件路径 */
	filePath: string;
	/** 块ID（可选） */
	blockId?: string;
	/** 行号（可选） */
	lineNumber?: number;
	/** 列号（可选） */
	columnNumber?: number;
}

export interface NavigationResult {
	/** 导航是否成功 */
	success: boolean;
	/** 错误信息 */
	error?: string;
	/** 打开的文件 */
	file?: TFile;
	/** 使用的工作区叶子 */
	leaf?: WorkspaceLeaf;
}

export interface NavigationOptions {
	/** 是否在新标签页中打开 */
	newTab?: boolean;
	/** 是否在侧边栏中打开 */
	inSidebar?: boolean;
	/** 是否聚焦到目标位置 */
	focus?: boolean;
	/** 是否显示通知 */
	showNotification?: boolean;
	/** 导航模式 */
	mode?: "source" | "preview" | "live-preview";
}

export class ObsidianNavigationService {
	private plugin: WeavePlugin;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	/**
	 * 导航到指定的Obsidian文件位置
	 */
	async navigateToFile(
		target: NavigationTarget,
		options: NavigationOptions = {}
	): Promise<NavigationResult> {
		try {
			logger.debug(`🧭 [NavigationService] 导航到文件: ${target.filePath}`);

			// 设置默认选项
			const opts = {
				newTab: false,
				inSidebar: false,
				focus: true,
				showNotification: true,
				mode: "source" as const,
				...options,
			};

			// 获取文件
			const file = this.plugin.app.vault.getAbstractFileByPath(target.filePath);
			if (!(file instanceof TFile)) {
				const error = `文件不存在: ${target.filePath}`;
				logger.error(`❌ [NavigationService] ${error}`);

				if (opts.showNotification) {
					showNotification(error, "error");
				}

				return { success: false, error };
			}

			let leaf: WorkspaceLeaf | null;
			if (opts.inSidebar) {
				leaf =
					this.plugin.app.workspace.getRightLeaf(false) || this.plugin.app.workspace.getLeaf("tab");
				await leaf.openFile(file, {
					active: opts.focus,
					state: {
						mode: opts.mode,
					},
				});
			} else {
				leaf = await openFileWithExistingLeaf(this.plugin.app, file, {
					openInNewTab: opts.newTab,
					focus: opts.focus,
					openState: {
						mode: opts.mode,
					},
				});
			}

			if (!leaf) {
				const error = `无法打开文件: ${target.filePath}`;
				return { success: false, error };
			}

			// 如果有块ID或行号，跳转到指定位置
			if (target.blockId || target.lineNumber) {
				await this.navigateToPosition(leaf, target);
			}

			logger.debug(`✅ [NavigationService] 导航成功: ${target.filePath}`);

			if (opts.showNotification) {
				const fileName = file.name;
				showNotification(`已跳转到: ${fileName}`, "success");
			}

			return {
				success: true,
				file,
				leaf,
			};
		} catch (error) {
			const errorMsg = `导航失败: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(`❌ [NavigationService] ${errorMsg}`, error);

			if (options.showNotification !== false) {
				showNotification(errorMsg, "error");
			}

			return {
				success: false,
				error: errorMsg,
			};
		}
	}

	/**
	 * 通过块链接导航
	 */
	async navigateToBlockLink(
		blockInfo: BlockLinkInfo,
		filePath: string,
		options: NavigationOptions = {}
	): Promise<NavigationResult> {
		const target: NavigationTarget = {
			filePath,
			blockId: blockInfo.blockId,
			lineNumber: blockInfo.lineNumber,
		};

		return this.navigateToFile(target, options);
	}

	/**
	 * 通过URI链接导航
	 */
	async navigateToURI(uri: string): Promise<NavigationResult> {
		try {
			logger.debug(`🔗 [NavigationService] 通过URI导航: ${uri}`);

			// 解析URI
			const parsed = this.parseObsidianURI(uri);
			if (!parsed) {
				const error = `无效的Obsidian URI: ${uri}`;
				logger.error(`❌ [NavigationService] ${error}`);
				return { success: false, error };
			}

			const currentVaultName = this.plugin.app.vault.getName();
			if (parsed.vaultName && parsed.vaultName !== currentVaultName) {
				try {
					window.open(uri);
					return { success: true };
				} catch (error) {
					const errorMsg = `URI导航失败: ${error instanceof Error ? error.message : String(error)}`;
					logger.error(`❌ [NavigationService] ${errorMsg}`, error);
					return { success: false, error: errorMsg };
				}
			}

			// 使用解析的信息导航
			return this.navigateToFile(parsed.target, { showNotification: true });
		} catch (error) {
			const errorMsg = `URI导航失败: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(`❌ [NavigationService] ${errorMsg}`, error);
			return { success: false, error: errorMsg };
		}
	}

	/**
	 * 导航到指定位置（块ID或行号）
	 */
	private async navigateToPosition(leaf: WorkspaceLeaf, target: NavigationTarget): Promise<void> {
		try {
			//  性能优化：使用 requestAnimationFrame 等待编辑器就绪，而不是固定延迟
			await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));

			const view = leaf.view;
			if (!(view instanceof MarkdownView)) {
				logger.warn("⚠️ [NavigationService] 不是Markdown视图，无法定位到具体位置");
				return;
			}

			const editor = view.editor;
			if (!editor) {
				logger.warn("⚠️ [NavigationService] 无法获取编辑器实例");
				return;
			}

			let targetLine = 0;

			// 如果有块ID，查找块ID所在行
			if (target.blockId) {
				const content = editor.getValue();

				//  性能优化：使用正则表达式一次性查找，避免split和逐行遍历
				const blockPattern = new RegExp(`\\^${target.blockId}(?![A-Za-z0-9_-])`, "gm");
				const match = blockPattern.exec(content);

				if (match) {
					// 计算匹配位置所在的行号
					const beforeMatch = content.substring(0, match.index);
					targetLine = beforeMatch.split("\n").length - 1;
					logger.debug(
						`🎯 [NavigationService] 找到块ID ^${target.blockId} 在第 ${targetLine + 1} 行`
					);
				} else {
					logger.warn(`⚠️ [NavigationService] 未找到块ID ^${target.blockId}`);
				}
			}
			// 否则使用行号
			else if (target.lineNumber) {
				targetLine = Math.max(0, target.lineNumber - 1); // 转换为0基索引
				logger.debug(`🎯 [NavigationService] 导航到第 ${target.lineNumber} 行`);
			}

			// 设置光标位置
			const column = target.columnNumber || 0;
			const cursorPos = { line: targetLine, ch: column };

			// 验证位置对象有效性
			if (typeof targetLine === "number" && targetLine >= 0) {
				editor.setCursor(cursorPos);

				// 轻量高亮：选中目标行并在短时间后还原，模拟"闪烁"提示
				try {
					const lineText: string = editor.getLine(targetLine) ?? "";
					if (lineText !== null) {
						const startPos = { line: targetLine, ch: 0 };
						const endPos = { line: targetLine, ch: Math.max(0, lineText.length) };
						editor.setSelection(startPos, endPos);

						window.setTimeout(() => {
							try {
								editor.setCursor(cursorPos);
							} catch (e) {
								logger.warn("⚠️ [NavigationService] 恢复光标位置失败:", e);
							}
						}, 800);
					}
				} catch (highlightError) {
					logger.warn("⚠️ [NavigationService] 高亮行失败:", highlightError);
				}

				// 滚动到目标位置
				try {
					editor.scrollIntoView(cursorPos, true);
				} catch (scrollError) {
					logger.warn("⚠️ [NavigationService] 滚动到位置失败:", scrollError);
				}
			} else {
				logger.warn(`⚠️ [NavigationService] 无效的目标行号: ${targetLine}`);
			}

			logger.debug(`✅ [NavigationService] 已定位到 行:${targetLine + 1} 列:${column + 1}`);
		} catch (error) {
			logger.error("❌ [NavigationService] 定位到具体位置失败:", error);
		}
	}

	/**
	 * 解析Obsidian URI
	 */
	private parseObsidianURI(uri: string): { target: NavigationTarget; vaultName?: string } | null {
		try {
			const url = new URL(uri);

			if (url.protocol !== "obsidian:" || url.hostname !== "open") {
				return null;
			}

			const params = url.searchParams;
			const vaultName = params.get("vault") ?? undefined;
			const filePath = params.get("file");
			const blockId = params.get("block");
			const line = params.get("line");

			if (!filePath) {
				return null;
			}

			let decodedFilePath = decodeURIComponent(filePath);

			let fileAnchor = "";
			if (decodedFilePath.includes("#")) {
				const idx = decodedFilePath.indexOf("#");
				fileAnchor = decodedFilePath.slice(idx + 1);
				decodedFilePath = decodedFilePath.slice(0, idx);
			}

			const hashAnchor = url.hash ? decodeURIComponent(url.hash.slice(1)) : "";

			let finalBlockId: string | undefined;
			const anchorCandidate = hashAnchor || fileAnchor;
			if (anchorCandidate?.startsWith("^")) {
				finalBlockId = anchorCandidate.slice(1);
			}

			const target: NavigationTarget = {
				filePath: decodedFilePath,
			};

			if (blockId) target.blockId = blockId;
			else if (finalBlockId) target.blockId = finalBlockId;

			if (line) {
				const lineNumber = parseInt(line, 10);
				if (!Number.isNaN(lineNumber)) {
					target.lineNumber = lineNumber;
				}
			}

			return { target, vaultName };
		} catch (error) {
			logger.error("❌ [NavigationService] 解析URI失败:", error);
			return null;
		}
	}

	/**
	 * 创建导航按钮组件
	 */
	createNavigationButton(
		target: NavigationTarget,
		options: NavigationOptions & { text?: string; icon?: string } = {}
	): HTMLElement {
		const button = activeDocument.createElement("button");
		button.className = "weave-nav-button weave-nav-button--action";

		// 设置按钮内容
		const text = options.text || "跳转到Obsidian";
		const icon = options.icon || "🔗";

		const iconSpan = activeDocument.createElement("span");
		iconSpan.className = "nav-icon";
		iconSpan.textContent = icon;
		button.appendChild(iconSpan);

		const textSpan = activeDocument.createElement("span");
		textSpan.className = "nav-text";
		textSpan.textContent = text;
		button.appendChild(textSpan);

		// 添加点击事件
		button.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();

			void (async () => {
				const result = await this.navigateToFile(target, options);
				if (!result.success) {
					logger.error("导航失败:", result.error);
				}
			})();
		});

		// 添加样式

		// 添加悬停效果
		return button;
	}

	/**
	 * 批量导航测试
	 */
	async testNavigationTargets(targets: NavigationTarget[]): Promise<{
		successful: number;
		failed: number;
		results: NavigationResult[];
	}> {
		logger.debug(`🧪 [NavigationService] 开始批量导航测试: ${targets.length} 个目标`);

		const results: NavigationResult[] = [];
		let successful = 0;
		let failed = 0;

		for (const target of targets) {
			try {
				const result = await this.navigateToFile(target, {
					showNotification: false,
					focus: false,
				});

				results.push(result);

				if (result.success) {
					successful++;
				} else {
					failed++;
				}

				// 添加小延迟
				await new Promise((resolve) => window.setTimeout(resolve, 100));
			} catch (error) {
				const errorResult: NavigationResult = {
					success: false,
					error: `测试失败: ${error instanceof Error ? error.message : String(error)}`,
				};
				results.push(errorResult);
				failed++;
			}
		}

		logger.debug(`✅ [NavigationService] 批量测试完成: ${successful} 成功, ${failed} 失败`);

		return {
			successful,
			failed,
			results,
		};
	}

	/**
	 * 获取当前活动文件信息
	 */
	getCurrentFileInfo(): {
		file: TFile | null;
		filePath: string | null;
		cursor: { line: number; ch: number } | null;
	} {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

		if (!view) {
			return { file: null, filePath: null, cursor: null };
		}

		const file = view.file;
		const editor = view.editor as { getCursor?: () => { line: number; ch: number } } | undefined;
		const cursor = editor?.getCursor?.() ?? null;

		return {
			file,
			filePath: file?.path || null,
			cursor,
		};
	}

	/**
	 * 检查文件是否可以导航
	 */
	canNavigateToFile(filePath: string): boolean {
		try {
			const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
			return file instanceof TFile;
		} catch {
			return false;
		}
	}
}
