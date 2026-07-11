const BLOCK_ID_PATTERN = /\^([a-zA-Z0-9_-]+)(?![A-Za-z0-9_-])/;

export interface ObsidianBlockLocateResult {
	/** 含块 ID 的行号（0-based） */
	targetLine: number;
	/** 块起始行（空行后的第一行，或文件开头） */
	blockStartLine: number;
	/** 块结束行（与 targetLine 相同） */
	blockEndLine: number;
	/** 块原始行（含块 ID 行） */
	blockLines: string[];
	/** 块正文：块 ID 之前的内容（已去掉行尾 ^id） */
	blockContent: string;
	/** 用于编辑器/预览定位的候选文本 */
	locateTextCandidates: string[];
}

export function isObsidianBlankLine(line: string): boolean {
	return String(line || "").trim() === "";
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTrailingBlockId(line: string): string {
	return String(line || "").replace(/\s*\^[a-zA-Z0-9_-]+\s*$/, "").trimEnd();
}

function buildBlockIdPattern(blockId: string): RegExp {
	const cleanId = blockId.replace(/^\^/, "").trim();
	return new RegExp(`\\^${escapeRegex(cleanId)}(?![A-Za-z0-9_-])`);
}

/**
 * 按 Obsidian 块语义定位：两空行（单空行分隔）之间的连续非空行构成一块，
 * 块 ID 位于块末行，高亮/展示范围为块 ID 之前的整块内容。
 */
export function findObsidianBlockById(
	content: string,
	blockId: string
): ObsidianBlockLocateResult | null {
	const cleanId = blockId.replace(/^\^/, "").trim();
	if (!cleanId) {
		return null;
	}

	const normalized = String(content || "").replace(/\r\n/g, "\n");
	const lines = normalized.split("\n");
	const blockIdPattern = buildBlockIdPattern(cleanId);

	let targetLine = -1;
	for (let index = 0; index < lines.length; index += 1) {
		if (blockIdPattern.test(lines[index])) {
			targetLine = index;
			break;
		}
	}

	if (targetLine < 0) {
		return null;
	}

	let blockStartLine = 0;
	for (let index = targetLine - 1; index >= 0; index -= 1) {
		if (isObsidianBlankLine(lines[index])) {
			blockStartLine = index + 1;
			break;
		}
	}

	const blockLines = lines.slice(blockStartLine, targetLine + 1);
	const cleanedLines = blockLines.map((line, index) => {
		if (index === blockLines.length - 1) {
			return stripTrailingBlockId(line);
		}
		return line;
	});
	const blockContent = cleanedLines.join("\n").trimEnd();

	const locateTextCandidates = Array.from(
		new Set(
			[
				blockContent,
				...cleanedLines.map((line) => line.trim()).filter((line) => line.length >= 8),
			].filter((item) => item.length > 0)
		)
	);

	return {
		targetLine,
		blockStartLine,
		blockEndLine: targetLine,
		blockLines,
		blockContent,
		locateTextCandidates,
	};
}

export function extractBlockIdFromCandidates(candidates: string[]): string | undefined {
	for (const candidate of candidates) {
		const trimmed = String(candidate || "").trim();
		if (!trimmed) {
			continue;
		}

		const hashMatch = trimmed.match(/#\^([a-zA-Z0-9_-]+)/);
		if (hashMatch?.[1]) {
			return hashMatch[1];
		}

		const caretMatch = trimmed.match(BLOCK_ID_PATTERN);
		if (caretMatch?.[1]) {
			return caretMatch[1];
		}

		if (/^[a-zA-Z0-9_-]+$/.test(trimmed) && trimmed.includes("-")) {
			return trimmed;
		}
	}

	return undefined;
}
