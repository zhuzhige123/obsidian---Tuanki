import { Notice } from "obsidian";
import type { WeavePlugin } from "../../main";
import { readUnknownProperty } from "../../utils/dynamic-access";
import { logger } from "../../utils/logger";

/**
 * 题库完整性审计
 *
 * 这里只做“发现并提示”，不自动改写用户题库关系，
 * 避免把引用式题库错误绑定到别的记忆牌组。
 */
export class QuestionBankIntegrityService {
	constructor(private plugin: WeavePlugin) {}

	async auditMissingPairedMemoryDeckId(): Promise<{ audited: number; failed: number }> {
		const result = { audited: 0, failed: 0 };

		try {
			if (!this.plugin.questionBankService || !this.plugin.dataStorage) {
				logger.debug("[QuestionBankIntegrity] 服务未就绪，跳过 pairedMemoryDeckId 审计");
				return result;
			}

			const allBanks = await this.plugin.questionBankService.getAllBanks();
			const banksNeedingAudit = allBanks.filter((bank) => {
				const pairedId = readUnknownProperty(bank.metadata, "pairedMemoryDeckId");
				return typeof pairedId !== "string" || pairedId.trim().length === 0;
			});

			if (banksNeedingAudit.length === 0) {
				logger.debug("[QuestionBankIntegrity] 所有考试牌组都已设置 pairedMemoryDeckId");
				return result;
			}

			logger.info(
				`[QuestionBankIntegrity] 发现 ${banksNeedingAudit.length} 个考试牌组缺少 pairedMemoryDeckId，保留原始数据，不做自动配对`
			);

			for (const bank of banksNeedingAudit) {
				try {
					logger.info(
						`[QuestionBankIntegrity] 保留未配对考试牌组 "${bank.name}" 的原始状态；请在需要时从题库入口直接使用，或通过后续显式操作建立关联`
					);
					result.audited++;
				} catch (error) {
					logger.error(`[QuestionBankIntegrity] 审计考试牌组 "${bank.name}" 失败:`, error);
					result.failed++;
				}
			}

			new Notice(`发现 ${banksNeedingAudit.length} 个未配对考试牌组，已保留原始数据，未自动改写`);
			logger.info(
				`[QuestionBankIntegrity] pairedMemoryDeckId 审计完成: 保留 ${result.audited} 个未配对题库, 失败 ${result.failed} 个`
			);
		} catch (error) {
			logger.error("[QuestionBankIntegrity] pairedMemoryDeckId 审计失败:", error);
		}

		return result;
	}

	static async auditAfterInit(plugin: WeavePlugin): Promise<void> {
		const service = new QuestionBankIntegrityService(plugin);
		await service.auditMissingPairedMemoryDeckId();
	}
}
