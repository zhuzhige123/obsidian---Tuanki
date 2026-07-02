import { Menu } from "obsidian";
import {
	addMenuRadioChoices,
	addMenuSubmenuGroup,
	addMenuToggle,
} from "../../utils/obsidian-menu";
import type { Card } from "../../data/types";
import type { ChoiceOptionOrder } from "../../utils/study/choiceOptionOrder";
import { i18n } from "../../utils/i18n";
import { logger } from "../../utils/logger";

/**
 * 考试界面菜单构建器配置
 */
export interface QuestionBankMenuConfig {
	card: Card;
	isEditing?: boolean;
	hasSourceFile: boolean;
	currentPriority: number;
	enableDirectDelete: boolean;
	showStatsBar?: boolean; // 答题情况信息栏是否展开
	questionOrder?: "sequential" | "random";
	choiceOptionOrder?: ChoiceOptionOrder;
	navColumnMode?: 1 | 3;
	showNavigator?: boolean; // 📱 题目导航栏是否展开
}

/**
 * 考试界面菜单回调函数
 */
export interface QuestionBankMenuCallbacks {
	onToggleEdit: () => void;
	onRemove: (skipConfirm?: boolean) => void;
	onDelete: (skipConfirm?: boolean) => void;
	onToggleFavorite: () => void;
	onChangePriority: (priority?: number) => void;
	onOpenDetailedView: () => void;
	onOpenSourceBlock?: () => void;
	onToggleStatsBar?: () => void; // 切换答题情况信息栏
	onToggleNavigator?: () => void; // 📱 切换题目导航栏
	onQuestionOrderChange?: (order: "sequential" | "random") => void;
	onChoiceOptionOrderChange?: (order: ChoiceOptionOrder) => void;
	onNavColumnModeChange?: (mode: 1 | 3) => void;
	onDirectDeleteToggle?: (enabled: boolean) => void;
}

/**
 * 考试界面工具栏菜单构建器
 * 使用 Obsidian Menu API 构建原生风格的功能菜单
 * 用于移动端顶部多功能菜单
 */
export class QuestionBankMenuBuilder {
	constructor(
		private config: QuestionBankMenuConfig,
		private callbacks: QuestionBankMenuCallbacks
	) {}

	/**
	 * 构建并显示完整菜单
	 */
	/**
	 * 将考试学习多功能菜单项填入已有 Menu（用于 Obsidian 官方 leaf 更多菜单）
	 */
	populateMenu(menu: Menu): void {
		this.buildCardActionsSection(menu);
		menu.addSeparator();
		this.buildDisplaySection(menu);
		menu.addSeparator();
		this.buildMoreSection(menu);
	}

	showMenu(position: { x: number; y: number }): void {
		try {
			const menu = new Menu();
			this.populateMenu(menu);
			menu.showAtPosition(position);

			logger.debug("[QuestionBankMenuBuilder] 菜单已显示");
		} catch (error) {
			logger.error("[QuestionBankMenuBuilder] 菜单构建失败:", error);
		}
	}

