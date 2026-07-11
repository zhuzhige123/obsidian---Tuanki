import { App, Modal } from "obsidian";
import type {
	DocumentQuizDifficultyLabel,
	DocumentQuizItem,
	DocumentQuizMasteryLabel,
	DocumentQuizParseSummary,
	DocumentQuizQuestionKind,
} from "../../types/document-quiz-types";
import { i18n } from "../../utils/i18n";
import {
	applyWeaveModalAccentTitle,
	clearWeaveModalAccentTitle,
} from "../weave-modal-chrome";

export interface DocumentQuizPreviewModalOptions {
	items: DocumentQuizItem[];
	summary: DocumentQuizParseSummary;
	onConfirm: (selected: DocumentQuizItem[]) => void;
	onCancel?: () => void;
}

type ResultFilter = "all" | "new" | "weak";

interface StatEntry {
	label: string;
	count: number;
}

const PREVIEW_MODAL_ACCENT = "blue" as const;
const ROW_INDEX_ATTR = "data-quiz-index";

export class DocumentQuizPreviewModal extends Modal {
	private selectedIndices = new Set<number>();
	private activeFilter: ResultFilter = "all";
	private confirmBtn: HTMLButtonElement | null = null;
	private listEl: HTMLElement | null = null;
	private kpiSelectedEl: HTMLElement | null = null;
	private readonly options: DocumentQuizPreviewModalOptions;

	constructor(app: App, options: DocumentQuizPreviewModalOptions) {
		super(app);
		this.options = options;
		for (const item of options.items) {
			if (item.status !== "error") {
				this.selectedIndices.add(item.index);
			}
		}
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass("weave-document-quiz-result-modal");
		modalEl.addClass("weave-document-quiz-result-modal-shell");

		this.setTitle(i18n.t("documentQuiz.result.title"));
		applyWeaveModalAccentTitle(this.titleEl, PREVIEW_MODAL_ACCENT);
		this.renderKpiStrip(contentEl);
		this.renderSummaryGrid(contentEl);
		this.renderListToolbar(contentEl);

		this.listEl = contentEl.createDiv({ cls: "weave-document-quiz-result-list" });
		this.renderList();

		const actions = contentEl.createDiv({ cls: "modal-button-container weave-document-quiz-result-actions" });
		actions.createEl("button", { text: i18n.t("common.cancel") }).addEventListener("click", () => {
			this.options.onCancel?.();
			this.close();
		});

		this.confirmBtn = actions.createEl("button", {
			cls: "mod-cta",
		});
		this.confirmBtn.addEventListener("click", () => {
			const selected = this.options.items.filter((item) => this.selectedIndices.has(item.index));
			if (selected.length === 0) {
				return;
			}
			this.options.onConfirm(selected);
			this.close();
		});
		this.updateSelectionUi();
	}

	onClose(): void {
		this.contentEl.empty();
		this.contentEl.removeClass("weave-document-quiz-result-modal");
		this.modalEl.removeClass("weave-document-quiz-result-modal-shell");
		clearWeaveModalAccentTitle(this.titleEl, PREVIEW_MODAL_ACCENT);
		this.confirmBtn = null;
		this.listEl = null;
		this.kpiSelectedEl = null;
	}

	private renderKpiStrip(container: HTMLElement): void {
		const { summary } = this.options;
		const strip = container.createDiv({ cls: "weave-document-quiz-result-kpis" });

		this.renderKpiCard(
			strip,
			i18n.t("documentQuiz.result.kpi.total"),
			String(summary.typeCounts.total),
			"is-total"
		);
		this.kpiSelectedEl = this.renderKpiCard(
			strip,
			i18n.t("documentQuiz.result.kpi.selected"),
			"0",
			"is-selected"
		);
		this.renderKpiCard(
			strip,
			i18n.t("documentQuiz.result.kpi.ready"),
			String(summary.typeCounts.ready),
			"is-ready"
		);
	}

