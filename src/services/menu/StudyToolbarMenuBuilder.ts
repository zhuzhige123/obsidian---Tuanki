import { Menu } from "obsidian";
import {
	addMenuRadioChoices,
	addMenuSubmenuGroup,
	addMenuToggle,
	getMenuSubmenu,
} from "../../utils/obsidian-menu";
import type { Card, Deck } from "../../data/types";
import type { AIAction } from "../../types/ai-types";
import {
	getRatingLabelStyleLabel,
	getRatingLabelStyleOptions,
	normalizeRatingLabelStyle,
	type RatingLabelStyle,
} from "../../components/study/rating-label-style";
import {
	getChoiceOptionOrderLabel,
	type ChoiceOptionOrder,
} from "../../utils/study/choiceOptionOrder";
import { i18n } from "../../utils/i18n";
import { logger } from "../../utils/logger";
import { getCardDeckIds } from "../../utils/yaml-utils";

type CardOrder = "sequential" | "random";
type PlayMediaMode = "first" | "all";
type PlayMediaTiming = "cardChange" | "showAnswer";

/**
 * 菜单构建器配置
 */
export interface MenuBuilderConfig {
	card: Card;
	decks: Deck[];
	isPremium: boolean;
	isGraphLinked: boolean;
	hasSourceFile: boolean;
	currentPriority: number;
	enableDirectDelete: boolean;
	showTimingInfo?: boolean; // 计时信息栏是否展开
	autoPlayMedia?: boolean;
	playMediaMode?: PlayMediaMode;
	playMediaTiming?: PlayMediaTiming;
	playbackInterval?: number;
	cardOrder?: CardOrder;
	choiceOptionOrder?: ChoiceOptionOrder;
	ratingLabelStyle?: RatingLabelStyle;
	showRatingIntervalOnButtons?: boolean;
	timerAutoPauseSeconds?: number;
	showClozeModeSwitchButton?: boolean;
	aiActions: {
		split: AIAction[];
	};
}

/**
 * 菜单回调函数
 */
export interface MenuCallbacks {
        onToggleEdit: () => void;
        onDelete: (skipConfirm?: boolean) => void;
        onSetReminder: () => void;
        onChangePriority: (priority: number) => void;
	onChangeDeck: (deckId: string) => void | Promise<void>;
	onRecycleCard: () => void;
	onSplitCard: (actionId: string) => void;
	onOpenAIConfig: () => void;
	onGraphLinkToggle: (enabled: boolean) => void;
	onOpenDetailedView: () => void;
	onOpenSourceBlock: () => void;
	onToggleTimingInfo?: () => void; // 切换计时信息栏
	onMediaAutoPlayChange?: (
		setting: "enabled" | "mode" | "timing" | "interval",
		value: boolean | PlayMediaMode | PlayMediaTiming | number
	) => void;
	onDirectDeleteToggle?: (enabled: boolean) => void;
	onCardOrderChange?: (order: CardOrder) => void;
	onChoiceOptionOrderChange?: (order: ChoiceOptionOrder) => void;
	onRatingLabelStyleChange?: (style: RatingLabelStyle) => void;
	onRatingIntervalButtonsToggle?: (enabled: boolean) => void;
	onTimerAutoPauseChange?: (seconds: number) => void;
	onClozeModeSwitchButtonToggle?: (enabled: boolean) => void;
}

/**
 * 优先级选项定义
 */
const getPriorityOptions = () =>
	[
		{ value: 1, label: i18n.t("study.priority.low"), icon: "!" },
		{ value: 2, label: i18n.t("study.priority.medium"), icon: "!!" },
		{ value: 3, label: i18n.t("study.priority.high"), icon: "!!!" },
		{ value: 4, label: i18n.t("study.priority.urgent"), icon: "!!!!" },
	] as const;

/**
 * 学习界面工具栏菜单构建器
 * 使用 Obsidian Menu API 构建原生风格的功能菜单
 */
export class StudyToolbarMenuBuilder {
	private lastMenuPosition: { x: number; y: number } | null = null;

	constructor(private config: MenuBuilderConfig, private callbacks: MenuCallbacks) {}

