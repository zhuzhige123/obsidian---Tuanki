import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownRenderChild, TFile } from "obsidian";
import { extractBodyContent } from "../../utils/yaml-utils";
import {
	buildDocumentQuizStatsPillDisplay,
	mergeInlineAndStoredStats,
} from "./document-quiz-stats-pill-display";
import { indexDocumentQuizStatsComments } from "./document-quiz-stats-index";
import { extractBlockIdFromHref } from "./document-quiz-stats-comment-locator";
import {
	createDocumentQuizStatsPillElement,
	DOC_QUIZ_STATS_PILL_CLASS,
} from "./document-quiz-stats-pill-dom";
import { buildDocumentQuizStatsKey, DocumentQuizStatsStorage } from "./DocumentQuizStatsStorage";

const BLOCK_ANCHOR_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, table, div";

export function createDocumentQuizStatsPostProcessor(app: App) {
	return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
		ctx.addChild(new DocumentQuizStatsRenderChild(app, el, ctx));
	};
}

class DocumentQuizStatsRenderChild extends MarkdownRenderChild {
	private readonly app: App;
	private readonly storage: DocumentQuizStatsStorage;
	private readonly sourcePath: string;
	private observer: MutationObserver | null = null;
	private scheduled = false;
	private lastAppliedSignature = "";

	constructor(app: App, containerEl: HTMLElement, ctx: MarkdownPostProcessorContext) {
		super(containerEl);
		this.app = app;
		this.storage = new DocumentQuizStatsStorage(app);
		this.sourcePath = String(ctx.sourcePath || "").trim();
	}

	onload(): void {
		if (!this.sourcePath) {
			return;
		}

		this.observer = new MutationObserver(() => this.scheduleApply());
		this.observer.observe(this.containerEl, {
			childList: true,
			subtree: true,
		});

		this.scheduleApply();
	}

	onunload(): void {
		this.observer?.disconnect();
		this.observer = null;
		this.scheduled = false;
	}

	private scheduleApply(): void {
		if (this.scheduled) {
			return;
		}
		this.scheduled = true;
		window.requestAnimationFrame(() => {
			this.scheduled = false;
			void this.tryApplyOnce();
		});
	}

	private async tryApplyOnce(): Promise<void> {
		if (!this.containerEl?.isConnected) {
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
		if (!(file instanceof TFile) || file.extension !== "md") {
			return;
		}

		const stat = await this.app.vault.adapter.stat(this.sourcePath).catch(() => null);
		const blockRefCount = this.containerEl.querySelectorAll('a.internal-link[href*="^"]').length;
		const signature = `${stat?.mtime ?? 0}:${blockRefCount}`;
		if (
			signature === this.lastAppliedSignature &&
			this.containerEl.querySelector(`.${DOC_QUIZ_STATS_PILL_CLASS}`)
		) {
			return;
		}

		const fullContent = await this.app.vault.cachedRead(file);
		const bodyContent = extractBodyContent(fullContent);
		const inlineByBlockId = indexDocumentQuizStatsComments(bodyContent);
		if (inlineByBlockId.size === 0) {
			this.removeInjectedPills();
			this.lastAppliedSignature = signature;
			return;
		}

		const storedAll = await this.storage.loadAll();
		const displays = new Map<string, ReturnType<typeof buildDocumentQuizStatsPillDisplay>>();

		for (const [blockId, inline] of inlineByBlockId.entries()) {
			const stored = storedAll[buildDocumentQuizStatsKey(this.sourcePath, blockId)];
			const merged = mergeInlineAndStoredStats(inline, stored);
			if (!merged || merged.attempts <= 0) {
				continue;
			}
			displays.set(
				blockId,
				buildDocumentQuizStatsPillDisplay({
					blockId,
					stats: { ...merged, blockId },
				})
			);
		}

		this.removeInjectedPills();

		for (const anchor of findBlockRefAnchors(this.containerEl)) {
			const display = displays.get(anchor.blockId);
			if (!display) {
				continue;
			}
			const pill = createDocumentQuizStatsPillElement(display);
			anchor.anchorEl.insertAdjacentElement("afterend", pill);
		}

		this.lastAppliedSignature = signature;
	}

	private removeInjectedPills(): void {
		this.containerEl.querySelectorAll(`.${DOC_QUIZ_STATS_PILL_CLASS}`).forEach((node) => node.remove());
	}
}

interface BlockRefAnchor {
	blockId: string;
	anchorEl: HTMLElement;
}

function findBlockRefAnchors(containerEl: HTMLElement): BlockRefAnchor[] {
	const anchors: BlockRefAnchor[] = [];
	const seen = new Set<string>();

	for (const link of containerEl.querySelectorAll('a.internal-link[href*="^"]')) {
		const href = link.getAttribute("href") || link.getAttribute("data-href") || "";
		const blockId = extractBlockIdFromHref(href);
		if (!blockId || seen.has(blockId)) {
			continue;
		}

		const anchorEl = link.closest(BLOCK_ANCHOR_SELECTOR);
		if (!(anchorEl instanceof HTMLElement) || !containerEl.contains(anchorEl)) {
			continue;
		}

		seen.add(blockId);
		anchors.push({ blockId, anchorEl });
	}

	return anchors;
}