	private renderKpiCard(
		container: HTMLElement,
		label: string,
		value: string,
		extraCls?: string
	): HTMLElement {
		const card = container.createDiv({
			cls: ["weave-document-quiz-result-kpi", extraCls].filter(Boolean).join(" "),
		});
		card.createDiv({ cls: "weave-document-quiz-result-kpi-value", text: value });
		card.createDiv({ cls: "weave-document-quiz-result-kpi-label", text: label });
		return card;
	}

	private renderSummaryGrid(container: HTMLElement): void {
		const { summary } = this.options;
		const grid = container.createDiv({ cls: "weave-document-quiz-result-stats-grid" });

		this.renderStatPanel(grid, i18n.t("documentQuiz.result.sections.types"), [
			{ label: i18n.t("documentQuiz.result.types.single_choice"), count: summary.typeCounts.singleChoice },
			{ label: i18n.t("documentQuiz.result.types.multiple_choice"), count: summary.typeCounts.multipleChoice },
			{ label: i18n.t("documentQuiz.result.types.cloze"), count: summary.typeCounts.cloze },
			{ label: i18n.t("documentQuiz.result.types.qa"), count: summary.typeCounts.qa },
			{ label: i18n.t("documentQuiz.result.types.other"), count: summary.typeCounts.other },
		]);

		this.renderStatPanel(grid, i18n.t("documentQuiz.result.sections.difficulty"), [
			{ label: i18n.t("documentQuiz.result.difficulty.easy"), count: summary.difficultyCounts.easy },
			{ label: i18n.t("documentQuiz.result.difficulty.medium"), count: summary.difficultyCounts.medium },
			{ label: i18n.t("documentQuiz.result.difficulty.hard"), count: summary.difficultyCounts.hard },
			{ label: i18n.t("documentQuiz.result.difficulty.unset"), count: summary.difficultyCounts.unset },
		]);

		this.renderStatPanel(grid, i18n.t("documentQuiz.result.sections.mastery"), [
			{ label: i18n.t("documentQuiz.result.mastery.new"), count: summary.masteryCounts.new },
			{ label: i18n.t("documentQuiz.result.mastery.weak"), count: summary.masteryCounts.weak },
			{ label: i18n.t("documentQuiz.result.mastery.fair"), count: summary.masteryCounts.fair },
			{ label: i18n.t("documentQuiz.result.mastery.strong"), count: summary.masteryCounts.strong },
		]);

		this.renderStatPanel(grid, i18n.t("documentQuiz.result.sections.status"), [
			{ label: i18n.t("documentQuiz.result.status.ready"), count: summary.typeCounts.ready },
			{ label: i18n.t("documentQuiz.result.status.warn"), count: summary.typeCounts.warn },
			{ label: i18n.t("documentQuiz.result.status.error"), count: summary.typeCounts.error },
		]);
	}

	private renderStatPanel(container: HTMLElement, title: string, entries: StatEntry[]): void {
		const panel = container.createDiv({ cls: "weave-document-quiz-result-stat-panel" });
		panel.createDiv({ cls: "weave-document-quiz-result-stat-title", text: title });

		const chips = panel.createDiv({ cls: "weave-document-quiz-result-stat-chips" });
		for (const entry of entries) {
			const chip = chips.createSpan({
				cls: [
					"weave-document-quiz-result-stat-chip",
					entry.count === 0 ? "is-zero" : "",
				]
					.filter(Boolean)
					.join(" "),
			});
			chip.setAttr("aria-label", `${entry.label}: ${entry.count}`);
			chip.createSpan({ cls: "weave-document-quiz-result-stat-chip-label", text: entry.label });
			chip.createSpan({
				cls: "weave-document-quiz-result-stat-chip-count",
				text: String(entry.count),
			});
		}
	}

