import { logger } from "../utils/logger";
/**
 * QuestionBankView - 考试学习界面视图（标签页模式）
 * 保持原有的模态窗风格设计，但以独立标签页形式打开
 * 参考 StudyView.ts 的架构实现
 */

import { ItemView, Menu, Notice, Platform, WorkspaceLeaf } from "obsidian";
import type { unmount } from "svelte";
import type { Card } from "../data/types";
import type { WeavePlugin } from "../main";
import { i18n } from "../utils/i18n";
import type {
	QuestionBankModeConfig,
	QuestionBankResumeBehavior,
	TestMode,
} from "../types/question-bank-types";
import { addMenuSubmenuGroup, addMenuToggle } from "../utils/obsidian-menu";
import {
	addLocationToggleAction,
	getLocationToggleIcon,
	getLocationToggleTooltip,
	toggleViewLocation,
} from "../utils/view-location-utils";

export const VIEW_TYPE_QUESTION_BANK = "weave-question-bank-view";

type QuestionBankViewState = {
	bankId?: string;
	bankName?: string;
	mode?: TestMode;
	config?: QuestionBankModeConfig;
	resumeBehavior?: QuestionBankResumeBehavior;
};

type ItemViewSetStateResult = Parameters<ItemView["setState"]>[1];
type MountedQuestionBankComponent = Parameters<typeof unmount>[0];
type WorkspaceLeafWithUpdateHeader = WorkspaceLeaf & { updateHeader?: () => void };

export class QuestionBankView extends ItemView {
	private component: MountedQuestionBankComponent | null = null;
	private plugin: WeavePlugin;
	private instanceId: string;
	private isClosing = false; // 🔧 防止 close() 递归调用

	// 学习参数
	private bankId: string | undefined;
	private bankName: string | undefined;
	private questions: Card[] | undefined;
	private mode: TestMode | undefined;
	private config: QuestionBankModeConfig | undefined;
	private resumeBehavior: QuestionBankResumeBehavior = "prompt";

	// 📱 移动端菜单回调（由 Svelte 组件设置）
	private populatePaneMenuCallback: ((menu: Menu) => void) | null = null;
	private mobilePanelStateGetter: (() => {
		showStatsBar: boolean;
		showNavigator: boolean;
	}) | null = null;
	private toggleStatsBarCallback: (() => void) | null = null;
	private toggleNavigatorCallback: (() => void) | null = null; // 📱 题目导航栏折叠回调

	// 📱 编辑模式状态管理
	private isEditMode = false;
	private saveCallback: (() => Promise<void>) | null = null;

	// 📱 存储移动端按钮元素引用（用于动态切换）
	private mobileActionElements: HTMLElement[] = [];

