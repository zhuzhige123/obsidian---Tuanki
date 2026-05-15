import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import { CardType, type Card } from "../../data/types";
import type { ResolvedDeckRef } from "../../types/emergent-deck-types";
import type WeavePlugin from "../../main";
import { configureWeaveObsidianModalLayout } from "../../utils/obsidian-modal-layout";
import IRCardDetailModal from "./IRCardDetailModal.svelte";
import QuestionBankCardDetailModal from "./QuestionBankCardDetailModal.svelte";
import ViewCardModal from "./ViewCardModal.svelte";

export type ViewCardModalSource = "memory" | "questionBank" | "incremental-reading";

export interface ViewCardModalObsidianOptions {
	plugin: WeavePlugin;
	card: Card;
	allDecks?: Array<{ id: string; name: string }>;
	resolvedDeckRefs?: ResolvedDeckRef[];
	source?: ViewCardModalSource;
	onClose?: () => void;
}

function isIncrementalReadingCard(card: Card): boolean {
	const cardLike = card as Card & Record<string, unknown>;
	return (
		card.type === CardType.IRBlock ||
		card.type === CardType.IRChunk ||
		card.templateId === CardType.IRBlock ||
		card.templateId === CardType.IRChunk ||
		typeof cardLike.ir_source_kind === "string" ||
		typeof cardLike.ir_source_document_key === "string" ||
		typeof cardLike.ir_source_file === "string" ||
		Boolean(card.metadata?.irBlock) ||
		Boolean(card.metadata?.irChunk) ||
		Boolean(card.metadata?.irPdfBookmark) ||
		Boolean(card.metadata?.irEpubBookmark)
	);
}

function resolveModalVariant(
	card: Card,
	source?: ViewCardModalSource
): "memory" | "questionBank" | "incremental-reading" {
	if (source === "incremental-reading" || isIncrementalReadingCard(card)) {
		return "incremental-reading";
	}

	if (source === "questionBank" || card.cardPurpose === "test") {
		return "questionBank";
	}

	return "memory";
}

export class ViewCardModalObsidian extends Modal {
	private component: any = null;
	private readonly options: ViewCardModalObsidianOptions;

	constructor(app: App, options: ViewCardModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		const modalVariant = resolveModalVariant(this.options.card, this.options.source);
		const ModalComponent =
			modalVariant === "questionBank"
				? QuestionBankCardDetailModal
				: modalVariant === "incremental-reading"
					? IRCardDetailModal
					: ViewCardModal;

		this.setTitle(
			modalVariant === "questionBank"
				? "测试卡片详情"
				: modalVariant === "incremental-reading"
					? "增量阅读详情"
					: "卡片详情"
		);
		configureWeaveObsidianModalLayout(this, {
			modalClass: "weave-view-card-modal",
			contentClass: "weave-view-card-modal-content",
		});

		const props = {
			card: this.options.card,
			plugin: this.options.plugin,
			allDecks: this.options.allDecks,
			...(modalVariant === "memory"
				? { resolvedDeckRefs: this.options.resolvedDeckRefs }
				: {}),
		};

		this.component = mount(ModalComponent, {
			target: this.contentEl,
			props,
		});
	}

	onClose() {
		if (this.component) {
			void unmount(this.component);
			this.component = null;
		}

		this.contentEl.empty();
		this.options.onClose?.();
	}
}