	private renderListToolbar(container: HTMLElement): void {
		const group = container.createDiv({ cls: "weave-document-quiz-result-toolbar-group" });

		const filters = group.createDiv({ cls: "weave-document-quiz-result-filters" });
		this.renderFilterButton(filters, "all", i18n.t("documentQuiz.result.filterAll"));
		this.renderFilterButton(filters, "new", i18n.t("documentQuiz.result.filterNew"));
		this.renderFilterButton(filters, "weak", i18n.t("documentQuiz.result.filterWeak"));

		const bulk = group.createDiv({ cls: "weave-document-quiz-result-bulk" });
		this.renderFlatButton(bulk, i18n.t("documentQuiz.result.selectAll"), () => {
			for (const item of this.visibleItems()) {
				if (item.status !== "error") {
					this.selectedIndices.add(item.index);
				}
			}
			this.renderList();
			this.updateSelectionUi();
		});
		this.renderFlatButton(bulk, i18n.t("documentQuiz.result.selectNone"), () => {
			for (const item of this.visibleItems()) {
				this.selectedIndices.delete(item.index);
			}
			this.renderList();
			this.updateSelectionUi();
		});
	}

	private renderFlatButton(container: HTMLElement, label: string, onClick: () => void): void {
		const button = container.createEl("button", {
			cls: "clickable-icon weave-document-quiz-result-flat-btn",
			text: label,
		});
		button.addEventListener("click", (event) => {
			event.stopPropagation();
			onClick();
		});
	}

	private renderFilterButton(container: HTMLElement, filter: ResultFilter, label: string): void {
		const button = container.createEl("button", {
			cls: "clickable-icon weave-document-quiz-result-filter",
			text: label,
		});
		button.setAttr("aria-pressed", this.activeFilter === filter ? "true" : "false");
		if (this.activeFilter === filter) {
			button.addClass("is-active");
		}
		button.addEventListener("click", () => {
			this.activeFilter = filter;
			container.querySelectorAll(".weave-document-quiz-result-filter").forEach((el) => {
				el.removeClass("is-active");
				el.setAttr("aria-pressed", "false");
			});
			button.addClass("is-active");
			button.setAttr("aria-pressed", "true");
			this.renderList();
			this.updateSelectionUi();
		});
	}

	private visibleItems(): DocumentQuizItem[] {
		return this.options.items.filter((item) => {
			if (this.activeFilter === "new") {
				return item.mastery === "new";
			}
			if (this.activeFilter === "weak") {
				return item.mastery === "weak";
			}
			return true;
		});
	}

	private renderList(): void {
		if (!this.listEl) {
			return;
		}
		this.listEl.empty();

		const items = this.visibleItems();
		if (items.length === 0) {
			this.listEl.createEl("p", {
				cls: "weave-document-quiz-result-empty",
				text: i18n.t("documentQuiz.result.emptyFilter"),
			});
			return;
		}

		for (const item of items) {
			this.renderListRow(item);
		}
	}

	private renderListRow(item: DocumentQuizItem): void {
		if (!this.listEl) {
			return;
		}

		const isSelected = this.selectedIndices.has(item.index);
		const row = this.listEl.createDiv({
			cls: [
				"weave-document-quiz-result-row",
				isSelected ? "is-selected" : "",
				item.status === "warn" ? "is-warn" : "",
				item.status === "error" ? "is-error" : "",
			]
				.filter(Boolean)
				.join(" "),
		});
		row.setAttr(ROW_INDEX_ATTR, String(item.index));

		const toggleWrap = row.createDiv({ cls: "weave-document-quiz-result-row-toggle" });
		const toggle = toggleWrap.createEl("input", { type: "checkbox" });
		toggle.checked = isSelected;
		toggle.disabled = item.status === "error";
		toggle.addEventListener("click", (event) => {
			event.stopPropagation();
		});
		toggle.addEventListener("change", () => {
			this.setItemSelected(item.index, toggle.checked);
		});

		const main = row.createDiv({ cls: "weave-document-quiz-result-row-main" });
		main.createDiv({
			cls: "weave-document-quiz-result-row-title",
			text: `${item.index + 1}. ${item.stemPreview}`,
		});

		const badges = main.createDiv({ cls: "weave-document-quiz-result-badges" });
		this.renderBadge(badges, this.questionKindLabel(item.questionKind));
		this.renderBadge(badges, this.difficultyLabel(item.difficulty));
		this.renderBadge(badges, this.masteryLabel(item.mastery));
		if (item.status === "warn") {
			this.renderBadge(badges, i18n.t("documentQuiz.result.status.warn"), "status-warn");
		}
		if (item.status === "error") {
			this.renderBadge(badges, i18n.t("documentQuiz.result.status.error"), "status-error");
		}

		this.renderItemMeta(main, item);

		if (item.status !== "error") {
			row.addEventListener("click", () => {
				this.setItemSelected(item.index, !this.selectedIndices.has(item.index));
			});
		}
	}

