import { App, Modal } from "obsidian";
import { configureWeaveObsidianModalLayout } from "./obsidian-modal-layout";

export interface ObsidianDeckEditModalOptions {
	app: App;
	title: string;
	nameLabel: string;
	namePlaceholder?: string;
	tagLabel: string;
	tagPlaceholder: string;
	tagHint?: string;
	confirmText: string;
	cancelText?: string;
	initialName: string;
	initialTag?: string;
	availableTags?: string[];
	onSubmit: (draft: { name: string; tag: string }) => Promise<void> | void;
}

function normalizeTags(tags: string[] | undefined): string[] {
	return Array.from(
		new Set(
			(tags || [])
				.map((tag) => String(tag || "").trim())
				.filter(Boolean)
		)
	).sort((left, right) => left.localeCompare(right, "zh-CN"));
}

export function openObsidianDeckEditModal(options: ObsidianDeckEditModalOptions): Modal {
	const modal = new Modal(options.app);
	modal.titleEl.setText(options.title);
	configureWeaveObsidianModalLayout(modal, {
		modalClass: "weave-deck-edit-native-modal",
		contentClass: "weave-deck-edit-native-modal-content",
	});

	const availableTags = normalizeTags(options.availableTags);
	let draftName = String(options.initialName || "");
	let selectedTag = String(options.initialTag || "").trim();
	let isSaving = false;

	const formEl = modal.contentEl.createDiv({ cls: "weave-deck-edit-form" });

	const nameFieldEl = formEl.createDiv({ cls: "weave-deck-edit-field" });
	nameFieldEl.createDiv({ cls: "weave-deck-edit-field-label", text: options.nameLabel });
	const nameInputEl = nameFieldEl.createEl("input", {
		type: "text",
		cls: "weave-deck-edit-input",
		attr: { placeholder: options.namePlaceholder || "" },
	}) as HTMLInputElement;
	nameInputEl.value = draftName;

	const tagFieldEl = formEl.createDiv({ cls: "weave-deck-edit-field" });
	tagFieldEl.createDiv({ cls: "weave-deck-edit-field-label", text: options.tagLabel });
	const tagInputWrapperEl = tagFieldEl.createDiv({ cls: "weave-deck-edit-tag-input-wrapper" });
	const selectedTagsEl = tagInputWrapperEl.createDiv({ cls: "weave-deck-edit-selected-tags" });
	const tagInputEl = tagInputWrapperEl.createEl("input", {
		type: "text",
		cls: "weave-deck-edit-tag-input",
		attr: { placeholder: options.tagPlaceholder },
	}) as HTMLInputElement;

	let availableTagsListEl: HTMLDivElement | null = null;
	if (availableTags.length > 0) {
		const availableTagsSectionEl = tagFieldEl.createDiv({ cls: "weave-deck-edit-available-tags" });
		availableTagsSectionEl.createDiv({
			cls: "weave-deck-edit-available-tags-title",
			text: "可选标签",
		});
		availableTagsListEl = availableTagsSectionEl.createDiv({
			cls: "weave-deck-edit-available-tags-list",
		});
	}

	if (options.tagHint) {
		tagFieldEl.createDiv({ cls: "weave-deck-edit-hint", text: options.tagHint });
	}

	const footerEl = modal.contentEl.createDiv({ cls: "weave-deck-edit-footer" });
	const cancelButtonEl = footerEl.createEl("button", {
		text: options.cancelText || "取消",
		cls: "weave-deck-edit-btn",
	}) as HTMLButtonElement;
	cancelButtonEl.type = "button";
	const confirmButtonEl = footerEl.createEl("button", {
		text: options.confirmText,
		cls: "weave-deck-edit-btn weave-deck-edit-btn-primary",
	}) as HTMLButtonElement;
	confirmButtonEl.type = "button";

	function updateTagInputPlaceholder(): void {
		tagInputEl.placeholder = selectedTag ? "" : options.tagPlaceholder;
	}

	function renderSelectedTag(): void {
		selectedTagsEl.empty();
		if (!selectedTag) {
			updateTagInputPlaceholder();
			return;
		}

		const tagChipEl = selectedTagsEl.createSpan({ cls: "weave-deck-edit-tag-chip" });
		tagChipEl.createSpan({ text: selectedTag });
		const removeButtonEl = tagChipEl.createEl("button", {
			text: "×",
			cls: "weave-deck-edit-tag-chip-remove",
		}) as HTMLButtonElement;
		removeButtonEl.type = "button";
		removeButtonEl.ariaLabel = "移除标签";
		removeButtonEl.addEventListener("click", () => {
			selectedTag = "";
			renderSelectedTag();
			renderAvailableTags();
		});
		updateTagInputPlaceholder();
	}

	function renderAvailableTags(): void {
		if (!availableTagsListEl) {
			return;
		}

		availableTagsListEl.empty();
		for (const tag of availableTags) {
			const buttonClassName =
				selectedTag === tag
					? "weave-deck-edit-available-tag-item selected"
					: "weave-deck-edit-available-tag-item";
			const tagButtonEl = availableTagsListEl.createEl("button", {
				text: tag,
				cls: buttonClassName,
			}) as HTMLButtonElement;
			tagButtonEl.type = "button";
			tagButtonEl.addEventListener("click", () => {
				selectedTag = selectedTag === tag ? "" : tag;
				renderSelectedTag();
				renderAvailableTags();
			});
		}
	}

	function updateConfirmButtonState(): void {
		confirmButtonEl.disabled = isSaving || !draftName.trim();
	}

	async function handleSubmit(): Promise<void> {
		if (isSaving || !draftName.trim()) {
			return;
		}
		isSaving = true;
		updateConfirmButtonState();
		try {
			await options.onSubmit({
				name: draftName.trim(),
				tag: selectedTag.trim(),
			});
			modal.close();
		} finally {
			isSaving = false;
			updateConfirmButtonState();
		}
	}

	nameInputEl.addEventListener("input", () => {
		draftName = nameInputEl.value;
		updateConfirmButtonState();
	});
	nameInputEl.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault();
			void handleSubmit();
		}
	});

	tagInputEl.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key === "Enter" && tagInputEl.value.trim()) {
			event.preventDefault();
			selectedTag = tagInputEl.value.trim();
			tagInputEl.value = "";
			renderSelectedTag();
			renderAvailableTags();
		}
	});

	cancelButtonEl.addEventListener("click", () => {
		modal.close();
	});
	confirmButtonEl.addEventListener("click", () => {
		void handleSubmit();
	});

	renderSelectedTag();
	renderAvailableTags();
	updateConfirmButtonState();

	modal.open();
	window.setTimeout(() => {
		nameInputEl.focus();
		nameInputEl.setSelectionRange(draftName.length, draftName.length);
	}, 0);
	return modal;
}
