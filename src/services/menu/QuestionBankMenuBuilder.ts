import { Menu } from "obsidian";
import type { Card } from "../../data/types";
import type { ChoiceOptionOrder } from "../../utils/study/choiceOptionOrder";
import { logger } from "../../utils/logger";

/**
 * 考试界面菜单构建器配置
 */
export interface QuestionBankMenuConfig {
	card: Card;
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
	onDelete: (skipConfirm?: boolean) => void;
	onToggleFavorite: () => void;
	onChangePriority: () => void;
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
	showMenu(position: { x: number; y: number }): void {
		try {
			const menu = new Menu();

			// 1. 卡片操作分类
			this.buildCardActionsSection(menu);

			// 2. 显示设置分类
			menu.addSeparator();
			this.buildDisplaySection(menu);

			// 3. 更多功能分类
			menu.addSeparator();
			this.buildMoreSection(menu);

			// 显示菜单
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

		// 1. 编辑卡片
		menu.addItem((item) => {
			item
				.setTitle("编辑卡片")
				.setIcon("edit")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onToggleEdit());
				});
		});

		// 2. 删除卡片
		menu.addItem((item) => {
			item
				.setTitle("删除卡片")
				.setIcon("trash")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onDelete(this.config.enableDirectDelete));
				});
		});

		// 3. 收藏卡片
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
		menu.addItem((item) => {
			item.setTitle("设置重要程度").setIcon("flag");
			const submenu = (item as any).setSubmenu();
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
			menu.addItem((item) => {
				item
					.setTitle("答题情况")
					.setIcon("bar-chart-2")
					.setChecked(this.config.showStatsBar ?? false)
					.onClick(() => {
						this.safeCallback(() => this.callbacks.onToggleStatsBar?.());
					});
			});
		}

		// 📱 题目导航栏开关
		if (this.callbacks.onToggleNavigator) {
			menu.addItem((item) => {
				item
					.setTitle("题目导航")
					.setIcon("list-ordered")
					.setChecked(this.config.showNavigator ?? false)
					.onClick(() => {
						this.safeCallback(() => this.callbacks.onToggleNavigator?.());
					});
			});
		}

		// 题目顺序
		if (this.callbacks.onQuestionOrderChange) {
			menu.addItem((item) => {
				item.setTitle("题目顺序").setIcon("shuffle");
				const submenu = (item as any).setSubmenu();
				this.buildQuestionOrderSubmenu(submenu);
			});
		}

		if (this.callbacks.onChoiceOptionOrderChange) {
			menu.addItem((item) => {
				item.setTitle("选项顺序").setIcon("list-ordered");
				const submenu = (item as any).setSubmenu();
				this.buildChoiceOptionOrderSubmenu(submenu);
			});
		}

		// 导航列数
		if (this.callbacks.onNavColumnModeChange) {
			menu.addItem((item) => {
				item.setTitle("导航列数").setIcon("layout-grid");
				const submenu = (item as any).setSubmenu();
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
			menu.addItem((item) => {
				item
					.setTitle("启用直接删除")
					.setIcon("zap")
					.setChecked(this.config.enableDirectDelete)
					.onClick(() => {
						this.safeCallback(() =>
							this.callbacks.onDirectDeleteToggle?.(!this.config.enableDirectDelete)
						);
					});
			});
		}
	}

	/**
	 * 构建优先级子菜单
	 */
	private buildPrioritySubmenu(submenu: Menu): void {
		const priorities = [
			{ value: 1, label: "低", icon: "!" },
			{ value: 2, label: "中", icon: "!!" },
			{ value: 3, label: "高", icon: "!!!" },
			{ value: 4, label: "极高", icon: "!!!!" },
		];

		priorities.forEach(({ value, label }) => {
			submenu.addItem((item) => {
				item
					.setTitle(label)
					.setChecked(this.config.currentPriority === value)
					.onClick(() => {
						this.safeCallback(() => this.callbacks.onChangePriority());
					});
			});
		});
	}

	/**
	 * 构建题目顺序子菜单
	 */
	private buildQuestionOrderSubmenu(submenu: Menu): void {
		const options = [
			{ value: "sequential" as const, label: "正序学习" },
			{ value: "random" as const, label: "乱序学习" },
		];

		options.forEach(({ value, label }) => {
			submenu.addItem((item) => {
				item
					.setTitle(label)
					.setChecked(this.config.questionOrder === value)
					.onClick(() => {
						this.safeCallback(() => this.callbacks.onQuestionOrderChange?.(value));
					});
			});
		});
	}

	/**
	 * 构建选项顺序子菜单
	 */
	private buildChoiceOptionOrderSubmenu(submenu: Menu): void {
		const options = [
			{ value: "sequential" as const, label: "正序" },
			{ value: "random" as const, label: "乱序" },
		];

		options.forEach(({ value, label }) => {
			submenu.addItem((item) => {
				item
					.setTitle(label)
					.setChecked(this.config.choiceOptionOrder === value)
					.onClick(() => {
						this.safeCallback(() => this.callbacks.onChoiceOptionOrderChange?.(value));
					});
			});
		});
	}

	/**
	 * 构建导航列数子菜单
	 */
	private buildNavColumnSubmenu(submenu: Menu): void {
		const options = [
			{ value: 1 as const, label: "单列显示" },
			{ value: 3 as const, label: "三列显示" },
		];

		options.forEach(({ value, label }) => {
			submenu.addItem((item) => {
				item
					.setTitle(label)
					.setChecked(this.config.navColumnMode === value)
					.onClick(() => {
						this.safeCallback(() => this.callbacks.onNavColumnModeChange?.(value));
					});
			});
		});
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