	// 📱 位置切换按钮引用
	private locationToggleAction: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: WeavePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.instanceId = `question-bank-view-${Date.now()}`;
		logger.debug("[QuestionBankView] 视图实例已创建:", this.instanceId);
	}

	onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu?.(menu, source);

		if (!Platform.isMobile) return;

		if (this.isEditMode) {
			menu.addItem((item) => {
				item
					.setTitle(i18n.t("views.questionBank.saveAndReturn"))
					.setIcon("check")
					.onClick(() => {
						void this.handleSaveFromHeader();
					});
			});
			menu.addSeparator();
		} else {
			menu.addSeparator();
			this.populateMobileDisplayPanelsSubmenu(menu);

			if (this.populatePaneMenuCallback) {
				menu.addSeparator();
				this.populatePaneMenuCallback(menu);
			}
		}

		menu.addSeparator();
		menu.addItem((item) => {
			item
				.setTitle(getLocationToggleTooltip(this.leaf))
				.setIcon(getLocationToggleIcon(this.leaf))
				.onClick(async () => {
					await toggleViewLocation(this, "right");
				});
		});
	}

	// ==================== 📱 移动端回调设置方法 ====================

	/**
	 * 📱 设置移动端官方更多菜单填充回调（由 Svelte 组件调用）
	 */
	public setPopulatePaneMenuCallback(callback: ((menu: Menu) => void) | null): void {
		this.populatePaneMenuCallback = callback;
		logger.debug("[QuestionBankView] 移动端官方更多菜单回调已设置");
	}

	public setMobilePanelStateGetter(
		getter: (() => { showStatsBar: boolean; showNavigator: boolean }) | null
	): void {
		this.mobilePanelStateGetter = getter;
	}

	private populateMobileDisplayPanelsSubmenu(menu: Menu): void {
		const readPanelState = () =>
			this.mobilePanelStateGetter?.() ?? {
				showStatsBar: false,
				showNavigator: true,
			};

		addMenuSubmenuGroup(
			menu,
			{ title: i18n.t("views.questionBank.displayPanels"), icon: "panel-top" },
			(submenu) => {
				addMenuToggle(submenu, {
					title: i18n.t("views.questionBank.stats"),
					icon: "activity",
					getChecked: () => readPanelState().showStatsBar,
					onSetChecked: () => {
						this.toggleStatsBarCallback?.();
					},
				});

				addMenuToggle(submenu, {
					title: i18n.t("views.questionBank.navigator"),
					icon: "list",
					getChecked: () => readPanelState().showNavigator,
					onSetChecked: () => {
						this.toggleNavigatorCallback?.();
					},
				});
			}
		);
	}

	/**
	 * 📱 设置展开/折叠答题情况信息栏回调（由 Svelte 组件调用）
	 * 参考 StudyView 的实现：只设置回调，不触发按钮重新添加
	 * 因为按钮的点击处理函数已使用延迟绑定（this.toggleStatsBarCallback）
	 */
	public setToggleStatsBarCallback(callback: () => void): void {
		this.toggleStatsBarCallback = callback;
		logger.debug("[QuestionBankView] 展开/折叠答题情况栏回调已设置");
	}

	/**
	 * 📱 设置展开/折叠题目导航栏回调（由 Svelte 组件调用）
	 */
	public setToggleNavigatorCallback(callback: () => void): void {
		this.toggleNavigatorCallback = callback;
		logger.debug("[QuestionBankView] 展开/折叠题目导航栏回调已设置");
	}

	/**
	 * 📱 设置保存回调（由 Svelte 组件调用）
	 */
	public setSaveCallback(callback: () => Promise<void>): void {
		this.saveCallback = callback;
		logger.debug("[QuestionBankView] 保存回调已设置");
	}

	/**
	 * 📱 更新编辑模式状态（由 Svelte 组件调用）
	 */
	public updateEditMode(isEdit: boolean): void {
		this.isEditMode = isEdit;
		logger.debug("[QuestionBankView] 编辑模式状态已更新:", isEdit);

		if (Platform.isMobile) {
			this.updateMobileActions();
			this.refreshMobileHeader();
		}
	}

	private refreshMobileHeader(): void {
		try {
			const leaf = this.leaf as WorkspaceLeafWithUpdateHeader;
			if (typeof leaf.updateHeader === "function") {
				leaf.updateHeader();
			}
			this.app.workspace.trigger("layout-change");
		} catch (error) {
			logger.warn("[QuestionBankView] 刷新顶栏失败:", error);
		}
	}

	// ==================== 📱 移动端顶部栏按钮管理 ====================

	/**
	 * 📱 更新移动端顶部栏按钮（根据编辑模式切换）
	 */
	private updateMobileActions(): void {
		if (!Platform.isMobile) return;

		this.clearMobileActions();

		if (this.isEditMode) {
			this.addEditModeActions();
		} else {
			this.addStudyModeActions();
		}

		logger.debug("[QuestionBankView] 📱 移动端按钮已更新，编辑模式:", this.isEditMode);
	}

	/**
	 * 📱 清除移动端顶部栏按钮
	 */
	private clearMobileActions(): void {
		for (const element of this.mobileActionElements) {
			if (element?.parentNode) {
				element.parentNode.removeChild(element);
			}
		}
		this.mobileActionElements = [];
		logger.debug("[QuestionBankView] 📱 已清除移动端按钮");
	}

	/**
	 * 📱 添加编辑模式按钮（保存并返回）
	 */
	private addEditModeActions(): void {
		const saveAction = this.addAction("check", i18n.t("views.questionBank.saveAndReturn"), async () => {
			logger.debug("[QuestionBankView] 移动端保存按钮被点击");
			await this.handleSaveFromHeader();
		});

		if (saveAction) {
			this.mobileActionElements.push(saveAction);
			logger.debug("[QuestionBankView] 📱 编辑模式保存按钮已添加");
			return;
		}

		logger.warn("[QuestionBankView] 📱 编辑模式保存按钮添加失败，请使用更多菜单中的保存项");
	}

	/**
	 * 📱 添加学习模式按钮
	 * 参考 StudyView.ts 的实现，按钮顺序从左到右
	 * 注意：Obsidian addAction 按钮会按添加顺序从右到左排列
	 */
	private addStudyModeActions(): void {
		logger.debug("[QuestionBankView] 📱 开始添加学习模式按钮...");

		if (!this.containerEl) {
			logger.warn("[QuestionBankView] 📱 containerEl 不存在");
			return;
		}

		// 学习模式：答题情况/题目导航已并入官方更多菜单「显示面板」子菜单
		logger.debug("[QuestionBankView] 📱 学习模式顶栏按钮已收敛到官方更多菜单");
	}

	/**
	 * 📱 处理从顶部栏保存按钮触发的保存
	 */
	private async handleSaveFromHeader(): Promise<void> {
		if (!this.saveCallback) {
			logger.warn("[QuestionBankView] 保存回调未设置");
			return;
		}

		try {
			await this.saveCallback();
			logger.debug("[QuestionBankView] 保存成功");
		} catch (error) {
			logger.error("[QuestionBankView] 保存失败:", error);
			new Notice(i18n.t("views.questionBank.saveFailed", {
				error: error instanceof Error ? error.message : i18n.t("common.unknown"),
			}));
		}
	}

	/**
	 * 📱 初始化移动端顶部栏按钮
	 */
	private initMobileActions(): void {
		if (!Platform.isMobile) return;

		this.addStudyModeActions();
		logger.debug("[QuestionBankView] 📱 移动端按钮初始化完成");
	}

	getViewType(): string {
		return VIEW_TYPE_QUESTION_BANK;
	}

	getDisplayText(): string {
		// 📱 移动端不显示标题，仅保留 Obsidian 原生顶部栏按钮
		return "";
	}

	getIcon(): string {
		return "clipboard-list";
	}

	allowNoFile(): boolean {
		return true;
	}

	// 设置导航类型为标签页
	getNavigationType(): string {
		return "tab";
	}

	/**
	 * 🔧 序列化视图状态（禁用持久化）
	 *
	 * 考试学习是临时性活动，重启后不应该恢复：
	 * 1. 避免服务初始化时序问题
	 * 2. 用户体验更清晰（重启 = 结束考试）
	 * 3. 降低技术复杂度
	 */
	getState(): QuestionBankViewState {
		// 返回空对象，Obsidian 不会保存此标签页到 workspace
		return {};
	}

	/**
	 * 🔧 恢复视图状态（接收学习参数）
	 */
	async setState(state: QuestionBankViewState, result: ItemViewSetStateResult): Promise<void> {
		await super.setState(state, result);

		// 🔧 如果是空状态或缺少 bankId，说明是重启后的无效恢复
		// 应该静默关闭此视图，让用户从题库列表重新开始
		if (!state || !state.bankId) {
			logger.debug("[QuestionBankView] 检测到空状态或无效 bankId，关闭视图");
			// 延迟关闭，避免在 setState 期间关闭导致的问题
			window.setTimeout(() => {
				this.leaf.detach();
			}, 100);
			return;
		}

		const oldBankId = this.bankId;

		// 更新状态
		this.bankId = state.bankId;
		this.bankName = state.bankName;
		this.mode = state.mode;
		this.config = state.config;
		this.resumeBehavior = state.resumeBehavior || "prompt";

		logger.debug("[QuestionBankView] ✅ 接收到考试参数:", {
			bankId: this.bankId,
			bankName: this.bankName,
			mode: this.mode,
		});

		// 🔧 如果组件未创建，现在创建它
		if (!this.component) {
			logger.debug("[QuestionBankView] 🔧 组件未创建，现在创建");
			await this.loadQuestionsAndCreateComponent();
		} else if (oldBankId !== this.bankId) {
			// 如果题库ID发生变化，重新加载
			logger.debug("[QuestionBankView] 🔄 题库ID变化，重新加载");
			await this.loadQuestionsAndCreateComponent();
		}
	}

	/**
	 * 等待题库服务初始化完成
	 * 使用事件驱动方式，比轮询更高效
	 *
	 * 注意：由于禁用了 Workspace 持久化，此方法通常不会在启动时触发
	 * 仅在运行时手动打开考试界面时可能需要短暂等待
	 */
	private async waitForQuestionBankService(): Promise<void> {
		if (this.plugin.questionBankService) {
			return;
		}

		logger.debug("[QuestionBankView] 等待题库服务初始化...");

		try {
			// 使用事件驱动等待，超时 5 秒
			const { waitForServiceReady } = await import("../utils/service-ready-event");
			await waitForServiceReady("questionBankService", 5000);
			logger.debug("[QuestionBankView] 题库服务已就绪（事件通知）");
		} catch {
			// 事件等待超时，回退到轮询检查
			logger.warn("[QuestionBankView] 事件等待超时，回退到轮询检查");

			const maxAttempts = 20;
			const interval = 100;

			for (let i = 0; i < maxAttempts; i++) {
				if (this.plugin.questionBankService) {
					logger.debug(`[QuestionBankView] 题库服务已就绪（轮询 ${i * interval}ms）`);
					return;
				}
				await new Promise((resolve) => window.setTimeout(resolve, interval));
			}

			throw new Error(i18n.t("views.questionBank.serviceInitTimeout"));
		}
	}

	/**
	 * 显示加载状态
	 */
	private showLoadingState(): void {
		this.contentEl.empty();
		this.contentEl.createDiv({
			cls: "weave-study-loading",
			text: i18n.t("views.questionBank.loadingBank"),
		});
	}

	/**
	 * 显示错误信息
	 */
	private showError(message: string): void {
		this.contentEl.empty();
		this.contentEl.createDiv({
			cls: "weave-study-view-error",
			text: `${message}`,
		});
	}

	/**
	 * 加载题目并创建组件
	 */
	private async loadQuestionsAndCreateComponent(): Promise<void> {
		if (!this.bankId) {
			logger.error("[QuestionBankView] 缺少 bankId");
			this.showError(i18n.t("views.questionBank.invalidBankId"));
			return;
		}

		try {
			this.showLoadingState();

			// 等待题库服务就绪
			await this.waitForQuestionBankService();

			// 从题库服务加载题目（使用正确的方法名）
			const questions = await this.plugin.questionBankService?.getQuestionsByBank(this.bankId);

			if (!questions || questions.length === 0) {
				this.showError(i18n.t("views.questionBank.emptyBank"));
				return;
			}

			this.questions = questions;
			logger.debug("[QuestionBankView] 已加载题目:", questions.length);

			await this.createStudyComponent();
		} catch (error) {
			logger.error("[QuestionBankView] 加载题目失败:", error);
			this.showError(
				i18n.t("views.questionBank.loadQuestionsFailed", {
					error: error instanceof Error ? error.message : i18n.t("common.unknown"),
				})
			);
		}
	}

	/**
	 * 创建学习组件（保持模态窗风格）
	 */
	private async createStudyComponent(): Promise<void> {
		try {
			this.contentEl.empty();
			this.contentEl.addClass("weave-question-bank-view-content");
			this.contentEl.addClass("weave-main-editor-mode"); // 与 StudyView 保持一致

			// 动态导入组件
			const { mount } = await import("svelte");
			const { default: QuestionBankStudyContainer } = await import(
				"../components/question-bank/QuestionBankStudyContainer.svelte"
			);

			if (!this.bankId || !this.questions) {
				this.showError(i18n.t("views.questionBank.incompleteData"));
				return;
			}

			this.component = mount(QuestionBankStudyContainer, {
				target: this.contentEl,
				props: {
					plugin: this.plugin,
					bankId: this.bankId,
					bankName: this.bankName,
					questions: this.questions,
					mode: this.mode || "exam",
					config: this.config,
					resumeBehavior: this.resumeBehavior,
					viewInstance: this, // 📱 传递视图实例用于移动端回调
					onBack: () => {
						this.close();
					},
				},
			});

			logger.debug("[QuestionBankView] ✅ 考试组件已挂载（保持模态窗风格）");
		} catch (error) {
			logger.error("[QuestionBankView] 创建组件失败:", error);
			this.showError(i18n.t("views.questionBank.loadInterfaceFailed"));
		}
	}

	async onOpen(): Promise<void> {
		logger.debug("[QuestionBankView] 视图正在打开...", this.instanceId);

		// 设置容器样式
		this.contentEl.empty();
		this.contentEl.addClass("weave-question-bank-view-content");
		this.contentEl.addClass("weave-main-editor-mode");

		// 📱 移动端：位置切换入口放到 Obsidian 官方更多菜单（onPaneMenu）
		if (!Platform.isMobile) {
			this.addLocationToggleButton();
		}

		// 📱 初始化移动端顶部栏按钮（与 StudyView 一致，使用 updateMobileActions）
		if (Platform.isMobile) {
			this.updateMobileActions();
		}

		// 显示加载占位符
		this.showLoadingState();

		// 后台异步初始化（不阻塞界面）
		void this.initializeAsync();
	}

	/**
	 * 📱 添加位置切换按钮
	 * 支持将视图在内容区和侧边栏之间移动
	 */
	private addLocationToggleButton(): void {
		this.locationToggleAction = addLocationToggleAction(this, "right");
		if (this.locationToggleAction) {
			logger.debug("[QuestionBankView] 📱 位置切换按钮已添加");
		}
	}

	/**
	 * 异步初始化（不阻塞 onOpen）
	 */
	private async initializeAsync(): Promise<void> {
		try {
			// 如果有 bankId，直接加载
			if (this.bankId) {
				await this.loadQuestionsAndCreateComponent();
			} else {
				// 等待通过 setState 接收参数
				logger.debug("[QuestionBankView] 等待接收考试参数...");
			}
		} catch (error) {
			logger.error("[QuestionBankView] 初始化失败:", error);
			this.showError(i18n.t("views.questionBank.initFailed"));
		}
	}

	async onClose(): Promise<void> {
		logger.debug("[QuestionBankView] 视图正在关闭...", this.instanceId);

		// 销毁 Svelte 组件
		if (this.component) {
			try {
				const { unmount } = await import("svelte");
				void unmount(this.component);
				logger.debug("[QuestionBankView] 考试组件已销毁");
			} catch (error) {
				logger.error("[QuestionBankView] 销毁组件失败:", error);
			}
			this.component = null;
		}

		logger.debug("[QuestionBankView] 视图已完全关闭");
	}

	/**
	 * 手动关闭视图（供外部调用）
	 */
	public close(): void {
		// 🔧 防止递归调用
		if (this.isClosing) {
			logger.debug("[QuestionBankView] 防止重入：视图正在关闭中");
			return;
		}

		this.isClosing = true;
		this.leaf.detach();
	}
}