	/**
	 * 构建卡片操作分类
	 */
	private buildCardActionsSection(menu: Menu): void {
		// 分类标题
		menu.addItem((item) => {
			item.setTitle("卡片操作").setDisabled(true);
		});

		// 1. 编辑 / 保存并预览
		menu.addItem((item) => {
			item
				.setTitle(
					this.config.isEditing
						? i18n.t("toolbar.saveAndPreview")
						: i18n.t("study.menu.editCard")
				)
				.setIcon(this.config.isEditing ? "eye" : "edit")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onToggleEdit());
				});
		});

		// 2. 从考试题组移除
		menu.addItem((item) => {
			item
				.setTitle(i18n.t("study.questionBankUI.verticalToolbar.removeCard"))
				.setIcon("unlink")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onRemove(this.config.enableDirectDelete));
				});
		});

		// 3. 删除卡片
		menu.addItem((item) => {
			item
				.setTitle(i18n.t("toolbar.deleteCard"))
				.setIcon("trash")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onDelete(this.config.enableDirectDelete));
				});
		});

		// 4. 收藏卡片
		const isFavorited = this.config.card.tags?.includes("#收藏");
		menu.addItem((item) => {
			item
				.setTitle(isFavorited ? "取消收藏" : "收藏卡片")
				.setIcon(isFavorited ? "star-off" : "star")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onToggleFavorite());
				});
		});

		// 4. 设置重要程度
		addMenuSubmenuGroup(menu, { title: "设置重要程度", icon: "flag" }, (submenu) => {
			this.buildPrioritySubmenu(submenu);
		});
	}

	/**
	 * 构建显示设置分类
	 */
	private buildDisplaySection(menu: Menu): void {
		// 分类标题
		menu.addItem((item) => {
			item.setTitle("显示设置").setDisabled(true);
		});

		// 答题情况信息栏开关
		if (this.callbacks.onToggleStatsBar) {
			addMenuToggle(menu, {
				title: "答题情况",
				icon: "bar-chart-2",
				getChecked: () => Boolean(this.config.showStatsBar),
				onSetChecked: () => {
					this.safeCallback(() => this.callbacks.onToggleStatsBar?.());
				},
			});
		}

		if (this.callbacks.onToggleNavigator) {
			addMenuToggle(menu, {
				title: "题目导航",
				icon: "list-ordered",
				getChecked: () => Boolean(this.config.showNavigator),
				onSetChecked: () => {
					this.safeCallback(() => this.callbacks.onToggleNavigator?.());
				},
			});
		}

		if (this.callbacks.onQuestionOrderChange) {
			addMenuSubmenuGroup(menu, { title: "题目顺序", icon: "shuffle" }, (submenu) => {
				this.buildQuestionOrderSubmenu(submenu);
			});
		}

		if (this.callbacks.onChoiceOptionOrderChange) {
			addMenuSubmenuGroup(menu, { title: "选项顺序", icon: "list-ordered" }, (submenu) => {
				this.buildChoiceOptionOrderSubmenu(submenu);
			});
		}

		if (this.callbacks.onNavColumnModeChange) {
			addMenuSubmenuGroup(menu, { title: "导航列数", icon: "layout-grid" }, (submenu) => {
				this.buildNavColumnSubmenu(submenu);
			});
		}
	}

	/**
	 * 构建更多功能分类
	 */
	private buildMoreSection(menu: Menu): void {
		// 分类标题
		menu.addItem((item) => {
			item.setTitle("更多").setDisabled(true);
		});

		// 卡片详情
		menu.addItem((item) => {
			item
				.setTitle("卡片详情")
				.setIcon("info")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onOpenDetailedView());
				});
		});

		// 查看源文本
		if (this.callbacks.onOpenSourceBlock) {
			menu.addItem((item) => {
				item
					.setTitle("查看源文本")
					.setIcon("file-text")
					.setDisabled(!this.config.hasSourceFile)
					.onClick(() => {
						if (this.config.hasSourceFile) {
							this.safeCallback(() => this.callbacks.onOpenSourceBlock?.());
						}
					});
			});
		}

		// 直接删除开关
		if (this.callbacks.onDirectDeleteToggle) {
			addMenuToggle(menu, {
				title: "启用直接删除",
				icon: "zap",
				getChecked: () => Boolean(this.config.enableDirectDelete),
				onSetChecked: (enabled) => {
					this.safeCallback(() => this.callbacks.onDirectDeleteToggle?.(enabled));
				},
			});
		}
	}

	/**
	 * 构建优先级子菜单
	 */
	private buildPrioritySubmenu(submenu: Menu): void {
		addMenuRadioChoices(
			submenu,
			this.config.currentPriority,
			[
				{ value: 1, title: "低" },
				{ value: 2, title: "中" },
				{ value: 3, title: "高" },
				{ value: 4, title: "极高" },
			],
			(value) => {
				this.safeCallback(() => this.callbacks.onChangePriority(value));
			}
		);
	}

	private buildQuestionOrderSubmenu(submenu: Menu): void {
		addMenuRadioChoices<"sequential" | "random">(
			submenu,
			this.config.questionOrder ?? "sequential",
			[
				{ value: "sequential", title: "正序学习" },
				{ value: "random", title: "乱序学习" },
			],
			(value) => {
				this.safeCallback(() => this.callbacks.onQuestionOrderChange?.(value));
			}
		);
	}

	private buildChoiceOptionOrderSubmenu(submenu: Menu): void {
		addMenuRadioChoices<ChoiceOptionOrder>(
			submenu,
			this.config.choiceOptionOrder ?? "sequential",
			[
				{ value: "sequential", title: "正序" },
				{ value: "random", title: "乱序" },
			],
			(value) => {
				this.safeCallback(() => this.callbacks.onChoiceOptionOrderChange?.(value));
			}
		);
	}

	private buildNavColumnSubmenu(submenu: Menu): void {
		addMenuRadioChoices<1 | 3>(
			submenu,
			this.config.navColumnMode ?? 1,
			[
				{ value: 1, title: "单列显示" },
				{ value: 3, title: "三列显示" },
			],
			(value) => {
				this.safeCallback(() => this.callbacks.onNavColumnModeChange?.(value));
			}
		);
	}

	/**
	 * 安全执行回调
	 */
	private safeCallback(callback: () => void): void {
		try {
			callback();
		} catch (error) {
			logger.error("[QuestionBankMenuBuilder] 回调执行失败:", error);
		}
	}
}
