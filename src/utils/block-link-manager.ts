import { App, TFile } from "obsidian";
import { logger } from "../utils/logger";
import { generateBlockId } from "./helpers";

export interface BlockLinkInfo {
	blockId: string;
	blockLink: string;
	sourceFile: string;
	sourceDocument: string;
	lineNumber?: number;
	uniqueIdentifier: string;
	content: string;
}

export interface BlockLinkCreationResult {
	success: boolean;
	blockLinkInfo?: BlockLinkInfo;
	error?: string;
}

/**
 * 块链接管理器 - 处理Obsidian块链接的创建和管理
 */
export class BlockLinkManager {
	constructor(private app: App) {}

	/**
	 * 为选中的内容创建块链接和唯一标识符
	 * @param selectedText 选中的文本内容
	 * @param sourceFileHint 可选的源文件提示
	 * @returns 块链接创建结果
	 */
	async createBlockLinkForSelection(
		selectedText: string,
		sourceFileHint?: string
	): Promise<BlockLinkCreationResult> {
		try {
			logger.debug("🔗 [BlockLinkManager] 开始创建块链接");

			// 1. 智能获取源文件
			let targetFile = this.app.workspace.getActiveFile();

			// 如果有源文件提示，尝试使用提示的文件
			if (sourceFileHint && (!targetFile || targetFile.basename !== sourceFileHint)) {
				const files = this.app.vault.getMarkdownFiles();
				const hintedFile = files.find(
					(f) => f.basename === sourceFileHint || f.path === sourceFileHint
				);
				if (hintedFile) {
					targetFile = hintedFile;
					logger.debug("🔗 [BlockLinkManager] 使用提示的源文件:", hintedFile.path);
				}
			}

			if (!targetFile) {
				//  改进：即使没有源文件，也要生成基础的来源信息
				logger.warn("⚠️ [BlockLinkManager] 没有找到源文件，生成基础来源信息");
				const uniqueIdentifier = this.generateUniqueIdentifier(selectedText, "unknown");
				return {
					success: false, // 没有源文件时应返回失败状态
					blockLinkInfo: {
						blockId: generateBlockId(),
						blockLink: "",
						sourceFile: "",
						sourceDocument: sourceFileHint || "unknown",
						uniqueIdentifier,
						content: selectedText,
					},
					error: "没有找到活动的源文件，无法创建块链接",
				};
			}

			// 2. 生成唯一标识符和块ID
			const uniqueIdentifier = this.generateUniqueIdentifier(selectedText, targetFile.basename);
			const blockId = generateBlockId();

			logger.debug("🔗 [BlockLinkManager] 生成标识符:", {
				uniqueIdentifier,
				blockId,
				file: targetFile.basename,
			});

			// 3. 检查是否已存在相同内容的块链接
			const existingBlockLink = await this.findExistingBlockLink(selectedText, targetFile);
			if (existingBlockLink) {
				logger.debug("✅ [BlockLinkManager] 找到现有块链接:", existingBlockLink.blockLink);
				return {
					success: true,
					blockLinkInfo: existingBlockLink,
				};
			}

			// 4. 尝试在源文档中创建块链接
			logger.debug("🔗 [BlockLinkManager] 开始在源文档中创建块链接:", {
				file: targetFile.path,
				blockId,
				contentLength: selectedText.length,
			});

			const blockLinkInfo = await this.createBlockLinkInDocument(
				targetFile,
				selectedText,
				blockId,
				uniqueIdentifier
			);

			if (blockLinkInfo) {
				logger.debug("✅ [BlockLinkManager] 块链接创建成功:", {
					blockLink: blockLinkInfo.blockLink,
					lineNumber: blockLinkInfo.lineNumber,
					sourceFile: blockLinkInfo.sourceFile,
				});
				return { success: true, blockLinkInfo };
			} else {
				// 块链接创建失败时返回失败状态，但保护内容
				logger.error("❌ [BlockLinkManager] 块链接创建失败，返回基础信息");
				return {
					success: false, // 返回失败状态，让调用方知道块链接创建失败
					blockLinkInfo: {
						blockId,
						blockLink: `[[${targetFile.basename}]]`, // 至少提供文档链接
						sourceFile: targetFile.path,
						sourceDocument: targetFile.basename,
						uniqueIdentifier,
						content: selectedText,
					},
					error: "无法在源文档中创建块链接，可能是权限问题或文档格式问题",
				};
			}
		} catch (error) {
			logger.error("❌ [BlockLinkManager] 创建块链接失败:", error);
			//  改进：即使出错，也要保护内容
			const uniqueIdentifier = this.generateUniqueIdentifier(selectedText, "error");
			return {
				success: true, // 改为 true，确保内容不丢失
				blockLinkInfo: {
					blockId: generateBlockId(),
					blockLink: "",
					sourceFile: "",
					sourceDocument: "unknown",
					uniqueIdentifier,
					content: selectedText,
				},
			};
		}
	}

