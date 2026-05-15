import { App, Modal, Notice, Setting } from "obsidian";
import type { EmergentRuleGroup } from "../services/deck/emergent-rule-groups";

type OnSavePayload = {
	groups: EmergentRuleGroup[];
	activeRuleGroupId: string;
};

interface EmergentRuleGroupModalOptions {
	groups: EmergentRuleGroup[];
	activeRuleGroupId: string;
	onSave: (payload: OnSavePayload) => Promise<void> | void;
}

export class EmergentRuleGroupModal extends Modal {
	private groups: EmergentRuleGroup[];
	private activeRuleGroupId: string;
	private readonly onSaveCallback: EmergentRuleGroupModalOptions["onSave"];

	constructor(app: App, options: EmergentRuleGroupModalOptions) {
		super(app);
		this.groups = options.groups.map((group) => ({ ...group }));
		this.activeRuleGroupId = options.activeRuleGroupId;
		this.onSaveCallback = options.onSave;
	}

	onOpen(): void {
		this.modalEl.addClass("weave-emergent-rule-group-modal");
		this.render();
	}

	onClose(): void {
		this.modalEl.removeClass("weave-emergent-rule-group-modal");
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle("涌现规则组");

		contentEl.createEl("p", {
			text: "在这里管理不同的涌现观察模式。当前激活的规则组会立即决定哪些动态主题能显示在涌现牌组区域中。",
			cls: "weave-emergent-rule-group-modal__desc",
		});

		const listEl = contentEl.createDiv({
			cls: "weave-emergent-rule-group-modal__list",
		});

		this.groups.forEach((group, index) => {
			const sectionEl = listEl.createDiv({
				cls: "weave-emergent-rule-group-modal__section",
			});

			sectionEl.createEl("div", {
				text: this.activeRuleGroupId === group.id ? "当前规则组" : `规则组 ${index + 1}`,
				cls: "weave-emergent-rule-group-modal__section-title",
			});

			const nameSetting = new Setting(sectionEl)
				.setName("名称")
				.setDesc("用于在顶部按钮菜单中识别当前观察模式");
			nameSetting.addText((text) =>
				text.setPlaceholder("例如：稳定主题").setValue(group.name).onChange((value) => {
					group.name = value.trim() || `规则组 ${index + 1}`;
				})
			);

			const thresholdSetting = new Setting(sectionEl)
				.setName("最小浮现卡片数")
				.setDesc("命中该主题的卡片数达到这个阈值后，相关涌现牌组才会显示");
			thresholdSetting.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.setValue(String(group.minCandidateCardCount)).onChange((value) => {
					const nextValue = Number(value);
					group.minCandidateCardCount =
						Number.isFinite(nextValue) && nextValue > 0
							? Math.max(1, Math.floor(nextValue))
							: 1;
				});
			});

			new Setting(sectionEl)
				.setName("仅显示有可学卡片的牌组")
				.setDesc("开启后会隐藏当前无可学卡片的涌现牌组")
				.addToggle((toggle) => {
					toggle.setValue(group.onlyLearnableDecks === true).onChange((value) => {
						group.onlyLearnableDecks = value;
					});
				});

			const actionSetting = new Setting(sectionEl)
				.setName("操作")
				.setDesc(this.activeRuleGroupId === group.id ? "当前规则组已在涌现区域生效" : "可切换为当前规则组");

			actionSetting.addButton((button) =>
				button
					.setButtonText(this.activeRuleGroupId === group.id ? "当前使用中" : "设为当前")
					.setCta()
					.onClick(() => {
						this.activeRuleGroupId = group.id;
						this.render();
					})
			);

			actionSetting.addExtraButton((button) =>
				button
					.setIcon("trash")
					.setTooltip("删除该规则组")
					.onClick(() => {
						if (this.groups.length <= 1) {
							new Notice("至少需要保留一个涌现规则组", 3000);
							return;
						}

						this.groups = this.groups.filter((item) => item.id !== group.id);
						if (this.activeRuleGroupId === group.id) {
							this.activeRuleGroupId = this.groups[0]?.id || "";
						}
						this.render();
					})
			);
		});

		new Setting(contentEl)
			.setName("新增规则组")
			.setDesc("复制一个新的观察模式，用于切换不同的涌现阈值")
			.addButton((button) =>
				button.setButtonText("新增").setCta().onClick(() => {
					const nextIndex = this.groups.length + 1;
					const newGroup: EmergentRuleGroup = {
						id: `rule-group-${Date.now()}`,
						name: `规则组 ${nextIndex}`,
						minCandidateCardCount: this.groups[this.groups.length - 1]?.minCandidateCardCount || 2,
						onlyLearnableDecks: false,
						requiredTags: [],
						excludedTags: [],
						sourceFolders: [],
						priorityMin: null,
						priorityMax: null,
						createdAfter: null,
						createdBefore: null,
					};
					this.groups = [...this.groups, newGroup];
					this.activeRuleGroupId = newGroup.id;
					this.render();
				})
			);

		const footerSetting = new Setting(contentEl).setClass("weave-emergent-rule-group-modal__footer");
		footerSetting.addButton((button) =>
			button.setButtonText("取消").onClick(() => this.close())
		);
		footerSetting.addButton((button) =>
			button
				.setButtonText("保存并应用")
				.setCta()
				.onClick(async () => {
					await this.onSaveCallback({
						groups: this.groups.map((group) => ({
							...group,
							name: group.name.trim() || "未命名规则组",
							minCandidateCardCount: Math.max(1, Math.floor(group.minCandidateCardCount || 1)),
							onlyLearnableDecks: group.onlyLearnableDecks === true,
						})),
						activeRuleGroupId: this.activeRuleGroupId || this.groups[0]?.id || "",
					});
					this.close();
				})
		);
	}
}
