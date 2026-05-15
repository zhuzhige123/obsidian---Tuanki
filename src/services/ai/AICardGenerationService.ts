import { Notice } from "obsidian";
import type { WeavePlugin } from "../../main";
import type {
	AICardIssue,
	AICardPreviewItem,
	GeneratedCard,
	GeneratedCardDraft,
	GeneratedChoiceOptionDraft,
	GenerationConfig,
	GenerationProgress,
	PromptTemplate,
} from "../../types/ai-types";
import { validateContentLength } from "../../utils/file-utils";
import { hasAnyClozeSyntax } from "../../utils/cloze-syntax";
import { logger } from "../../utils/logger";
import {
	buildVariablesFromConfig,
	replaceTemplateVariables,
} from "../../utils/prompt-template-utils";
import { AIServiceFactory } from "./AIServiceFactory";
import { getModelCapabilities } from "./modelCapabilities";
import { parseJsonFromAIText } from "./responseParsing";

const DEDUP_PREFIX_LENGTH = 60;
const MAIN_SEPARATOR = "---div---";
const CHOICE_OPTION_KEYS = ["A", "B", "C", "D"] as const;

export interface AICardGenerationCallbacks {
	onProgress: (progress: GenerationProgress) => void;
	onCardsUpdate: (cards: GeneratedCard[]) => void;
}

export interface AICardPreviewCallbacks {
	onProgress: (progress: GenerationProgress) => void;
	onItemsUpdate: (items: AICardPreviewItem[]) => void;
}

type RawDraftCard = Record<string, unknown>;

interface StructuredDraftRequest {
	systemPrompt: string;
	userPrompt: string;
	config: GenerationConfig;
}

export class AICardGenerationService {
	private plugin: WeavePlugin;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	private isRateLimitErrorMessage(message?: string): boolean {
		if (!message) return false;
		const normalized = message.toLowerCase();
		return (
			normalized.includes("429") ||
			normalized.includes("rate limit") ||
			normalized.includes("too many requests") ||
			normalized.includes("quota") ||
			message.includes("频率") ||
			message.includes("限流")
		);
	}

	private buildRateLimitNotice(provider: string, raw?: string): string {
		const detail = raw ? `\n\n原始信息：${raw}` : "";
		return `AI服务触发限流或配额限制（429）。\n\n建议：\n1) 稍后再试\n2) 减少生成数量\n3) 检查 ${provider} 账户配额或余额\n4) 必要时切换模型或服务商${detail}`;
	}

	private ensureAIConfigured(): void {
		if (!this.plugin.settings.aiConfig) {
			throw new Error("请先在设置中配置 AI 服务");
		}
	}

	private validateSourceContent(content: string): void {
		const validation = validateContentLength(content);
		if (!validation.valid) {
			const message = validation.message || "内容验证失败";
			new Notice(message);
			throw new Error(message);
		}
	}

	private getContentFingerprint(content: string): string {
		return (content || "").replace(/\s+/g, "").toLowerCase().slice(0, DEDUP_PREFIX_LENGTH);
	}

	private deduplicatePreviewItems(items: AICardPreviewItem[]): AICardPreviewItem[] {
		const seen = new Set<string>();
		const deduped: AICardPreviewItem[] = [];

		for (const item of items) {
			const fingerprint = this.getContentFingerprint(item.generatedContent);
			if (!fingerprint || seen.has(fingerprint)) {
				continue;
			}
			seen.add(fingerprint);
			deduped.push(item);
		}

		return deduped;
	}

	private deduplicateCards(newCards: GeneratedCard[], existingCards: GeneratedCard[]): GeneratedCard[] {
		const existingFingerprints = new Set(
			existingCards.map((card) => this.getContentFingerprint(card.content || ""))
		);
		const uniqueCards: GeneratedCard[] = [];

		for (const card of newCards) {
			const fingerprint = this.getContentFingerprint(card.content || "");
			if (!fingerprint || existingFingerprints.has(fingerprint)) {
				continue;
			}
			existingFingerprints.add(fingerprint);
			uniqueCards.push(card);
		}

		return uniqueCards;
	}

