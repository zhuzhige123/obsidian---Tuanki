import { Menu } from "obsidian";
import { addMenuSubmenuGroup } from "../../utils/obsidian-menu";
import { get } from "svelte/store";
import type { Card } from "../../data/types";
import { customActionsForMenu } from "../../stores/ai-config.store";
import type { AIAction } from "../../types/ai-types";
import { logger } from "../../utils/logger";
import { DerivationMethod } from "../relation/types";

/**
 * AI助手菜单构建器
 * 负责构建和显示AI助手的多级菜单
 */
export class AIAssistantMenuBuilder {
	constructor(
		private card: Card,
		private onSplitCard: (actionId: string) => void,
		private onManageActions: () => void
	) {}

	/**
	 * 检查卡片是否为子卡片（已拆分的卡片）
	 */
	private isChildCard(card: Card): boolean {
		// 方法1: 检查是否有父卡片ID
		if (card.parentCardId) {
			return true;
		}

		// 方法2: 检查关系元数据
		if (card.relationMetadata) {
			// 如果明确标记为非父卡片，则为子卡片
			if (card.relationMetadata.isParent === false) {
				return true;
			}

			// 如果有派生元数据且方法为AI拆分，则为子卡片
			if (card.relationMetadata.derivationMetadata?.method === DerivationMethod.AI_SPLIT) {
				return true;
			}
		}

		return false;
	}

	//  refreshMenuData已移除，Store自动保持最新数据

	/**
	 * 显示主菜单（使用悬停展开子菜单）
	 */
	showMainMenu(evt: MouseEvent): void {
		const menu = new Menu();

		addMenuSubmenuGroup(menu, { title: "AI拆分" }, (splitSubmenu) => {
			this.buildSplitSubmenu(splitSubmenu);
		});

		menu.showAtMouseEvent(evt);
	}

	/**
	 * 构建AI拆分子菜单内容
	 */
	private buildSplitSubmenu(menu: Menu): void {
		const actions = this.getSplitActions();

		logger.debug("[AIAssistantMenuBuilder] 构建AI拆分子菜单");
		logger.debug("[AIAssistantMenuBuilder] 可用的拆分功能数量:", actions.length);

		if (this.isChildCard(this.card)) {
			menu.addItem((item) => {
				item.setTitle("已拆分子卡不支持再次拆分").setDisabled(true);
			});
			menu.addSeparator();
			menu.addItem((item) => {
				item.setTitle("AI拆分配置...").onClick(() => {
					this.onManageActions();
				});
			});
			return;
		}

		// 添加所有拆分功能
		if (actions.length === 0) {
			logger.warn("[AIAssistantMenuBuilder] ⚠️ 警告: 没有可用的AI拆分功能");
			menu.addItem((item) => {
				item.setTitle("暂无可用功能").setDisabled(true);
			});
		} else {
			actions.forEach((action) => {
				menu.addItem((item) => {
					item.setTitle(action.name).onClick(() => {
						logger.debug("[AIAssistantMenuBuilder] 用户点击拆分功能:", {
							id: action.id,
							name: action.name,
						});
						this.onSplitCard(action.id);
					});
				});
			});
		}

		// 添加分隔线和管理设置
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle("AI拆分配置...").onClick(() => {
				this.onManageActions();
			});
		});
	}

	/**
	 *  获取所有拆分功能（直接从Store读取）
	 */
	private getSplitActions(): AIAction[] {
		const actions = get(customActionsForMenu);
		return actions.split;
	}
}
