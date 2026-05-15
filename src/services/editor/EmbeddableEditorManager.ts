/**
 * EmbeddableEditorManager - 嵌入式编辑器管理器
 *
 * 使用 DetachedLeafEditor 实现零闪烁、高性能的编辑体验 (基于 Obsidian WorkspaceLeaf)
 * 支持卡片创建/编辑模态窗和学习界面的编辑功能
 */

import type { App } from "obsidian";
import type { Card } from "../../data/types";
import { logger } from "../../utils/logger";
import { extractSourcePath } from "../../utils/source-path-matcher";
import { DetachedLeafEditor } from "./DetachedLeafEditor";

/**
 * 编辑会话信息
 */
interface EditorSession {
	editor: DetachedLeafEditor | null;
	card: Card;
	container: HTMLElement | null;
	sourcePath?: string; // 显式指定的源路径（用于解析相对资源）
}

/**
 * 嵌入式编辑器管理器
 */
export class EmbeddableEditorManager {
	private app: App;
	private sessions: Map<string, EditorSession> = new Map();

	// 学习会话专用ID（固定标识符，用于学习界面的编辑器复用）
	private readonly STUDY_SESSION_CARD_ID = "weave-study-session-editor";
	private currentEditingCardUuid = "";

	constructor(app: App) {
		this.app = app;
		logger.debug("[EmbeddableEditorManager] 初始化");
	}

	/**
	 * 获取学习会话编辑器的 cardId
	 */
	get studySessionCardId(): string {
		return this.STUDY_SESSION_CARD_ID;
	}

	/**
	 * 设置当前编辑的卡片ID
	 */
	setCurrentEditingCard(cardId: string): void {
		logger.debug("[EmbeddableEditorManager] 设置当前编辑卡片:", cardId);
		this.currentEditingCardUuid = cardId;
	}

	/**
	 * 创建编辑会话
	 * 为卡片编辑创建一个新的会话，支持普通模式和学习会话模式
	 */
	async createEditorSession(
		card: Card,
		options?: {
			isStudySession?: boolean;
			sessionId?: string;
			sourcePath?: string; // 允许传入源文件路径
		}
	): Promise<{
		success: boolean;
		sessionId?: string;
		filePath?: string; // 兼容字段（实际不使用）
		error?: string;
	}> {
		try {
			const requestedSessionId = options?.sessionId?.trim();
			const sessionId =
				requestedSessionId && requestedSessionId.length > 0
					? requestedSessionId
					: options?.isStudySession
					? this.STUDY_SESSION_CARD_ID
					: card.uuid && card.uuid.trim().length > 0
					? card.uuid
					: `virtual-${Date.now()}-${Math.random().toString(36).slice(2)}`;

			logger.debug("[EmbeddableEditorManager] 创建编辑会话:", {
				sessionId,
				sourcePath: options?.sourcePath,
				cardSourceFile: card.sourceFile,
			});

			const existing = this.sessions.get(sessionId);
			if (existing) {
				existing.card = { ...card };
				existing.sourcePath = options?.sourcePath;
				return {
					success: true,
					sessionId,
					filePath: `virtual://card/${sessionId}`,
				};
			}

			// 保存会话信息（编辑器稍后创建）
			this.sessions.set(sessionId, {
				editor: null,
				card: { ...card },
				container: null,
				sourcePath: options?.sourcePath, // 保存传入的 sourcePath
			});

			return {
				success: true,
				sessionId,
				filePath: `virtual://card/${sessionId}`, // 虚拟路径（兼容）
			};
		} catch (error) {
			logger.error("[EmbeddableEditorManager] 创建编辑会话失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "创建会话失败",
			};
		}
	}