	private resolvePromptText(selectedPrompt: PromptTemplate | null, customPrompt: string): string {
		return selectedPrompt?.prompt || customPrompt || "请根据以下内容生成学习卡片";
	}

	private buildResolvedPrompt(
		selectedPrompt: PromptTemplate | null,
		customPrompt: string,
		config: GenerationConfig
	): string {
		return replaceTemplateVariables(
			this.resolvePromptText(selectedPrompt, customPrompt),
			buildVariablesFromConfig(config)
		);
	}

	private buildDraftSystemPrompt(config: GenerationConfig): string {
		const promptPriorityLines = config.prioritizePromptRequirements
			? [
					`优先遵循用户提示词中明确写出的数量、题型和难度要求，但最终总数不得超过 ${
						config.maxGenerationLimit ?? config.cardCount
					} 张。`,
					"如果用户提示词没有明确要求，再回退到默认生成参数。",
			  ]
			: [];
		return [
			"你是 Weave 插件中的 AI 制卡助手。",
			"你的任务是根据用户提供的学习材料，输出结构化卡片草稿。",
			"只允许输出 JSON，不要输出解释、前言、Markdown 代码块。",
			'外层格式必须是 {"cards":[...]}。',
			...promptPriorityLines,
			`严格生成 ${config.cardCount} 张卡片。`,
			`难度要求：${config.difficulty}。`,
			`题型分布目标：问答 ${config.typeDistribution.qa}% / 挖空 ${config.typeDistribution.cloze}% / 选择 ${config.typeDistribution.choice}%。`,
			"不要生成图片，不要返回 images 字段。",
			"问答题使用 front/back。",
			"挖空题使用 text/back，text 中必须使用 ==挖空== 语法或 {{c1::...}} 语法。",
			"选择题使用 question/options/answers/back。",
			"每道选择题必须有 4 个选项，options 的 key 依次为 A/B/C/D。",
			'answers 必须使用选项 key 数组，例如 ["B"] 或 ["A","C"]。',
			"tags 字段可选，若没有可返回空数组或省略。",
			"三种卡片格式示例：",
			'问答题：{"type":"qa","front":"问题","back":"答案","tags":["标签"]}',
			'挖空题：{"type":"cloze","text":"包含 ==挖空== 的句子","back":"解析","tags":["标签"]}',
			'选择题：{"type":"choice","question":"题干","options":[{"key":"A","text":"选项A"},{"key":"B","text":"选项B"},{"key":"C","text":"选项C"},{"key":"D","text":"选项D"}],"answers":["B"],"back":"解析","tags":["标签"]}',
		].join("\n");
	}

	private buildDraftUserPrompt(content: string, resolvedPrompt: string): string {
		return `${resolvedPrompt}\n\n请基于以下材料生成结构化卡片草稿：\n${content}`;
	}

	private buildRegenerateUserPrompt(item: AICardPreviewItem, instruction: string): string {
		return [
			`请只生成 1 张 ${item.draft.type} 类型卡片，并严格返回 {"cards":[...]}。`,
			"当前卡片草稿：",
			JSON.stringify(item.draft, null, 2),
			"",
			"当前卡片内容：",
			item.generatedContent,
			"",
			"用户修改要求：",
			instruction,
		].join("\n");
	}

	private buildDraftSerializerPrompt(config: GenerationConfig): string {
		return [
			"你是专门负责结构化序列化的卡片整理器。",
			"你会收到一段候选卡片草稿文本，其中可能混有思考过程、解释或格式不规范内容。",
			"你的唯一任务是把其中可用的卡片整理成严格 JSON。",
			"只返回 JSON，不要解释，不要代码块。",
			'外层必须是 {"cards":[...]}。',
			`最多返回 ${config.cardCount} 张卡片。`,
			'问答题格式：{"type":"qa","front":"...","back":"...","tags":[...]}',
			'挖空题格式：{"type":"cloze","text":"...","back":"...","tags":[...]}',
			'选择题格式：{"type":"choice","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"answers":["A"],"back":"...","tags":[...]}',
			"如果原草稿缺少必要字段，可做最小必要修正，但不要凭空扩写无关内容。",
		].join("\n");
	}

