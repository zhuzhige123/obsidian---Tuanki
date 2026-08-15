import { Notice, MarkdownView, type TFile } from "obsidian";
import type { WeavePlugin } from "../../main";
import type { DocumentQuizItem } from "../../types/document-quiz-types";
import type { QuestionBankModeConfig, TestMode } from "../../types/question-bank-types";
import { DocumentQuizPreviewModal } from "../../modals/document-quiz/DocumentQuizPreviewModal";
import { parseDocumentQuizContent } from "./DocumentQuizParser";
import {
	buildDocumentQuizParseSummary,
	mergeStoredStatsIntoItems,
} from "./document-quiz-parse-summary";
import { DocumentQuizStatsStorage } from "./DocumentQuizStatsStorage";
import {
	buildDocumentQuizCards,
	getDocumentQuizSessionService,
} from "./DocumentQuizSessionService";
import { openDocumentQuizView } from "../../views/DocumentQuizView";
import { i18n } from "../../utils/i18n";
import { logger } from "../../utils/logger";
import { generateId } from "../../utils/helpers";

async function mountModePicker(
	plugin: WeavePlugin,
	bankName: string,
	totalQuestions: number
): Promise<{ mode: TestMode; config?: QuestionBankModeConfig } | null> {
	return new Promise((resolve) => {
		const host = createDiv();
		host.addClass("weave-document-quiz-mode-picker-host");
		activeDocument.body.appendChild(host);

		let unmountFn: ((component: unknown) => void) | null = null;

		let mounted: unknown = null;

		const cleanup = () => {
			if (mounted && unmountFn) {
				void Promise.resolve(unmountFn(mounted));
			}
			host.remove();
		};

		void (async () => {
			try {
				const [{ mount, unmount }, { default: DocumentQuizModePickerHost }] =
					await Promise.all([
						import("svelte"),
						import("../../components/document-quiz/DocumentQuizModePickerHost.svelte"),
					]);
				unmountFn = (component: unknown) => {
					void unmount(component as Parameters<typeof unmount>[0]);
				};
				mounted = mount(DocumentQuizModePickerHost, {
					target: host,
					props: {
						plugin,
						bankName,
						totalQuestions,
						onSelect: (mode: TestMode, config?: QuestionBankModeConfig) => {
							cleanup();
							resolve({ mode, config });
						},
						onCancel: () => {
							cleanup();
							resolve(null);
						},
					},
				});
			} catch (error) {
				logger.error("[DocumentQuizFlow] 模式选择挂载失败:", error);
				cleanup();
				resolve(null);
			}
		})();
	});
}

async function startDocumentQuizSession(
	plugin: WeavePlugin,
	file: TFile,
	selectedItems: DocumentQuizItem[],
	mode: TestMode,
	config?: QuestionBankModeConfig
): Promise<void> {
	const sessionService = getDocumentQuizSessionService();
	const statsStorage = new DocumentQuizStatsStorage(plugin.app);
	const sessionId = generateId();

	const cards = await buildDocumentQuizCards({
		sessionId,
		filePath: file.path,
		items: selectedItems,
		statsStorage,
	});

	sessionService.createSession(
		{
			filePath: file.path,
			fileName: file.basename,
			items: selectedItems,
			cards,
			mode,
			config,
		},
		sessionId
	);

	await openDocumentQuizView(plugin, sessionId);
}

export async function runDocumentQuizFlow(
	plugin: WeavePlugin,
	options?: { selectionText?: string }
): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const file = view?.file;
	if (!file) {
		new Notice(i18n.t("documentQuiz.noActiveFile"));
		return;
	}

	let content: string;
	try {
		content = await plugin.app.vault.read(file);
	} catch (error) {
		logger.error("[DocumentQuizFlow] 读取文件失败:", error);
		new Notice(i18n.t("documentQuiz.readFailed"));
		return;
	}

	const parsed = parseDocumentQuizContent(file.path, content, {
		selectionText: options?.selectionText,
	});

	const statsStorage = new DocumentQuizStatsStorage(plugin.app);
	const storedStats = await statsStorage.loadAll();
	const rawBlocksByIndex = new Map(
		parsed.items.map((item, index) => [item.index, parsed.rawBlocks[index] ?? item.content])
	);
	const enrichedItems = mergeStoredStatsIntoItems(
		parsed.items,
		file.path,
		storedStats,
		rawBlocksByIndex
	);
	const summary = buildDocumentQuizParseSummary(enrichedItems);

	const eligible = enrichedItems.filter((item) => item.status !== "error");
	if (eligible.length === 0) {
		new Notice(i18n.t("documentQuiz.noQuestions"));
		return;
	}

	await new Promise<void>((resolve) => {
		const modal = new DocumentQuizPreviewModal(plugin.app, {
			items: enrichedItems,
			summary,
			onConfirm: (selected) => {
				void (async () => {
					const picked = selected.filter((item) => item.status !== "error");
					if (picked.length === 0) {
						new Notice(i18n.t("documentQuiz.noQuestions"));
						resolve();
						return;
					}

					const modeResult = await mountModePicker(
						plugin,
						file.basename,
						picked.length
					);
					if (!modeResult) {
						resolve();
						return;
					}

					await startDocumentQuizSession(
						plugin,
						file,
						picked,
						modeResult.mode,
						modeResult.config
					);
					resolve();
				})();
			},
			onCancel: () => resolve(),
		});
		modal.open();
	});
}