	private setItemSelected(index: number, selected: boolean): void {
		const item = this.options.items.find((entry) => entry.index === index);
		if (!item || item.status === "error") {
			return;
		}

		if (selected) {
			this.selectedIndices.add(index);
		} else {
			this.selectedIndices.delete(index);
		}
		this.syncListSelectionDom();
		this.updateSelectionUi();
	}

	private syncListSelectionDom(): void {
		if (!this.listEl) {
			return;
		}

		this.listEl.querySelectorAll(".weave-document-quiz-result-row").forEach((rowEl) => {
			const indexValue = rowEl.getAttr(ROW_INDEX_ATTR);
			if (indexValue == null) {
				return;
			}

			const index = Number(indexValue);
			const selected = this.selectedIndices.has(index);
			rowEl.toggleClass("is-selected", selected);

			const checkbox = rowEl.querySelector('input[type="checkbox"]');
			if (checkbox instanceof HTMLInputElement) {
				checkbox.checked = selected;
			}
		});
	}

	private renderItemMeta(container: HTMLElement, item: DocumentQuizItem): void {
		const meta = container.createDiv({ cls: "weave-document-quiz-result-row-meta" });

		if (item.blockId) {
			const blockIdEl = meta.createSpan({ cls: "weave-document-quiz-result-meta-block" });
			blockIdEl.createSpan({
				cls: "weave-document-quiz-result-meta-label",
				text: i18n.t("documentQuiz.result.rowMeta.blockIdLabel"),
			});
			blockIdEl.createEl("code", { text: item.blockId });
		} else {
			meta.createSpan({
				cls: "weave-document-quiz-result-meta-note",
				text: i18n.t("documentQuiz.result.rowMeta.blockIdNew"),
			});
		}

		if (item.historicalAttempts && item.historicalAttempts > 0) {
			const accuracyPercent = Math.round((item.historicalAccuracy ?? 0) * 100);
			meta.createSpan({
				cls: "weave-document-quiz-result-meta-history",
				text: i18n.t("documentQuiz.result.rowMeta.history", {
					attempts: item.historicalAttempts,
					accuracy: accuracyPercent,
				}),
			});
		}

		if (item.parseWarnings.length > 0) {
			meta.createSpan({
				cls: "weave-document-quiz-result-meta-warn",
				text: item.parseWarnings.join(", "),
			});
		}
	}

	private renderBadge(container: HTMLElement, label: string, statusCls?: string): void {
		container.createSpan({
			cls: ["weave-document-quiz-result-badge", statusCls].filter(Boolean).join(" "),
			text: label,
		});
	}

	private updateSelectionUi(): void {
		const selectedCount = this.options.items.filter((item) =>
			this.selectedIndices.has(item.index)
		).length;

		if (this.kpiSelectedEl) {
			const valueEl = this.kpiSelectedEl.querySelector(".weave-document-quiz-result-kpi-value");
			valueEl?.setText(String(selectedCount));
		}

		if (this.confirmBtn) {
			this.confirmBtn.setText(
				i18n.t("documentQuiz.result.confirmWithCount", { count: selectedCount })
			);
			this.confirmBtn.disabled = selectedCount === 0;
		}
	}

	private questionKindLabel(kind: DocumentQuizQuestionKind): string {
		return i18n.t(`documentQuiz.result.types.${kind}`);
	}

	private difficultyLabel(difficulty: DocumentQuizDifficultyLabel): string {
		return i18n.t(`documentQuiz.result.difficulty.${difficulty}`);
	}

	private masteryLabel(mastery: DocumentQuizMasteryLabel): string {
		return i18n.t(`documentQuiz.result.mastery.${mastery}`);
	}
}