	private async executeStructuredDraftRequest(request: StructuredDraftRequest): Promise<string> {
		const capabilities = getModelCapabilities(request.config.provider, request.config.model);
		const primaryService = AIServiceFactory.createService(
			request.config.provider,
			this.plugin,
			request.config.model
		);
		const primaryResponse = await primaryService.chat({
			messages: [
				{ role: "system", content: request.systemPrompt },
				{ role: "user", content: request.userPrompt },
			],
			temperature: request.config.temperature,
			maxTokens: request.config.maxTokens,
			responseFormat:
				capabilities.structuredOutputMode === "native_json" ? "json_object" : undefined,
		});

		if (primaryResponse.success && primaryResponse.content) {
			try {
				this.parseDraftResponse(primaryResponse.content);
				return primaryResponse.content;
			} catch (parseError) {
				logger.warn("[AICardGenerationService] Failed to parse primary structured response", {
					provider: request.config.provider,
					model: request.config.model,
					error: parseError instanceof Error ? parseError.message : String(parseError),
				});

				if (!capabilities.structuredFallbackModel) {
					throw parseError;
				}

				const serializerService = AIServiceFactory.createService(
					request.config.provider,
					this.plugin,
					capabilities.structuredFallbackModel
				);
				const serializerResponse = await serializerService.chat({
					messages: [
						{ role: "system", content: this.buildDraftSerializerPrompt(request.config) },
						{ role: "user", content: primaryResponse.content },
					],
					temperature: 0.1,
					maxTokens: request.config.maxTokens,
					responseFormat: "json_object",
				});

				if (!serializerResponse.success || !serializerResponse.content) {
					throw new Error(serializerResponse.error || "AI 结构化整理失败");
				}

				this.parseDraftResponse(serializerResponse.content);
				return serializerResponse.content;
			}
		}

		if (!capabilities.structuredFallbackModel) {
			if (this.isRateLimitErrorMessage(primaryResponse.error)) {
				throw new Error(this.buildRateLimitNotice(request.config.provider, primaryResponse.error));
			}
			throw new Error(primaryResponse.error || "AI 生成失败");
		}

		logger.warn("[AICardGenerationService] Falling back to alternate model", {
			provider: request.config.provider,
			model: request.config.model,
			fallbackModel: capabilities.structuredFallbackModel,
			error: primaryResponse.error,
		});

		const fallbackService = AIServiceFactory.createService(
			request.config.provider,
			this.plugin,
			capabilities.structuredFallbackModel
		);
		const fallbackResponse = await fallbackService.chat({
			messages: [
				{ role: "system", content: request.systemPrompt },
				{ role: "user", content: request.userPrompt },
			],
			temperature: 0.1,
			maxTokens: request.config.maxTokens,
			responseFormat: "json_object",
		});

		if (!fallbackResponse.success || !fallbackResponse.content) {
			if (this.isRateLimitErrorMessage(fallbackResponse.error || primaryResponse.error)) {
				throw new Error(
					this.buildRateLimitNotice(
						request.config.provider,
						fallbackResponse.error || primaryResponse.error
					)
				);
			}
			throw new Error(fallbackResponse.error || primaryResponse.error || "AI 生成失败");
		}

		this.parseDraftResponse(fallbackResponse.content);
		return fallbackResponse.content;
	}

	private parseDraftResponse(responseText: string): RawDraftCard[] {
		for (const candidate of parseJsonFromAIText(responseText || "")) {
			const cards = this.extractDraftArray(candidate);
			if (cards) {
				return cards;
			}
		}

		throw new Error("本次生成结果无法解析为卡片 JSON");
	}