	/**
	 * 创建嵌入式编辑器
	 * 在指定容器中创建零闪烁的Markdown编辑器
	 * @param onChange 可选的实时变化回调（用于增量阅读实时写入）
	 */
	async createEmbeddedEditor(
		container: HTMLElement,
		sessionId: string,
		onSave: (content: string) => void,
		onCancel: () => void,
		onChange?: (content: string) => void
	): Promise<{
		success: boolean;
		cleanup?: () => void;
		error?: string;
	}> {
		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				throw new Error(`会话不存在: ${sessionId}`);
			}

			logger.debug("[EmbeddableEditorManager] 创建嵌入式编辑器 (DetachedLeaf):", sessionId);

			// 保存容器引用
			session.container = container;

			const resolvedCardSourcePath = extractSourcePath(session.card);
			const resolvedSourcePath = resolvedCardSourcePath || session.sourcePath;

			// 创建 DetachedLeafEditor (完全原生体验)
			const editor = new DetachedLeafEditor(this.app, container, {
				value: session.card.content || "",
				placeholder: "在此编辑卡片内容...",
				// 传递源文件路径，用于解决资源解析问题
				sourcePath: resolvedSourcePath || undefined,
				sessionId: sessionId,

				// Ctrl+Enter 保存
				onSubmit: (ed) => {
					logger.debug("[EmbeddableEditorManager] 编辑器保存回调");
					onSave(ed.value);
				},

				// Escape 取消
				onEscape: () => {
					logger.debug("[EmbeddableEditorManager] 编辑器取消回调");
					onCancel();
				},

				// 内容变化（实时更新）
				onChange: (ed) => {
					session.card.content = ed.value;
					// 调用外部 onChange 回调（用于增量阅读实时写入）
					if (onChange) {
						onChange(ed.value);
					}
				},
			});

			// 手动加载组件 (DetachedLeafEditor extends Component)
			editor.load();

			// 保存编辑器实例
			session.editor = editor;

			logger.debug("[EmbeddableEditorManager] ✅ 编辑器创建成功");

