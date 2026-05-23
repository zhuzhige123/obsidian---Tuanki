import { Menu, Notice } from "obsidian";
import type WeavePlugin from "../../main";
import type { Card } from "../../data/types";
import type { QuestionBankModeConfig, TestMode } from "../../types/question-bank-types";
import { resolveQuestionBankSessionEntryAction } from "../question-bank-resume";

export interface CelebrationExamBankSelection {
	bankId: string;
	bankName: string;
	questions: Card[];
}

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * 在学习完成庆祝窗等场景下，用 Obsidian 列表菜单展示全部考试题组供用户选择。
 */
export async function showCelebrationQuestionBankPicker(
	plugin: WeavePlugin,
	position: { x: number; y: number },
	translate: TranslateFn,
): Promise<CelebrationExamBankSelection | "resumed" | null> {
	if (!plugin.questionBankService) {
		new Notice(translate("deckStudyPage.exam.qbNotEnabled"));
		return null;
	}

	const banks = (await plugin.questionBankService.getAllBanks())
		.filter((bank) => bank.deckType === "question-bank")
		.sort((left, right) => {
			const orderDiff = (left.order || 0) - (right.order || 0);
			if (orderDiff !== 0) return orderDiff;
			return (left.name || "").localeCompare(right.name || "", "zh-Hans-CN");
		});

	if (banks.length === 0) {
		new Notice(translate("deckStudyPage.exam.noBanksAvailable"));
		return null;
	}

	return new Promise((resolve) => {
		const menu = new Menu();
		for (const bank of banks) {
			menu.addItem((item) => {
				item
					.setTitle(bank.name || translate("deckStudyPage.fallback.unknownBank"))
					.setIcon("gallery-vertical")
					.onClick(async () => {
						try {
							const questions = await plugin.questionBankService!.getQuestionsByBank(bank.id);
							const bankName = bank.name || translate("deckStudyPage.fallback.unknownBank");

							if (questions.length === 0) {
								new Notice(translate("study.questionBankUI.bankCollection.noQuestions"));
								resolve(null);
								return;
							}

							const entryAction = await resolveQuestionBankSessionEntryAction(
								plugin,
								bank.id,
								bankName,
							);
							if (entryAction === "cancel") {
								resolve(null);
								return;
							}
							if (entryAction === "resume") {
								await plugin.openQuestionBankSession({
									bankId: bank.id,
									bankName,
									resumeBehavior: "resume",
								});
								resolve("resumed");
								return;
							}

							resolve({
								bankId: bank.id,
								bankName,
								questions,
							});
						} catch (error) {
							console.error("[celebration-exam-flow] Failed to prepare bank:", error);
							new Notice(translate("deckStudyPage.exam.startFailed"));
							resolve(null);
						}
					});
			});
		}
		menu.showAtPosition(position);
	});
}

export async function openQuestionBankSessionWithModeConfig(
	plugin: WeavePlugin,
	bankId: string,
	bankName: string,
	questions: Card[],
	mode: TestMode = "exam",
	config?: QuestionBankModeConfig,
): Promise<void> {
	if (questions.length === 0) {
		return;
	}

	if (config && plugin.questionBankService) {
		try {
			await plugin.questionBankService.updateBankConfig(bankId, config);
		} catch (error) {
			console.error("[celebration-exam-flow] Failed to save bank config:", error);
		}
	}

	await plugin.openQuestionBankSession({
		bankId,
		bankName,
		mode,
		config,
	});
}