	private extractDraftArray(parsed: unknown): RawDraftCard[] | null {
		if (Array.isArray(parsed)) {
			return parsed.filter((item) => item && typeof item === "object") as RawDraftCard[];
		}

		if (parsed && typeof parsed === "object" && Array.isArray((parsed as { cards?: unknown }).cards)) {
			return (parsed as { cards: RawDraftCard[] }).cards.filter(
				(item) => item && typeof item === "object"
			);
		}

		return null;
	}

	private normalizeString(value: unknown): string {
		if (typeof value === "string") {
			return value.trim();
		}
		if (value === null || value === undefined) {
			return "";
		}
		return String(value).trim();
	}

	private normalizeTags(value: unknown): string[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map((item) => this.normalizeString(item))
			.filter(Boolean);
	}

	private containsCloze(text: string): boolean {
		return hasAnyClozeSyntax(text);
	}

	private splitContent(content: string): { front: string; back: string } {
		const normalized = this.normalizeString(content);
		if (!normalized) {
			return { front: "", back: "" };
		}

		const standardSeparator = `\n\n${MAIN_SEPARATOR}\n\n`;
		if (normalized.includes(standardSeparator)) {
			const [front, ...rest] = normalized.split(standardSeparator);
			return { front: front.trim(), back: rest.join(standardSeparator).trim() };
		}

		const looseSeparator = `\n${MAIN_SEPARATOR}\n`;
		if (normalized.includes(looseSeparator)) {
			const [front, ...rest] = normalized.split(looseSeparator);
			return { front: front.trim(), back: rest.join(looseSeparator).trim() };
		}

		return { front: normalized, back: "" };
	}

	private inferDraftType(raw: RawDraftCard): "qa" | "cloze" | "choice" {
		const explicitType = this.normalizeString(raw.type).toLowerCase();
		if (explicitType === "qa" || explicitType === "cloze" || explicitType === "choice") {
			return explicitType;
		}
		if (Array.isArray(raw.options) || raw.question !== undefined || raw.answers !== undefined) {
			return "choice";
		}
		if (raw.text !== undefined) {
			return "cloze";
		}
		return "qa";
	}

	private normalizeChoiceOptions(value: unknown): {
		options: GeneratedChoiceOptionDraft[];
		issues: AICardIssue[];
	} {
		const issues: AICardIssue[] = [];

		if (!Array.isArray(value)) {
			return {
				options: [],
				issues: [{ code: "missing-options", message: "选择题缺少选项", severity: "error" }],
			};
		}

		const normalizedOptions = value
			.map((option, index) => {
				if (option && typeof option === "object") {
					const record = option as Record<string, unknown>;
					return {
						key: this.normalizeString(record.key) || CHOICE_OPTION_KEYS[index] || "",
						text:
							this.normalizeString(record.text) ||
							this.normalizeString(record.content) ||
							this.normalizeString(record.label),
					};
				}

				return {
					key: CHOICE_OPTION_KEYS[index] || "",
					text: this.normalizeString(option),
				};
			})
			.filter((option) => option.key && option.text);

		if (normalizedOptions.length > 4) {
			issues.push({
				code: "invalid-option-count",
				message: "选择题选项超过 4 个，已自动截断为前 4 个",
				severity: "warning",
			});
		}

		const options = normalizedOptions.slice(0, 4).map((option, index) => ({
			key: CHOICE_OPTION_KEYS[index],
			text: option.text,
		}));

		if (options.length === 0) {
			issues.push({ code: "missing-options", message: "选择题缺少选项", severity: "error" });
		} else if (options.length < 4) {
			issues.push({
				code: "invalid-option-count",
				message: "选择题必须包含 4 个选项",
				severity: "error",
			});
		}

		return { options, issues };
	}