			return {
				success: true,
				cleanup: () => {
					logger.debug("[EmbeddableEditorManager] 清理编辑器:", sessionId);
					if (session.editor) {
						session.editor.destroy();
						session.editor = null;
					}
					this.sessions.delete(sessionId);
				},
			};
		} catch (error) {
			logger.error("[EmbeddableEditorManager] 创建编辑器失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "创建编辑器失败",
			};
		}
	}

	/**
	 * 完成编辑
	 * 获取编辑器的最新内容并返回更新后的卡片
	 */
	async finishEditing(
		sessionId: string,
		shouldSync = false,
		options?: {
			isStudySession?: boolean;
			targetCardId?: string;
		}
	): Promise<{
		success: boolean;
		updatedCard?: Card;
		error?: string;
	}> {
		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				throw new Error(`会话不存在: ${sessionId}`);
			}

			logger.debug("[EmbeddableEditorManager] 完成编辑:", {
				sessionId,
				shouldSync,
				options,
				hasEditor: !!session.editor,
				sessionCardUuid: session.card.uuid,
			});

			// 获取最新内容
			let content = "";

			if (session.editor) {
				// 优先从编辑器读取
				const editorValue = session.editor.value;
				logger.debug("[EmbeddableEditorManager] 从编辑器读取内容:", {
					editorValueLength: editorValue?.length || 0,
					editorValuePreview: editorValue?.substring(0, 100),
				});
				content = editorValue || "";
			}

			// 如果编辑器内容为空，尝试从session.card获取（向后兼容）
			if (!content || content.trim().length === 0) {
				logger.warn("[EmbeddableEditorManager] ⚠️ 编辑器内容为空，尝试使用session.card.content");
				content = session.card.content || "";
			}

			// 更新卡片
			const updatedCard: Card = {
				...session.card,
				content,
				modified: new Date().toISOString(),
			};

			logger.debug("[EmbeddableEditorManager] ✅ 编辑完成", {
				finalContentLength: content.length,
				updatedCardUuid: updatedCard.uuid,
			});

			return {
				success: true,
				updatedCard,
			};
		} catch (error) {
			logger.error("[EmbeddableEditorManager] 完成编辑失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "完成编辑失败",
			};
		}
	}

	/**
	 * 取消编辑
	 * 清理会话和编辑器
	 */
	async cancelEditing(sessionId: string): Promise<void> {
		logger.debug("[EmbeddableEditorManager] 取消编辑:", sessionId);

		const session = this.sessions.get(sessionId);
		if (session) {
			if (session.editor) {
				session.editor.destroy();
			}
			this.sessions.delete(sessionId);
		}
	}

	/**
	 * 更新会话内容
	 * 用于学习界面卡片切换时更新编辑器内容，支持编辑器复用
	 */
	async updateSessionContent(
		sessionId: string,
		content: string | undefined,
		_container?: HTMLElement
	): Promise<{ success: boolean; error?: string }> {
		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				throw new Error(`会话不存在: ${sessionId}`);
			}

			logger.debug("[EmbeddableEditorManager] 更新会话内容:", sessionId);

			const nextContent = content || "";

			// 更新卡片内容
			session.card.content = nextContent;

			// 如果编辑器已存在，更新编辑器的值
			if (session.editor) {
				const currentValue = session.editor.value;
				if (currentValue !== nextContent) {
					session.editor.setValue(nextContent); // ✅ 使用setValue()方法
					logger.debug("[EmbeddableEditorManager] ✅ 编辑器内容已更新");
				}
			}

			return { success: true };
		} catch (error) {
			logger.error("[EmbeddableEditorManager] 更新会话内容失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "更新内容失败",
			};
		}
	}

	/**
	 * 更新会话的card对象
	 * 用于钉住模式切换到新卡片时更新整个card对象
	 */
	async updateSessionCard(
		sessionId: string,
		newCard: Card
	): Promise<{ success: boolean; error?: string }> {
		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				throw new Error(`会话不存在: ${sessionId}`);
			}

			logger.debug("[EmbeddableEditorManager] 更新会话卡片对象:", {
				sessionId,
				newCardUuid: newCard.uuid,
				newCardContent: newCard.content?.substring(0, 50) || "(空)",
			});

			// 更新整个card对象
			session.card = { ...newCard };

			// 同时更新编辑器内容为新卡片的内容
			if (session.editor) {
				const contentToSet = newCard.content || "";
				if (session.editor.value !== contentToSet) {
					session.editor.setValue(contentToSet);
				}

				// 等待编辑器 DOM 更新（编辑器更新可能是异步的）
				await new Promise((resolve) => setTimeout(resolve, 50));

				// 验证设置是否成功
				const verifyValue = session.editor.value;
				logger.debug("[EmbeddableEditorManager] 编辑器内容设置验证:", {
					expectedLength: contentToSet.length,
					actualLength: verifyValue?.length || 0,
					success: verifyValue === contentToSet,
				});

				if (verifyValue !== contentToSet) {
					logger.warn("[EmbeddableEditorManager] ⚠️ 编辑器内容设置可能失败，期望与实际不符");
				} else {
					logger.debug("[EmbeddableEditorManager] ✅ 会话卡片对象和编辑器内容已更新");
				}
			} else {
				logger.warn("[EmbeddableEditorManager] ⚠️ 会话中没有编辑器实例");
			}

			return { success: true };
		} catch (error) {
			logger.error("[EmbeddableEditorManager] 更新会话卡片对象失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "更新卡片对象失败",
			};
		}
	}

	/**
	 * 清理所有会话
	 */
	cleanup(): void {
		logger.debug("[EmbeddableEditorManager] 清理所有会话");

		for (const [_sessionId, session] of this.sessions.entries()) {
			if (session.editor) {
				session.editor.destroy();
			}
		}

		this.sessions.clear();
	}
}

/**
 * 导出类型（兼容旧接口）
 */
export interface CardSyncResult {
	success: boolean;
	updatedCard?: Card;
	error?: string;
}