	/**
	 * 构建并显示完整菜单（计时信息已移至顶部信息栏）
	 */
	showMenuWithTimer(
		position: { x: number; y: number },
		_timerInfo: { currentCardTime: number; averageTime: number; formatTime: (ms: number) => string }
	): void {
		// 计时信息现在由顶部 MobileTimingInfoBar 显示，菜单中不再显示
		this.showMenu(position);
	}

	/**
	 * 构建并显示完整菜单
	 */
	/**
	 * 将学习多功能菜单项填入已有 Menu（用于 Obsidian 官方 leaf 更多菜单）
	 */
	populateMenu(menu: Menu): void {
		this.buildCardActionsSection(menu);

		if (this.config.isPremium) {
			menu.addSeparator();
			this.buildAISection(menu);
		}

		menu.addSeparator();
		this.buildMoreSection(menu);
	}

	showMenu(position: { x: number; y: number }): void {
		try {
			this.lastMenuPosition = position;
			const menu = new Menu();
			this.populateMenu(menu);
			menu.showAtPosition(position);

			logger.debug("[StudyToolbarMenuBuilder] 菜单已显示");
		} catch (error) {
			logger.error("[StudyToolbarMenuBuilder] 菜单构建失败:", error);
		}
	}

	/**
	 * 构建卡片操作分类
	 * 顺序：编辑卡片、删除卡片、移除卡片、回收卡片、更换牌组、设置提醒、设置优先级
	 */
	private buildCardActionsSection(menu: Menu): void {
		// 分类标题
		menu.addItem((item) => {
			item.setTitle(i18n.t("study.menu.cardActions")).setDisabled(true);
		});

		// 1. 编辑卡片
		menu.addItem((item) => {
			item
				.setTitle(i18n.t("study.menu.editCard"))
				.setIcon("edit")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onToggleEdit());
				});
		});

		// 2. 删除卡片
		menu.addItem((item) => {
			item
				.setTitle(i18n.t("study.menu.deleteCard"))
				.setIcon("trash")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onDelete(this.config.enableDirectDelete));
				});
		});

                // 3. 回收卡片
                menu.addItem((item) => {
                        item
                                .setTitle(i18n.t("study.menu.recycleCard"))
				.setIcon("archive")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onRecycleCard());
				});
		});

		// 4. 更换牌组（子菜单）
		addMenuSubmenuGroup(menu, { title: i18n.t("study.menu.changeDeck"), icon: "folder" }, (submenu) => {
			this.buildDeckSubmenu(submenu);
		});

		// 6. 设置提醒
		menu.addItem((item) => {
			item
				.setTitle(i18n.t("study.menu.setReminder"))
				.setIcon("bell")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onSetReminder());
				});
		});

		// 7. 设置优先级（子菜单）
		addMenuSubmenuGroup(menu, { title: i18n.t("study.menu.setPriority"), icon: "star" }, (submenu) => {
			this.buildPrioritySubmenu(submenu);
		});
	}

	/**
	 * 构建AI功能分类
	 */
	private buildAISection(menu: Menu): void {
		// 分类标题
		menu.addItem((item) => {
			item.setTitle(i18n.t("study.menu.aiFeatures")).setDisabled(true);
		});

		// AI助手（子菜单）
		addMenuSubmenuGroup(menu, { title: i18n.t("study.menu.aiSplit"), icon: "bot" }, (submenu) => {
			this.buildAISplitSubmenu(submenu);
		});

		addMenuToggle(menu, {
			title: i18n.t("study.menu.graphLink"),
			icon: "link",
			getChecked: () => this.config.isGraphLinked,
			isDisabled: () => !this.config.hasSourceFile,
			onSetChecked: (next) => {
				this.safeCallback(() => {
					this.callbacks.onGraphLinkToggle(next);
				});
			},
		});
	}

	/**
	 * 构建更多功能分类
	 */
	private buildMoreSection(menu: Menu): void {
		// 分类标题
		menu.addItem((item) => {
			item.setTitle(i18n.t("study.menu.more")).setDisabled(true);
		});

		// 卡片详情
		menu.addItem((item) => {
			item
				.setTitle(i18n.t("study.menu.cardDetails"))
				.setIcon("info")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onOpenDetailedView());
				});
		});

		// 查看源文本
		menu.addItem((item) => {
			item
				.setTitle(i18n.t("study.menu.viewSourceText"))
				.setIcon("file-text")
				.setDisabled(!this.config.hasSourceFile)
				.onClick(() => {
					if (this.config.hasSourceFile) {
						this.safeCallback(() => this.callbacks.onOpenSourceBlock());
					}
				});
		});

		// 计时信息栏开关
		if (this.callbacks.onToggleTimingInfo) {
			addMenuToggle(menu, {
				title: i18n.t("study.menu.timingInfo"),
				icon: "clock",
				getChecked: () => Boolean(this.config.showTimingInfo),
				onSetChecked: () => {
					this.safeCallback(() => this.callbacks.onToggleTimingInfo?.());
				},
			});
		}

		if (this.hasMoreSettingsSubmenu()) {
			addMenuSubmenuGroup(menu, { title: i18n.t("study.menu.moreSettings"), icon: "settings" }, (submenu) => {
				this.buildMoreSettingsSubmenu(submenu);
			});
		}
	}

	private hasMoreSettingsSubmenu(): boolean {
		return Boolean(
			this.callbacks.onMediaAutoPlayChange ||
			this.callbacks.onDirectDeleteToggle ||
			this.callbacks.onCardOrderChange ||
			this.callbacks.onChoiceOptionOrderChange ||
			this.callbacks.onRatingLabelStyleChange ||
			this.callbacks.onRatingIntervalButtonsToggle ||
			this.callbacks.onTimerAutoPauseChange ||
			this.callbacks.onClozeModeSwitchButtonToggle
		);
	}

	private buildMoreSettingsSubmenu(menu: Menu): void {
		if (this.callbacks.onMediaAutoPlayChange) {
			addMenuToggle(menu, {
				title: i18n.t("study.menu.settings.autoPlayMedia"),
				icon: "play",
				getChecked: () => Boolean(this.config.autoPlayMedia),
				onSetChecked: (enabled) => {
					this.safeCallback(() => this.callbacks.onMediaAutoPlayChange?.("enabled", enabled));
				},
			});

			this.addLabelledRadioSubmenu(
				menu,
				"study.menu.settings.playMediaMode.label",
				this.getPlayMediaModeLabel(this.config.playMediaMode ?? "first"),
				"list",
				!this.config.autoPlayMedia,
				[
					{ value: "first", title: i18n.t("study.menu.settings.playMediaMode.first") },
					{ value: "all", title: i18n.t("study.menu.settings.playMediaMode.all") },
				],
				this.config.playMediaMode ?? "first",
				(value) => {
					this.safeCallback(() => this.callbacks.onMediaAutoPlayChange?.("mode", value));
				}
			);

			this.addLabelledRadioSubmenu(
				menu,
				"study.menu.settings.playMediaTiming.label",
				this.getPlayMediaTimingLabel(this.config.playMediaTiming ?? "cardChange"),
				"clock",
				!this.config.autoPlayMedia,
				[
					{ value: "cardChange", title: i18n.t("study.menu.settings.playMediaTiming.cardChange") },
					{ value: "showAnswer", title: i18n.t("study.menu.settings.playMediaTiming.showAnswer") },
				],
				this.config.playMediaTiming ?? "cardChange",
				(value) => {
					this.safeCallback(() => this.callbacks.onMediaAutoPlayChange?.("timing", value));
				}
			);

			this.addLabelledRadioSubmenu(
				menu,
				"study.menu.settings.playbackInterval.label",
				this.formatPlaybackInterval(this.config.playbackInterval ?? 2000),
				"timer",
				!this.config.autoPlayMedia || (this.config.playMediaMode ?? "first") !== "all",
				[1000, 1500, 2000, 2500, 3000].map((value) => ({
					value,
					title: this.formatPlaybackInterval(value),
				})),
				this.config.playbackInterval ?? 2000,
				(value) => {
					this.safeCallback(() => this.callbacks.onMediaAutoPlayChange?.("interval", value));
				}
			);

			menu.addSeparator();
		}

		if (this.callbacks.onCardOrderChange) {
			this.addLabelledRadioSubmenu(
				menu,
				"study.menu.settings.cardOrder.label",
				this.getCardOrderLabel(this.config.cardOrder ?? "sequential"),
				"arrow-up-down",
				false,
				[
					{ value: "sequential", title: i18n.t("study.menu.settings.cardOrder.sequential") },
					{ value: "random", title: i18n.t("study.menu.settings.cardOrder.random") },
				],
				this.config.cardOrder ?? "sequential",
				(value) => {
					this.safeCallback(() => this.callbacks.onCardOrderChange?.(value));
				}
			);
		}

		if (this.callbacks.onChoiceOptionOrderChange) {
			this.addLabelledRadioSubmenu(
				menu,
				"study.menu.settings.choiceOptionOrder.label",
				getChoiceOptionOrderLabel(this.config.choiceOptionOrder ?? "sequential"),
				"list-ordered",
				false,
				[
					{ value: "sequential", title: i18n.t("study.menu.settings.choiceOptionOrder.sequential") },
					{ value: "random", title: i18n.t("study.menu.settings.choiceOptionOrder.random") },
				],
				this.config.choiceOptionOrder ?? "sequential",
				(value) => {
					this.safeCallback(() => this.callbacks.onChoiceOptionOrderChange?.(value));
				}
			);
		}

		if (this.callbacks.onRatingLabelStyleChange) {
			const currentStyle = normalizeRatingLabelStyle(this.config.ratingLabelStyle);
			this.addLabelledRadioSubmenu(
				menu,
				"study.menu.settings.ratingLabelStyle",
				getRatingLabelStyleLabel(currentStyle, (key, params) => i18n.t(key, params)),
				"panel-top",
				false,
				getRatingLabelStyleOptions((key, params) => i18n.t(key, params)).map((option) => ({
					value: option.id,
					title: option.label,
				})),
				currentStyle,
				(value) => {
					this.safeCallback(() => this.callbacks.onRatingLabelStyleChange?.(value));
				}
			);
		}

		if (this.callbacks.onTimerAutoPauseChange) {
			this.addLabelledRadioSubmenu(
				menu,
				"study.menu.settings.timerAutoPause.label",
				this.formatTimerAutoPauseLabel(this.config.timerAutoPauseSeconds ?? 60),
				"clock-3",
				false,
				[0, 30, 60, 90, 120, 180, 300].map((value) => ({
					value,
					title: this.formatTimerAutoPauseLabel(value),
				})),
				this.config.timerAutoPauseSeconds ?? 60,
				(value) => {
					this.safeCallback(() => this.callbacks.onTimerAutoPauseChange?.(value));
				}
			);
		}

		if (this.callbacks.onDirectDeleteToggle) {
			addMenuToggle(menu, {
				title: i18n.t("study.menu.settings.directDeleteEnabled"),
				icon: "trash",
				getChecked: () => Boolean(this.config.enableDirectDelete),
				onSetChecked: (enabled) => {
					this.safeCallback(() => this.callbacks.onDirectDeleteToggle?.(enabled));
				},
			});
		}

		if (this.callbacks.onClozeModeSwitchButtonToggle) {
			addMenuToggle(menu, {
				title: i18n.t("study.menu.settings.showClozeModeSwitchButton"),
				icon: "pilcrow",
				getChecked: () => this.config.showClozeModeSwitchButton ?? true,
				onSetChecked: (enabled) => {
					this.safeCallback(() => this.callbacks.onClozeModeSwitchButtonToggle?.(enabled));
				},
			});
		}
	}

	private addLabelledRadioSubmenu<T extends string | number>(
		menu: Menu,
		labelKey: string,
		currentLabel: string,
		icon: string,
		disabled: boolean,
		choices: Array<{ value: T; title: string }>,
		currentValue: T,
		onSelect: (value: T) => void
	): void {
		menu.addItem((item) => {
			item
				.setTitle(this.formatMenuValueLabel(labelKey, currentLabel))
				.setIcon(icon)
				.setDisabled(disabled);
			if (disabled) {
				return;
			}

			addMenuRadioChoices(getMenuSubmenu(item), currentValue, choices, (value) => {
				onSelect(value);
			});
		});
	}

	private formatMenuValueLabel(labelKey: string, value: string): string {
		return `${i18n.t(labelKey)}: ${value}`;
	}

	private getPlayMediaModeLabel(mode: PlayMediaMode): string {
		return mode === "all"
			? i18n.t("study.menu.settings.playMediaMode.all")
			: i18n.t("study.menu.settings.playMediaMode.first");
	}

	private getPlayMediaTimingLabel(timing: PlayMediaTiming): string {
		return timing === "showAnswer"
			? i18n.t("study.menu.settings.playMediaTiming.showAnswer")
			: i18n.t("study.menu.settings.playMediaTiming.cardChange");
	}

	private formatPlaybackInterval(interval: number): string {
		return i18n.t("studyInterface.intervals.seconds", { n: interval / 1000 });
	}

	private getCardOrderLabel(order: CardOrder): string {
		return order === "random"
			? i18n.t("study.menu.settings.cardOrder.random")
			: i18n.t("study.menu.settings.cardOrder.sequential");
	}

	private formatTimerAutoPauseLabel(seconds: number): string {
		if (seconds <= 0) {
			return i18n.t("study.menu.settings.timerAutoPause.off");
		}

		if (seconds >= 60) {
			return i18n.t("studyInterface.intervals.minutes", { n: seconds / 60 });
		}

		return i18n.t("studyInterface.intervals.seconds", { n: seconds });
	}

	/**
	 * 构建优先级子菜单
	 */
	private buildPrioritySubmenu(menu: Menu): void {
		addMenuRadioChoices(
			menu,
			this.config.currentPriority,
			getPriorityOptions().map((option) => ({
				title: `${option.icon} ${option.label}`,
				value: option.value,
			})),
			(value) => {
				this.safeCallback(() => this.callbacks.onChangePriority(value));
			}
		);
	}

	/**
	 * 构建AI拆分子菜单
	 */
	private buildAISplitSubmenu(menu: Menu): void {
		const { aiActions } = this.config;

		// 卡片拆分
		if (aiActions.split.length > 0) {
			menu.addItem((item) => {
				item.setTitle(i18n.t("study.menu.splitCards")).setDisabled(true);
			});
			aiActions.split.forEach((action) => {
				menu.addItem((item) => {
					item
						.setTitle(action.name)
						.setIcon(action.icon || "scissors")
						.onClick(() => {
							this.safeCallback(() => this.callbacks.onSplitCard(action.id));
						});
				});
			});
		}

		// 管理AI动作
		menu.addSeparator();
		menu.addItem((item) => {
			item
				.setTitle(i18n.t("study.menu.manageAIActions"))
				.setIcon("settings")
				.onClick(() => {
					this.safeCallback(() => this.callbacks.onOpenAIConfig());
				});
		});

		// 无功能时的提示
		if (aiActions.split.length === 0) {
			menu.addItem((item) => {
				item.setTitle(i18n.t("study.menu.noAvailableFeatures")).setDisabled(true);
			});
		}
	}

	/**
	 * 构建牌组切换子菜单
	 */
	private buildDeckSubmenu(menu: Menu): void {
		const { decks, card } = this.config;

		if (!decks || decks.length === 0) {
			menu.addItem((item) => {
				item.setTitle(i18n.t("study.menu.noAvailableDecks")).setDisabled(true);
			});
			return;
		}

		// 优先从 content YAML 的 we_decks 获取牌组 ID（多选）
		const { deckIds } = getCardDeckIds(card, decks, { fallbackToReferences: false });
		const selectedDeckIds = new Set(deckIds);

		// 标题
		menu.addItem((item) => {
			item.setTitle(i18n.t("study.menu.setCardDecks")).setDisabled(true);
		});
		menu.addSeparator();

		// 牌组列表（复选）
		decks.forEach((deck) => {
			const indent = "  ".repeat(deck.level || 0);
			const isSelected = selectedDeckIds.has(deck.id);

			menu.addItem((item) => {
				item
					.setTitle(`${indent}${deck.name}`)
					.setIcon(isSelected ? "check-square" : "square")
					.onClick(() => {
						// 尝试保持菜单可连续点击：点击后异步执行，再在相同位置重开菜单
						const pos = this.lastMenuPosition;

						this.safeCallback(() => {
							void Promise.resolve(this.callbacks.onChangeDeck(deck.id)).finally(() => {
								if (pos) {
									window.setTimeout(() => {
										const newMenu = new Menu();
										this.buildDeckSubmenu(newMenu);
										newMenu.showAtPosition(pos);
									}, 0);
								}
							});
						});
					});
			});
		});
	}

	/**
	 * 安全执行回调（带错误处理）
	 */
	private safeCallback(callback: () => void): void {
		try {
			callback();
		} catch (error) {
			logger.error("[StudyToolbarMenuBuilder] 回调执行失败:", error);
		}
	}
}