	private normalizeChoiceAnswers(
		value: unknown,
		options: GeneratedChoiceOptionDraft[]
	): { answers: string[]; issues: AICardIssue[] } {
		const issues: AICardIssue[] = [];
		const optionKeys = new Set(options.map((option) => option.key));

		const rawValues = Array.isArray(value)
			? value
			: value === undefined || value === null || value === ""
				? []
				: [value];

		const answers = rawValues
			.map((answer) => {
				if (typeof answer === "number") {
					return CHOICE_OPTION_KEYS[answer] || CHOICE_OPTION_KEYS[answer - 1] || "";
				}

				const normalized = this.normalizeString(answer).toUpperCase();
				if (/^[A-D]$/.test(normalized)) {
					return normalized;
				}
				if (/^\d+$/.test(normalized)) {
					const index = Number(normalized);
					return CHOICE_OPTION_KEYS[index] || CHOICE_OPTION_KEYS[index - 1] || "";
				}
				return "";
			})
			.filter(Boolean);

		const dedupedAnswers = [...new Set(answers)];

		if (dedupedAnswers.length === 0) {
			issues.push({ code: "missing-answer", message: "选择题缺少答案", severity: "error" });
		}

		const invalidAnswers = dedupedAnswers.filter((answer) => !optionKeys.has(answer));
		if (invalidAnswers.length > 0) {
			issues.push({
				code: "invalid-answer",
				message: `选择题答案无效：${invalidAnswers.join(", ")}`,
				severity: "error",
			});
		}

		return {
			answers: dedupedAnswers.filter((answer) => optionKeys.has(answer)),
			issues,
		};
	}

	private buildContentFromDraft(draft: GeneratedCardDraft): string {
		switch (draft.type) {
			case "qa":
				return `${draft.front}\n\n${MAIN_SEPARATOR}\n\n${draft.back}`.trim();
			case "cloze":
				return draft.back
					? `${draft.text}\n\n${MAIN_SEPARATOR}\n\n${draft.back}`.trim()
					: draft.text.trim();
			case "choice": {
				const answerText = draft.answers.join(",");
				const header = `${draft.question}（答案：${answerText}）`;
				const optionLines = draft.options.map((option) => `${option.key}. ${option.text}`).join("\n");
				return draft.back
					? `${header}\n\n${optionLines}\n\n${MAIN_SEPARATOR}\n\n${draft.back}`.trim()
					: `${header}\n\n${optionLines}`.trim();
			}
		}
	}

	private createGeneratedCard(
		draft: GeneratedCardDraft,
		generatedContent: string,
		config: GenerationConfig
	): GeneratedCard {
		return {
			uuid: `ai-card-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
			type: draft.type,
			content: generatedContent,
			tags: [...(draft.tags || [])],
			metadata: {
				generatedAt: new Date().toISOString(),
				provider: config.provider,
				model: config.model,
				temperature: config.temperature,
				difficulty: config.difficulty === "mixed" ? "medium" : config.difficulty,
			},
		};
	}

	private buildPreviewItem(
		raw: RawDraftCard,
		config: GenerationConfig,
		index: number
	): AICardPreviewItem {
		const type = this.inferDraftType(raw);
		let draft: GeneratedCardDraft;
		let issues: AICardIssue[] = [];

		switch (type) {
			case "qa": {
				const content = this.normalizeString(raw.content);
				const split = content ? this.splitContent(content) : { front: "", back: "" };
				const front = this.normalizeString(raw.front) || split.front;
				const back = this.normalizeString(raw.back) || split.back;

				if (!front) {
					issues.push({ code: "missing-front", message: "问答题缺少问题", severity: "error" });
				}
				if (!back) {
					issues.push({ code: "missing-back", message: "问答题缺少答案", severity: "error" });
				}

				draft = {
					type: "qa",
					front,
					back,
					tags: this.normalizeTags(raw.tags),
				};
				break;
			}

			case "cloze": {
				const content = this.normalizeString(raw.content);
				const split = content ? this.splitContent(content) : { front: "", back: "" };
				const text = this.normalizeString(raw.text) || split.front;
				const back = this.normalizeString(raw.back) || split.back || undefined;

				if (!text || !this.containsCloze(text)) {
					issues.push({ code: "missing-cloze", message: "挖空题缺少有效挖空", severity: "error" });
				}

				draft = {
					type: "cloze",
					text,
					back,
					tags: this.normalizeTags(raw.tags),
				};
				break;
			}

			case "choice": {
				const content = this.normalizeString(raw.content);
				const split = content ? this.splitContent(content) : { front: "", back: "" };
				const question = this.normalizeString(raw.question) || split.front.split("\n")[0]?.trim() || "";
				const normalizedOptions = this.normalizeChoiceOptions(raw.options);
				const normalizedAnswers = this.normalizeChoiceAnswers(raw.answers, normalizedOptions.options);
				const back = this.normalizeString(raw.back) || split.back || undefined;

				issues = issues.concat(normalizedOptions.issues, normalizedAnswers.issues);

				if (!question) {
					issues.push({
						code: "missing-question",
						message: "选择题缺少题干",
						severity: "error",
					});
				}

				if (!back) {
					issues.push({
						code: "missing-back",
						message: "选择题缺少解析，仍可导入",
						severity: "warning",
					});
				}

				draft = {
					type: "choice",
					question,
					options: normalizedOptions.options,
					answers: normalizedAnswers.answers,
					back,
					tags: this.normalizeTags(raw.tags),
				};
				break;
			}
		}

		const generatedContent = this.buildContentFromDraft(draft);
		const status = issues.some((issue) => issue.severity === "error")
			? "invalid"
			: issues.length > 0
				? "warning"
				: "valid";

		return {
			id: `ai-preview-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
			draft,
			status,
			issues,
			generatedContent,
			generatedCard: this.createGeneratedCard(draft, generatedContent, config),
		};
	}

