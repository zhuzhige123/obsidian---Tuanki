import { Menu } from "obsidian";
import type { Deck } from "../../data/types";
import { logger } from "../../utils/logger";

/** 子卡片菜单构建所需的状态。 */
export interface ChildCardsMenuConfig {
	selectedCount: number;
	isRegenerating: boolean;
	showDeckSelector: boolean;
	availableDecks: Array<{ id: string; name: string }>;
	selectedDeckId: string;
}

/** 子卡片菜单触发的外部回调。 */
export interface ChildCardsMenuCallbacks {
	onReturn: () => void;
	onRegenerate: () => void;
	onSave: () => void;
	onDeckChange: (deckId: string) => void;
}

/** 构建 AI 子卡片相关的 Obsidian 菜单。 */
export class ChildCardsMenuBuilder {
	constructor(private config: ChildCardsMenuConfig, private callbacks: ChildCardsMenuCallbacks) {}

	/** 显示独立的牌组选择菜单。 */
	showDeckSelectMenu(event: MouseEvent): void {
		try {
			const menu = new Menu();
			menu.setUseNativeMenu?.(false);
			this.addMenuTitle(menu, "选择目标牌组");
			menu.addSeparator();
			this.addDeckItems(menu);

			menu.showAtMouseEvent(event);
			logger.debug("[ChildCardsMenuBuilder] 牌组选择菜单已显示");
		} catch (error) {
			logger.error("[ChildCardsMenuBuilder] 牌组选择菜单构建失败:", error);
		}
	}

	/** 显示完整的子卡片操作菜单。 */
	showFullMenu(position: { x: number; y: number }): void {
		try {
			const menu = new Menu();
			const { selectedCount, isRegenerating, showDeckSelector, selectedDeckId, availableDecks } =
				this.config;

			this.addMenuTitle(menu, "子卡片操作");
			menu.addSeparator();

			if (showDeckSelector && availableDecks.length > 0) {
				const currentDeck = availableDecks.find((d) => d.id === selectedDeckId);
				menu.addItem((item) => {
					item.setTitle(`目标牌组: ${currentDeck?.name || "未选择"}`).setIcon("folder");
					const submenu = (item as any).setSubmenu();
					this.buildDeckSubmenu(submenu);
				});
				menu.addSeparator();
			}

			menu.addItem((item) => {
				item
					.setTitle("返回")
					.setIcon("arrow-left")
					.onClick(() => {
						this.safeCallback(() => this.callbacks.onReturn());
					});
			});

			menu.addItem((item) => {
				item
					.setTitle(isRegenerating ? "正在生成..." : "重新生成")
					.setIcon("refresh-cw")
					.setDisabled(isRegenerating)
					.onClick(() => {
						if (!isRegenerating) {
							this.safeCallback(() => this.callbacks.onRegenerate());
						}
					});
			});

			const canSave = selectedCount > 0 && !isRegenerating && (!showDeckSelector || selectedDeckId);
			menu.addItem((item) => {
				item
					.setTitle(`收入 ${selectedCount} 张卡片`)
					.setIcon("save")
					.setDisabled(!canSave)
					.onClick(() => {
						if (canSave) {
							this.safeCallback(() => this.callbacks.onSave());
						}
					});
			});

			menu.showAtPosition(position);
			logger.debug("[ChildCardsMenuBuilder] 完整操作菜单已显示");
		} catch (error) {
			logger.error("[ChildCardsMenuBuilder] 完整操作菜单构建失败:", error);
		}
	}

	/** 构建牌组子菜单。 */
	private buildDeckSubmenu(menu: Menu): void {
		this.addDeckItems(menu);
	}

	/** 添加菜单标题。 */
	private addMenuTitle(menu: Menu, title: string): void {
		menu.addItem((item) => {
			item.setTitle(title).setDisabled(true);
		});
	}

	/** 将可选牌组条目填充到菜单中。 */
	private addDeckItems(menu: Menu): void {
		const { availableDecks, selectedDeckId } = this.config;

		if (!availableDecks || availableDecks.length === 0) {
			menu.addItem((item) => {
				item.setTitle("暂无可用牌组").setDisabled(true);
			});
			return;
		}

		availableDecks.forEach((deck) => {
			menu.addItem((item) => {
				item
					.setTitle(deck.name)
					.setIcon("folder")
					.setChecked(deck.id === selectedDeckId)
					.onClick(() => {
						this.safeCallback(() => this.callbacks.onDeckChange(deck.id));
					});
			});
		});
	}

	/** 统一捕获回调中的运行时异常。 */
	private safeCallback(callback: () => void): void {
		try {
			callback();
		} catch (error) {
			logger.error("[ChildCardsMenuBuilder] 回调执行失败:", error);
		}
	}
}
