/**
 * 选择题解析工具
 * 支持多种格式的选项解析和处理
 */

export interface ParsedOption {
	label: string; // A, B, C, D, E
	text: string; // 选项内容
	index: number; // 索引 (0-4)
	isCorrect?: boolean; //  新增：是否为正确答案
}

export interface ParsedChoiceQuestion {
	options: ParsedOption[];
	hasValidStructure: boolean;
	totalOptions: number;
}

/**
 * 解析选择题选项字段
 * 支持多种格式：
 * 1. A. 选项内容\nB. 选项内容\nC. 选项内容
 * 2. A 选项内容\nB 选项内容\nC 选项内容
 * 3. 选项内容1\n选项内容2\n选项内容3 (自动添加A、B、C标签)
 * 4. - [ ] 选项内容\n- [x] 正确选项\n- [ ] 选项内容 (Markdown复选框格式)
 */
export function parseChoiceOptions(optionsText: string): ParsedChoiceQuestion {
	if (!optionsText || typeof optionsText !== "string") {
		return {
			options: [],
			hasValidStructure: false,
			totalOptions: 0,
		};
	}

	const lines = optionsText
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (lines.length === 0) {
		return {
			options: [],
			hasValidStructure: false,
			totalOptions: 0,
		};
	}

	const options: ParsedOption[] = [];
	const labels = ["A", "B", "C", "D", "E"];

	//  增强格式检测：支持Markdown复选框格式
	const hasLabeledFormat = lines.some(
		(line) => /^[A-E][.\s]/.test(line) // A. 或 A 开头
	);

	const hasCheckboxFormat = lines.some(
		(line) => /^-\s*\[([ x])\]\s*/.test(line) // - [ ] 或 - [x] 格式
	);

	if (hasCheckboxFormat) {
		//  新增：处理Markdown复选框格式
		for (let i = 0; i < lines.length && i < 5; i++) {
			const line = lines[i];

			// 匹配 - [ ] 内容 或 - [x] 内容
			const match = line.match(/^-\s*\[([ x])\]\s*(.+)$/);
			if (match) {
				const [, checked, text] = match;
				const label = labels[i];

				options.push({
					label,
					text: text.trim(),
					index: i,
					isCorrect: checked === "x", // [x] 表示正确答案
				});
			}
		}
	} else if (hasLabeledFormat) {
		// 格式1和2：已有标签的格式
		for (let i = 0; i < lines.length && i < 5; i++) {
			const line = lines[i];

			// 匹配 A. 内容 或 A 内容
			const match = line.match(/^([A-E])[.\s]\s*(.+)$/);
			if (match) {
				const [, label, text] = match;
				const index = labels.indexOf(label.toUpperCase());

				if (index !== -1) {
					options.push({
						label: label.toUpperCase(),
						text: text.trim(),
						index,
					});
				}
			} else {
				// 如果某行不匹配格式，尝试作为纯文本处理
				const expectedLabel = labels[i];
				if (expectedLabel) {
					options.push({
						label: expectedLabel,
						text: line,
						index: i,
					});
				}
			}
		}
	} else {
		// 格式3：纯文本格式，自动添加标签
		for (let i = 0; i < lines.length && i < 5; i++) {
			const line = lines[i];
			const label = labels[i];

			options.push({
				label,
				text: line.trim(),
				index: i,
			});
		}
	}

	// 按标签排序，确保A、B、C、D、E的顺序
	options.sort((a, b) => a.index - b.index);

	return {
		options,
		hasValidStructure: options.length >= 2, // 至少需要2个选项
		totalOptions: options.length,
	};
}

/**
 * 将解析后的选项转换为显示格式
 */
export function formatOptionsForDisplay(options: ParsedOption[]): string {
	return options.map((option) => `${option.label}. ${option.text}`).join("\n");
}

/**
 * 将解析后的选项转换为HTML格式（用于模板渲染）
 */
export function formatOptionsForTemplate(options: ParsedOption[]): string {
	return options.map((option) => `${option.label}. ${option.text}`).join("<br>");
}

/**
 * 根据标签获取选项文本
 */
export function getOptionByLabel(options: ParsedOption[], label: string): ParsedOption | null {
	return options.find((option) => option.label.toUpperCase() === label.toUpperCase()) || null;
}

/**
 * 验证答案是否在选项范围内
 */
export function validateAnswer(options: ParsedOption[], answer: string): boolean {
	if (!answer || typeof answer !== "string") return false;

	const normalizedAnswer = answer.trim().toUpperCase();
	return options.some((option) => option.label === normalizedAnswer);
}

/**
 * 从旧格式的字段转换为新格式
 * 用于数据迁移
 */
export function convertLegacyOptions(fields: Record<string, string>): string {
	const options: string[] = [];
	const labels = ["A", "B", "C", "D", "E"];

	for (const label of labels) {
		const key = `option_${label.toLowerCase()}`;
		const value = fields[key];

		if (value?.trim()) {
			options.push(`${label}. ${value.trim()}`);
		}
	}

	return options.join("\n");
}

/**
 * 检查卡片是否为选择题格式
 */
export function isMultipleChoiceCard(fields: Record<string, string>): boolean {
	// 检查新格式
	if (fields.options && fields.question && fields.correct_answer) {
		const parsed = parseChoiceOptions(fields.options);
		return parsed.hasValidStructure;
	}

	// 检查旧格式
	const hasLegacyOptions = ["option_a", "option_b", "option_c", "option_d"].every(
		(key) => fields[key] && fields[key].trim() !== ""
	);

	if (hasLegacyOptions && fields.correct_answer && fields.correct_answer.trim() !== "") {
		return true;
	}

	// 检查Markdown格式（新增）
	return detectMarkdownChoice(fields);
}

/**
 * 检测Markdown格式的选择题
 * 支持用户提供的格式：## 题目\n**选项**:\nA. 选项1\nB. 选项2\n---div---\n答案
 */
export function detectMarkdownChoice(fields: Record<string, string>): boolean {
	// 检查front字段是否包含选择题模式
	const frontContent = fields.front || fields.Front || "";
	if (!frontContent) return false;

	// 模式1: ## 题目\n**选项**:\nA. 选项1\nB. 选项2
	const h2OptionsPattern = /##\s*.+?\n\*\*选项\*\*:\s*\n(?:[A-E]\..+?\n?){2,}/ms;
	if (h2OptionsPattern.test(frontContent)) {
		return true;
	}

	// 模式2: 题目\nA. 选项1\nB. 选项2
	const directOptionsPattern = /^.+?\n(?:[A-E]\..+?\n?){2,}/ms;
	if (directOptionsPattern.test(frontContent)) {
		// 验证确实有选项格式
		const optionMatches = frontContent.match(/[A-E]\.\s*.+/g);
		return Boolean(optionMatches && optionMatches.length >= 2);
	}

	return false;
}

/**
 * 获取选择题的所有选项标签
 */
export function getAvailableLabels(options: ParsedOption[]): string[] {
	return options.map((option) => option.label);
}