	/**
	 * 生成内容的唯一标识符
	 */
	private generateUniqueIdentifier(content: string, fileName: string): string {
		// 使用内容的前50个字符 + 文件名 + 时间戳创建唯一标识符
		const contentHash = content
			.substring(0, 50)
			.replace(/\s+/g, "-")
			.replace(/[^\w-]/g, "");
		const timestamp = Date.now().toString(36);
		return `weave-${fileName}-${contentHash}-${timestamp}`;
	}

	/**
	 * 查找现有的块链接
	 */
	private async findExistingBlockLink(content: string, file: TFile): Promise<BlockLinkInfo | null> {
		try {
			const fileContent = await this.app.vault.read(file);
			const lines = fileContent.split("\n");

			// 查找包含相同内容的行，并检查是否已有块ID
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (line.includes(content.substring(0, 30))) {
					// 检查这一行或下一行是否有块ID
					const blockIdMatch = line.match(/\^([a-zA-Z0-9-]+)$/);
					if (blockIdMatch) {
						const blockId = blockIdMatch[1];
						const blockLink = `[[${file.basename}#^${blockId}]]`;

						return {
							blockId,
							blockLink,
							sourceFile: file.path,
							sourceDocument: file.basename,
							lineNumber: i + 1,
							uniqueIdentifier: `existing-${blockId}`,
							content: line.replace(/\s*\^[a-zA-Z0-9-]+$/, "").trim(),
						};
					}
				}
			}

			return null;
		} catch (error) {
			logger.error("❌ [BlockLinkManager] 查找现有块链接失败:", error);
			return null;
		}
	}

	/**
	 * 在文档中创建块链接（更智能的方法）
	 */
	private async createBlockLinkInDocument(
		file: TFile,
		selectedText: string,
		blockId: string,
		uniqueIdentifier: string
	): Promise<BlockLinkInfo | null> {
		try {
			logger.debug("🔗 [BlockLinkManager] 开始在文档中创建块链接:", {
				fileName: file.basename,
				filePath: file.path,
				blockId,
				selectedTextLength: selectedText.length,
				selectedTextPreview: `${selectedText.substring(0, 100)}...`,
			});

			// 读取文件内容
			const fileContent = await this.app.vault.read(file);
			const lines = fileContent.split("\n");
			let resolvedBlockId = blockId;

			logger.debug("🔗 [BlockLinkManager] 文件内容读取成功:", {
				totalLines: lines.length,
				fileSize: fileContent.length,
			});

			// 查找包含选中内容的行
			let targetLineIndex = -1;
			let bestMatch = 0;
			const searchText = selectedText.trim();

			//  改进：检测多行文本，使用更智能的匹配策略
			const isMultiline = searchText.includes("\n");
			let searchPreview: string;

			if (isMultiline) {
				// 多行文本：使用第一行（更长的预览）
				const firstLine = searchText.split("\n")[0].trim();
				searchPreview = firstLine.substring(0, Math.min(50, firstLine.length));
				logger.debug("🔗 [BlockLinkManager] 检测到多行文本，使用第一行作为搜索依据");
			} else {
				// 单行文本：使用前50个字符（增加匹配成功率）
				searchPreview = searchText.substring(0, Math.min(50, searchText.length));
			}

			logger.debug("🔗 [BlockLinkManager] 开始搜索匹配行:", {
				isMultiline,
				searchPreview,
				searchTextLength: searchText.length,
			});

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];

				//  改进：使用更宽松的匹配条件
				// 1. 完全包含预览文本
				// 2. 或者预览文本包含在行中（处理格式化差异）
				const normalizedLine = line.trim();
				const normalizedPreview = searchPreview.trim();

				if (
					normalizedLine.includes(normalizedPreview) ||
					(normalizedPreview.length > 10 &&
						normalizedLine.includes(normalizedPreview.substring(0, 20)))
				) {
					const matchLength = this.calculateMatchLength(line, searchText);
					logger.debug(`🔗 [BlockLinkManager] 找到潜在匹配行 ${i + 1}:`, {
						lineContent: `${line.substring(0, 50)}...`,
						matchLength,
						currentBestMatch: bestMatch,
					});

					if (matchLength > bestMatch) {
						bestMatch = matchLength;
						targetLineIndex = i;
						logger.debug(`🔗 [BlockLinkManager] 更新最佳匹配行: ${i + 1}, 匹配度: ${matchLength}`);
					}
				}
			}

			if (targetLineIndex === -1) {
				//  修改策略：如果找不到匹配的行，不在文件中添加内容
				// 只返回基础的块链接信息，避免污染源文档
				logger.debug("🔗 [BlockLinkManager] 未找到匹配行，不修改源文档，返回文档链接");

				const blockLink = `[[${file.basename}]]`; // 只提供文档链接

				return {
					blockId: resolvedBlockId,
					blockLink,
					sourceFile: file.path,
					sourceDocument: file.basename,
					lineNumber: undefined, // 没有具体行号
					uniqueIdentifier,
					content: selectedText,
				};
			} else {
				// 在找到的行添加块ID
				const targetLine = lines[targetLineIndex];
				logger.debug("🔗 [BlockLinkManager] 找到目标行:", {
					lineIndex: targetLineIndex,
					lineNumber: targetLineIndex + 1,
					lineContent: targetLine,
					hasExistingBlockId: targetLine.includes("^"),
				});

				// 检查是否已经有块ID
				if (!targetLine.includes("^")) {
					const newLine = `${targetLine} ^${resolvedBlockId}`;
					lines[targetLineIndex] = newLine;
					const updatedContent = lines.join("\n");

					logger.debug("🔗 [BlockLinkManager] 准备修改现有行:", {
						originalLine: targetLine,
						newLine: newLine,
						fileName: file.basename,
					});

					await this.app.vault.modify(file, updatedContent);
					logger.debug("✅ [BlockLinkManager] 现有行修改成功，块ID已添加");
				} else {
					// 如果已经有块ID，提取现有的块ID
					const existingBlockIdMatch = targetLine.match(/\^([a-zA-Z0-9-]+)$/);
					if (existingBlockIdMatch) {
						resolvedBlockId = existingBlockIdMatch[1];
						logger.debug("🔗 [BlockLinkManager] 使用现有块ID:", resolvedBlockId);
					} else {
						logger.warn("⚠️ [BlockLinkManager] 检测到^符号但无法提取块ID，行内容:", targetLine);
					}
				}
			}

			// 生成块链接
			const blockLink = `[[${file.basename}#^${resolvedBlockId}]]`;

			const result = {
				blockId: resolvedBlockId,
				blockLink,
				sourceFile: file.path,
				sourceDocument: file.basename,
				lineNumber: targetLineIndex + 1,
				uniqueIdentifier,
				content: selectedText,
			};

			logger.debug("✅ [BlockLinkManager] 块链接信息生成完成:", {
				blockLink,
				sourceDocument: file.basename,
				lineNumber: targetLineIndex + 1,
				uniqueIdentifier,
			});

			return result;
		} catch (error) {
			logger.error("❌ [BlockLinkManager] 创建块链接失败:", {
				fileName: file.basename,
				filePath: file.path,
				error: error instanceof Error ? error.message : String(error),
				errorStack: error instanceof Error ? error.stack : undefined,
				blockId,
				selectedTextLength: selectedText.length,
			});
			return null;
		}
	}

	/**
	 * 计算两个文本的匹配长度
	 */
	private calculateMatchLength(line: string, searchText: string): number {
		const lineWords = line.toLowerCase().split(/\s+/);
		const searchWords = searchText.toLowerCase().split(/\s+/);

		let matchCount = 0;
		for (const searchWord of searchWords) {
			if (
				lineWords.some((lineWord) => lineWord.includes(searchWord) || searchWord.includes(lineWord))
			) {
				matchCount++;
			}
		}

		return matchCount;
	}

	/**
	 * 为卡片内容生成来源信息
	 */
	generateSourceInfo(blockLinkInfo: BlockLinkInfo): string {
		const sourceInfo = [
			`**来源文档**: ${blockLinkInfo.blockLink}`,
			`**唯一标识**: \`${blockLinkInfo.uniqueIdentifier}\``,
			`**创建时间**: ${new Date().toLocaleString()}`,
		].join("\n");

		return `\n\n---\n\n### 📎 来源信息\n\n${sourceInfo}`;
	}

	/**
	 * 检查唯一标识符是否已存在（避免重复创建）
	 */
	checkUniqueIdentifierExists(_uniqueIdentifier: string): boolean {
		try {
			return false;
		} catch (error) {
			logger.error("[BlockLinkManager] 检查唯一标识符失败:", error);
			return false;
		}
	}

	/**
	 * 批量为多个sourceText创建块链接（一次性修改文件，避免多次读写）
	 * @param sourceTexts 需要创建块链接的文本数组
	 * @param sourceFilePath 源文件路径
	 * @returns 每个sourceText对应的块链接结果
	 */
	async createBlockLinksForBatch(
		sourceTexts: string[],
		sourceFilePath: string
	): Promise<Map<string, BlockLinkCreationResult>> {
		const results = new Map<string, BlockLinkCreationResult>();

		if (sourceTexts.length === 0) {
			return results;
		}

		try {
			logger.debug("🔗 [BlockLinkManager] 开始批量创建块链接:", {
				count: sourceTexts.length,
				filePath: sourceFilePath,
			});

			// 获取目标文件
			const files = this.app.vault.getMarkdownFiles();
			const targetFile = files.find(
				(f) => f.path === sourceFilePath || f.basename === sourceFilePath
			);

			if (!targetFile) {
				logger.warn("⚠️ [BlockLinkManager] 批量创建：未找到源文件:", sourceFilePath);
				// 为所有sourceText返回失败结果
				for (const text of sourceTexts) {
					results.set(text, {
						success: false,
						error: "未找到源文件",
					});
				}
				return results;
			}

			// 一次性读取文件内容
			const fileContent = await this.app.vault.read(targetFile);
			const lines = fileContent.split("\n");
			let modified = false;

			// 记录已匹配的行索引，避免重复匹配同一行
			const matchedLineIndices = new Set<number>();

			// 为每个sourceText查找匹配行并生成块ID
			for (const sourceText of sourceTexts) {
				const searchText = sourceText.trim();
				if (!searchText) {
					results.set(sourceText, {
						success: false,
						error: "空文本",
					});
					continue;
				}

				// 生成唯一标识符和块ID
				const uniqueIdentifier = this.generateUniqueIdentifier(searchText, targetFile.basename);
				const blockId = generateBlockId();

				// 查找最佳匹配行（排除已匹配的行）
				let targetLineIndex = -1;
				let bestMatch = 0;

				// 使用前50个字符作为搜索预览
				const searchPreview = searchText.substring(0, Math.min(50, searchText.length));

				for (let i = 0; i < lines.length; i++) {
					// 跳过已匹配的行
					if (matchedLineIndices.has(i)) {
						continue;
					}

					const line = lines[i];
					const normalizedLine = line.trim();
					const normalizedPreview = searchPreview.trim();

					// 匹配条件：行包含预览文本
					if (
						normalizedLine.includes(normalizedPreview) ||
						(normalizedPreview.length > 10 &&
							normalizedLine.includes(normalizedPreview.substring(0, 20)))
					) {
						const matchLength = this.calculateMatchLength(line, searchText);

						if (matchLength > bestMatch) {
							bestMatch = matchLength;
							targetLineIndex = i;
						}
					}
				}

				if (targetLineIndex === -1) {
					// 未找到匹配行
					logger.debug("🔗 [BlockLinkManager] 批量创建：未找到匹配行:", {
						sourceText: `${searchText.substring(0, 50)}...`,
					});
					results.set(sourceText, {
						success: false,
						blockLinkInfo: {
							blockId,
							blockLink: `[[${targetFile.basename}]]`,
							sourceFile: targetFile.path,
							sourceDocument: targetFile.basename,
							uniqueIdentifier,
							content: searchText,
						},
						error: "未找到匹配行",
					});
					continue;
				}

				// 标记该行已被匹配
				matchedLineIndices.add(targetLineIndex);

				const targetLine = lines[targetLineIndex];
				let finalBlockId = blockId;

				// 检查是否已有块ID
				if (!targetLine.includes("^")) {
					// 添加新的块ID
					lines[targetLineIndex] = `${targetLine} ^${blockId}`;
					modified = true;
					logger.debug("🔗 [BlockLinkManager] 批量创建：添加块ID到行", targetLineIndex + 1);
				} else {
					// 提取现有块ID
					const existingBlockIdMatch = targetLine.match(/\^([a-zA-Z0-9-]+)$/);
					if (existingBlockIdMatch) {
						finalBlockId = existingBlockIdMatch[1];
						logger.debug("🔗 [BlockLinkManager] 批量创建：使用现有块ID:", finalBlockId);
					}
				}

				// 生成块链接
				const blockLink = `[[${targetFile.basename}#^${finalBlockId}]]`;

				results.set(sourceText, {
					success: true,
					blockLinkInfo: {
						blockId: finalBlockId,
						blockLink,
						sourceFile: targetFile.path,
						sourceDocument: targetFile.basename,
						lineNumber: targetLineIndex + 1,
						uniqueIdentifier,
						content: searchText,
					},
				});

				logger.debug("✅ [BlockLinkManager] 批量创建：成功", {
					sourceText: `${searchText.substring(0, 30)}...`,
					blockId: finalBlockId,
					lineNumber: targetLineIndex + 1,
				});
			}

			// 一次性保存文件修改
			if (modified) {
				const updatedContent = lines.join("\n");
				await this.app.vault.modify(targetFile, updatedContent);
				logger.debug(
					"✅ [BlockLinkManager] 批量创建：文件已保存，共修改",
					matchedLineIndices.size,
					"处"
				);
			}

			return results;
		} catch (error) {
			logger.error("❌ [BlockLinkManager] 批量创建块链接失败:", error);
			// 为所有未处理的sourceText返回失败结果
			for (const text of sourceTexts) {
				if (!results.has(text)) {
					results.set(text, {
						success: false,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
			return results;
		}
	}

	/**
	 * 为增量阅读设计的块链接创建方法
	 *
	 * 利用 IRBlock 的精确定位信息（filePath, startLine, endLine）来创建块链接，
	 * 而不是依赖 getActiveFile()，解决嵌入式编辑器无法获取正确源文档的问题。
	 *
	 * @param selectedText 选中的文本
	 * @param filePath 源文件路径（来自 IRBlock.filePath）
	 * @param startLine 内容块起始行（来自 IRBlock.startLine）
	 * @param endLine 内容块结束行（来自 IRBlock.endLine，可选）
	 * @returns 块链接创建结果
	 */
	async createBlockLinkForIRSelection(
		selectedText: string,
		filePath: string,
		startLine: number,
		endLine?: number
	): Promise<BlockLinkCreationResult> {
		try {
			logger.debug("🔗 [BlockLinkManager] IR专用：开始创建块链接", {
				filePath,
				startLine,
				endLine,
				selectedTextLength: selectedText.length,
				selectedTextPreview: selectedText.substring(0, 100),
			});

			// 1. 直接通过路径获取源文件（不依赖 getActiveFile）
			const targetFile = this.app.vault.getAbstractFileByPath(filePath);

			if (!(targetFile instanceof TFile)) {
				logger.warn("⚠️ [BlockLinkManager] IR专用：未找到源文件:", filePath);
				const uniqueIdentifier = this.generateUniqueIdentifier(selectedText, "unknown");
				return {
					success: false,
					blockLinkInfo: {
						blockId: generateBlockId(),
						blockLink: "",
						sourceFile: filePath,
						sourceDocument: filePath.split("/").pop() || "unknown",
						uniqueIdentifier,
						content: selectedText,
					},
					error: `未找到源文件: ${filePath}`,
				};
			}

			// 2. 生成唯一标识符和块ID
			const uniqueIdentifier = this.generateUniqueIdentifier(selectedText, targetFile.basename);
			const blockId = generateBlockId();

			logger.debug("🔗 [BlockLinkManager] IR专用：生成标识符", {
				uniqueIdentifier,
				blockId,
				file: targetFile.basename,
			});

			// 3. 读取文件内容
			const fileContent = await this.app.vault.read(targetFile);
			const lines = fileContent.split("\n");

			logger.debug("🔗 [BlockLinkManager] IR专用：读取源文件", {
				totalLines: lines.length,
				fileSize: fileContent.length,
			});

			// 4. 准备搜索文本（清理和规范化）
			const searchText = selectedText.trim();

			// 策略 1：使用选中文本的第一行作为主要匹配目标
			const firstContentLine =
				searchText
					.split("\n")
					.find((l) => l.trim().length > 5)
					?.trim() || "";

			logger.debug("🔗 [BlockLinkManager] IR专用：搜索目标", {
				firstContentLine: firstContentLine.substring(0, 50),
				searchTextLength: searchText.length,
			});

			// 5. 在全文中搜索匹配行
			let targetLineIndex = -1;
			let bestMatch = 0;

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const normalizedLine = line.trim();

				// 跳过空行和 UUID 标记行
				if (
					!normalizedLine ||
					normalizedLine.includes("weave-ir:") ||
					normalizedLine.includes("weave-ir-start") ||
					normalizedLine.startsWith("<!--")
				) {
					continue;
				}

				// 匹配策略：
				// 1. 检查源行是否包含选中文本的第一行内容（去除 Markdown 格式后）
				// 2. 或者选中文本是否包含源行内容
				const cleanLine = normalizedLine.replace(/[#*_`[\]()]/g, "").trim();
				const cleanFirstLine = firstContentLine.replace(/[#*_`[\]()]/g, "").trim();

				let matchScore = 0;

				// 检查包含关系
				if (cleanLine.includes(cleanFirstLine) && cleanFirstLine.length >= 5) {
					matchScore = cleanFirstLine.length * 3;
				} else if (cleanFirstLine.includes(cleanLine) && cleanLine.length >= 5) {
					matchScore = cleanLine.length * 2;
				}

				// 部分匹配：检查前20个字符
				if (matchScore === 0 && cleanLine.length >= 10 && cleanFirstLine.length >= 10) {
					const prefix = cleanFirstLine.substring(0, 20);
					if (cleanLine.includes(prefix)) {
						matchScore = prefix.length;
					}
				}

				if (matchScore > bestMatch) {
					bestMatch = matchScore;
					targetLineIndex = i;
					logger.debug("🔗 [BlockLinkManager] IR专用：找到候选行", {
						lineNumber: i + 1,
						matchScore,
						linePreview: normalizedLine.substring(0, 50),
					});
				}
			}

			// 7. 处理搜索结果
			if (targetLineIndex === -1) {
				logger.debug("🔗 [BlockLinkManager] IR专用：未找到匹配行，返回文档级链接");
				const blockLink = `[[${targetFile.basename}]]`;

				return {
					success: false,
					blockLinkInfo: {
						blockId,
						blockLink,
						sourceFile: targetFile.path,
						sourceDocument: targetFile.basename,
						lineNumber: undefined,
						uniqueIdentifier,
						content: selectedText,
					},
					error: "未找到匹配行，已提供文档级链接",
				};
			}

			// 8. 在找到的行添加块ID
			const targetLine = lines[targetLineIndex];
			let finalBlockId = blockId;

			logger.debug("🔗 [BlockLinkManager] IR专用：找到目标行", {
				lineIndex: targetLineIndex,
				lineNumber: targetLineIndex + 1,
				lineContent: targetLine.substring(0, 80),
				hasExistingBlockId: targetLine.includes("^"),
			});

			if (!targetLine.includes("^")) {
				// 添加新的块ID
				lines[targetLineIndex] = `${targetLine} ^${blockId}`;
				const updatedContent = lines.join("\n");
				await this.app.vault.modify(targetFile, updatedContent);
				logger.debug("✅ [BlockLinkManager] IR专用：块ID已添加到源文档");
			} else {
				// 提取现有块ID
				const existingBlockIdMatch = targetLine.match(/\^([a-zA-Z0-9-]+)$/);
				if (existingBlockIdMatch) {
					finalBlockId = existingBlockIdMatch[1];
					logger.debug("🔗 [BlockLinkManager] IR专用：使用现有块ID:", finalBlockId);
				}
			}

			// 9. 生成块链接
			const blockLink = `[[${targetFile.basename}#^${finalBlockId}]]`;

			const result: BlockLinkCreationResult = {
				success: true,
				blockLinkInfo: {
					blockId: finalBlockId,
					blockLink,
					sourceFile: targetFile.path,
					sourceDocument: targetFile.basename,
					lineNumber: targetLineIndex + 1,
					uniqueIdentifier,
					content: selectedText,
				},
			};

			logger.debug("✅ [BlockLinkManager] IR专用：块链接创建成功", {
				blockLink,
				lineNumber: targetLineIndex + 1,
			});

			return result;
		} catch (error) {
			logger.error("❌ [BlockLinkManager] IR专用：创建块链接失败:", error);
			const uniqueIdentifier = this.generateUniqueIdentifier(selectedText, "error");
			return {
				success: false,
				blockLinkInfo: {
					blockId: generateBlockId(),
					blockLink: "",
					sourceFile: filePath,
					sourceDocument: filePath.split("/").pop() || "unknown",
					uniqueIdentifier,
					content: selectedText,
				},
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

/**
 * 获取块链接管理器实例
 */
export function getBlockLinkManager(app: App): BlockLinkManager {
	return new BlockLinkManager(app);
}