	private markItemsAsNew(items: AICardPreviewItem[], isNew: boolean): AICardPreviewItem[] {
		return items.map((item) => ({
			...item,
			isNew,
			generatedCard: {
				...item.generatedCard,
				isNew,
			},
		}));
	}

	async generatePreviewItems(
		content: string,
		generationConfig: GenerationConfig,
		selectedPrompt: PromptTemplate | null,
		customPrompt: string,
		callbacks: AICardPreviewCallbacks
	): Promise<AICardPreviewItem[]> {
		this.validateSourceContent(content);
		this.ensureAIConfigured();

		callbacks.onProgress({
			status: "preparing",
			progress: 0,
			message: "准备生成结构化卡片...",
			currentCard: 0,
			totalCards: generationConfig.cardCount,
		});

		const resolvedPrompt = this.buildResolvedPrompt(selectedPrompt, customPrompt, generationConfig);
		const responseText = await this.executeStructuredDraftRequest({
			systemPrompt: this.buildDraftSystemPrompt(generationConfig),
			userPrompt: this.buildDraftUserPrompt(content, resolvedPrompt),
			config: generationConfig,
		});

		callbacks.onProgress({
			status: "parsing",
			progress: 85,
			message: "正在校验生成结果...",
			currentCard: 0,
			totalCards: generationConfig.cardCount,
		});

		let items = this.parseDraftResponse(responseText).map((draft, index) =>
			this.buildPreviewItem(draft, generationConfig, index)
		);
		items = this.deduplicatePreviewItems(items).slice(0, generationConfig.cardCount);

		let nextItems = this.markItemsAsNew(items, true);
		callbacks.onItemsUpdate(nextItems);
		await new Promise((resolve) => setTimeout(resolve, 100));
		nextItems = this.markItemsAsNew(items, false);
		callbacks.onItemsUpdate(nextItems);

		callbacks.onProgress({
			status: "completed",
			progress: 100,
			message: `已生成 ${nextItems.length} 张卡片草稿`,
			currentCard: nextItems.length,
			totalCards: generationConfig.cardCount,
		});

		return nextItems;
	}

	async regeneratePreviewItem(
		item: AICardPreviewItem,
		instruction: string,
		config: GenerationConfig
	): Promise<AICardPreviewItem> {
		this.ensureAIConfigured();

		const regenerateConfig: GenerationConfig = {
			...config,
			cardCount: 1,
			typeDistribution:
				item.draft.type === "qa"
					? { qa: 100, cloze: 0, choice: 0 }
					: item.draft.type === "cloze"
						? { qa: 0, cloze: 100, choice: 0 }
						: { qa: 0, cloze: 0, choice: 100 },
		};

		const responseText = await this.executeStructuredDraftRequest({
			systemPrompt: this.buildDraftSystemPrompt(regenerateConfig),
			userPrompt: this.buildRegenerateUserPrompt(item, instruction),
			config: regenerateConfig,
		});

		const rawDrafts = this.parseDraftResponse(responseText);
		if (rawDrafts.length === 0) {
			throw new Error("重新生成结果为空");
		}

		return this.buildPreviewItem(rawDrafts[0], config, 0);
	}

	async generateCards(
		content: string,
		generationConfig: GenerationConfig,
		selectedPrompt: PromptTemplate | null,
		customPrompt: string,
		callbacks: AICardGenerationCallbacks
	): Promise<GeneratedCard[]> {
		this.validateSourceContent(content);
		this.ensureAIConfigured();

		const totalCount = generationConfig.cardCount;
		const provider = generationConfig.provider;
		const model = generationConfig.model;
		const aiConfig = this.plugin.settings.aiConfig;
		if (!aiConfig) {
			throw new Error("AI 配置未初始化");
		}
		const apiKeys = aiConfig.apiKeys as
			| Record<string, { apiKey: string; enabled?: boolean } | undefined>
			| undefined;
		const providerConfig = apiKeys?.[provider];

		if (!providerConfig?.apiKey) {
			throw new Error(`${provider} API 密钥未配置`);
		}

		callbacks.onProgress({
			status: "preparing",
			progress: 0,
			message: "准备生成卡片...",
			currentCard: 0,
			totalCards: totalCount,
		});

		const resolvedPrompt = this.buildResolvedPrompt(selectedPrompt, customPrompt, generationConfig);
		const requestConfig: GenerationConfig = {
			...generationConfig,
			cardCount: totalCount,
			templateId: selectedPrompt?.id || "custom",
			promptTemplate: resolvedPrompt,
			customPrompt: customPrompt || undefined,
			provider,
			model,
		};

		const aiService = AIServiceFactory.createService(provider, this.plugin, model);

		callbacks.onProgress({
			status: "generating",
			progress: 5,
			message: `正在一次生成 ${totalCount} 张卡片...`,
			currentCard: 0,
			totalCards: totalCount,
		});

		const response = await aiService.generateCards(content, requestConfig, (progress) => {
			callbacks.onProgress({
				...progress,
				currentCard: 0,
				totalCards: totalCount,
			});
		});

		if (!response.success || !response.cards) {
			logger.error("[AICardGenerationService] Batch generation failed", response.error);
			if (this.isRateLimitErrorMessage(response.error)) {
				throw new Error(this.buildRateLimitNotice(provider, response.error));
			}
			throw new Error(response.error || "AI 生成失败");
		}

		let generatedCards = response.cards.slice(0, totalCount);
		generatedCards = this.deduplicateCards(generatedCards, []).slice(0, totalCount);

		let cardsWithNewFlag = generatedCards.map((card) => ({
			...card,
			isNew: true,
		}));
		callbacks.onCardsUpdate(cardsWithNewFlag);
		await new Promise((resolve) => setTimeout(resolve, 100));
		cardsWithNewFlag = cardsWithNewFlag.map((card) => ({
			...card,
			isNew: false,
		}));
		callbacks.onCardsUpdate(cardsWithNewFlag);

		callbacks.onProgress({
			status: "completed",
			progress: 100,
			message: `成功生成 ${cardsWithNewFlag.length} 张卡片`,
			currentCard: cardsWithNewFlag.length,
			totalCards: totalCount,
		});

		return cardsWithNewFlag;
	}
}
