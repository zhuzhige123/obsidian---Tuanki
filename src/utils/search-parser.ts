/**
 * 卡片搜索解析器
 * 支持基于卡片数据的搜索语法
 */

import { TagExtractor } from "./tag-extractor";
import { parseYAMLFromContent } from "./yaml-utils";

/** 日期范围筛选 */
export interface DateRange {
	from?: string; // ISO date string (YYYY-MM-DD)
	to?: string; // ISO date string (YYYY-MM-DD)
}

/** YAML 属性筛选 */
export interface YamlFilter {
	key: string;
	value: string;
}

export interface SearchQuery {
	// 基础搜索
	text: string[]; // 普通文本搜索

	// 卡片属性
	decks: string[]; // deck: 牌组名称
	tags: string[]; // tag: 标签
	priorities: number[]; // priority: 优先级
	types: string[]; // type: 题型
	sources: string[]; // source: 来源文档
	folders: string[]; // folder: 来源文件夹

	statuses: string[];
	states: string[];
	accuracies: string[];
	attempts: number[];
	errors: string[];

	// 日期范围筛选
	dateRanges: DateRange[]; // created:YYYY-MM-DD..YYYY-MM-DD
	modifiedRanges: DateRange[]; // modified:YYYY-MM-DD..YYYY-MM-DD
	dueRanges: DateRange[]; // due:YYYY-MM-DD..YYYY-MM-DD
	// YAML 属性筛选
	yamlFilters: YamlFilter[]; // yaml:key:value

	// 否定搜索（-前缀排除）
	excludeDecks: string[];
	excludeTags: string[];
	excludeTypes: string[];
	excludeSources: string[];
	excludeFolders: string[];
	excludeStatuses: string[];
	excludeText: string[];

	// 原始查询
	raw: string;
}

/**
 * 解析搜索查询
 */
export function parseSearchQuery(query: string): SearchQuery {
	const result: SearchQuery = {
		text: [],
		decks: [],
		tags: [],
		priorities: [],
		types: [],
		sources: [],
		folders: [],
		statuses: [],
		states: [],
		accuracies: [],
		attempts: [],
		errors: [],
		dateRanges: [],
		modifiedRanges: [],
		dueRanges: [],
		yamlFilters: [],
		excludeDecks: [],
		excludeTags: [],
		excludeTypes: [],
		excludeSources: [],
		excludeFolders: [],
		excludeStatuses: [],
		excludeText: [],
		raw: query,
	};

	if (!query.trim()) {
		return result;
	}

	// 收集所有已匹配区间 [start, end)，最后提取剩余文本
	const matchedRanges: [number, number][] = [];

	function execAll(pattern: RegExp, handler: (m: RegExpExecArray) => void) {
		pattern.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = pattern.exec(query)) !== null) {
			handler(m);
			matchedRanges.push([m.index, m.index + m[0].length]);
		}
	}

	// 提取各前缀
	execAll(/deck:"([^"]+)"|deck:(\S+)/g, (m) => {
		result.decks.push(m[1] || m[2]);
	});

	execAll(/tag:(\S+)/g, (m) => {
		let tagValue = m[1];
		if (tagValue.startsWith("#")) tagValue = tagValue.slice(1);
		result.tags.push(tagValue);
	});

	execAll(/priority:(\d+)/g, (m) => {
		result.priorities.push(parseInt(m[1]));
	});

	execAll(/type:(\S+)/g, (m) => {
		result.types.push(m[1]);
	});

	execAll(/source:"([^"]+)"|source:(\S+)/g, (m) => {
		result.sources.push(m[1] || m[2]);
	});

	execAll(/folder:"([^"]+)"|folder:(\S+)/g, (m) => {
		result.folders.push(m[1] || m[2]);
	});

	execAll(/status:(\S+)/g, (m) => {
		result.statuses.push(m[1]);
	});

	execAll(/state:(\S+)/g, (m) => {
		result.states.push(m[1]);
	});

	execAll(/accuracy:"([^"]+)"|accuracy:(\S+)/g, (m) => {
		result.accuracies.push(m[1] || m[2]);
	});

	execAll(/attempts:(\d+)/g, (m) => {
		result.attempts.push(parseInt(m[1]));
	});

	execAll(/error:(\S+)/g, (m) => {
		result.errors.push(m[1]);
	});

	execAll(/created:"([^"]+)"|created:(\S+)/g, (m) => {
		const raw = m[1] || m[2];
		const dateRange = parseDateRange(raw);
		if (dateRange) {
			result.dateRanges.push(dateRange);
		}
	});

	execAll(/modified:"([^"]+)"|modified:(\S+)/g, (m) => {
		const raw = m[1] || m[2];
		const dateRange = parseDateRange(raw);
		if (dateRange) {
			result.modifiedRanges.push(dateRange);
		}
	});

	execAll(/due:"([^"]+)"|due:(\S+)/g, (m) => {
		const raw = m[1] || m[2];
		const dateRange = parseDateRange(raw);
		if (dateRange) {
			result.dueRanges.push(dateRange);
		}
	});

	execAll(/yaml:(?:"([^"]+)"|([^\s:]+)):(?:"([^"]+)"|(\S+))/g, (m) => {
		const key = m[1] || m[2];
		const value = m[3] || m[4];
		if (key && value) {
			result.yamlFilters.push({ key, value });
		}
	});

	// 否定搜索：-prefix:value
	execAll(/-deck:"([^"]+)"|-deck:(\S+)/g, (m) => {
		result.excludeDecks.push(m[1] || m[2]);
	});
	execAll(/-tag:(\S+)/g, (m) => {
		let v = m[1];
		if (v.startsWith("#")) v = v.slice(1);
		result.excludeTags.push(v);
	});
	execAll(/-type:(\S+)/g, (m) => {
		result.excludeTypes.push(m[1]);
	});
	execAll(/-source:"([^"]+)"|-source:(\S+)/g, (m) => {
		result.excludeSources.push(m[1] || m[2]);
	});
	execAll(/-folder:"([^"]+)"|-folder:(\S+)/g, (m) => {
		result.excludeFolders.push(m[1] || m[2]);
	});
	execAll(/-status:(\S+)/g, (m) => {
		result.excludeStatuses.push(m[1]);
	});

	// 基于位置提取剩余文本（未被任何前缀匹配的部分）
	matchedRanges.sort((a, b) => a[0] - b[0]);
	let remaining = "";
	let pos = 0;
	for (const [start, end] of matchedRanges) {
		if (start > pos) {
			remaining += query.slice(pos, start);
		}
		pos = Math.max(pos, end);
	}
	if (pos < query.length) {
		remaining += query.slice(pos);
	}

	const textParts = remaining
		.trim()
		.split(/\s+/)
		.filter((part) => part.length > 0);

	for (const part of textParts) {
		if (part.startsWith("-") && part.length > 1) {
			result.excludeText.push(part.slice(1));
		} else {
			result.text.push(part);
		}
	}

	return result;
}

/**
 * 解析日期范围字符串
 * 支持格式：
 * - YYYY-MM-DD..YYYY-MM-DD  起止日期
 * - >YYYY-MM-DD             晚于指定日期
 * - <YYYY-MM-DD             早于指定日期
 * - YYYY-MM                 指定月份
 * - YYYY-MM-DD              指定单天
 */
function parseDateRange(raw: string): DateRange | null {
	if (!raw) return null;

	// 起止范围: 2024-01-01..2024-12-31
	if (raw.includes("..")) {
		const [from, to] = raw.split("..");
		return { from: from || undefined, to: to || undefined };
	}

	// 大于: >2024-01-01
	if (raw.startsWith(">")) {
		return { from: raw.slice(1) };
	}

	// 小于: <2024-12-31
	if (raw.startsWith("<")) {
		return { to: raw.slice(1) };
	}

	// 月份: 2024-01 → 2024-01-01..2024-01-31
	if (/^\d{4}-\d{2}$/.test(raw)) {
		const [year, month] = raw.split("-").map(Number);
		const lastDay = new Date(year, month, 0).getDate();
		return {
			from: `${raw}-01`,
			to: `${raw}-${String(lastDay).padStart(2, "0")}`,
		};
	}

	// 单天: 2024-01-15
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		return { from: raw, to: raw };
	}

	return null;
}

function normalizeSourceFolderPath(sourceFile: string): string {
	if (!sourceFile) return "/";

	const normalized = sourceFile.replace(/\\/g, "/").trim();
	if (!normalized) return "/";

	const lastSlashIndex = normalized.lastIndexOf("/");
	if (lastSlashIndex <= 0) {
		return "/";
	}

	return normalized.slice(0, lastSlashIndex);
}

function matchesFolderToken(sourceFolder: string, tokenRaw: string): boolean {
	const token = tokenRaw.replace(/\\/g, "/").trim();
	if (!token) {
		return sourceFolder === "/";
	}

	if (token === "/" || token === ".") {
		return sourceFolder === "/";
	}

	return sourceFolder.toLowerCase().includes(token.toLowerCase());
}

/**
 * 匹配卡片是否符合搜索条件
 * @param card 卡片对象
 * @param query 解析后的搜索查询
 * @param getCardContent 获取卡片内容的函数
 * @param getCardDeckNames 获取卡片所属所有牌组名称的函数（v2.0 引用式牌组支持）
 * @param getCardType 获取卡片题型的函数
 */
export function matchSearchQuery(
	card: any,
	query: SearchQuery,
	getCardContent: (card: any, side: "front" | "back") => string,
	getCardDeckNames: (card: any) => string,
	getCardType: (card: any) => string
): boolean {
	// 如果查询为空，匹配所有
	if (!query.raw.trim()) {
		return true;
	}

	let matches = true;

	// 匹配牌组（v2.0 引用式牌组：一张卡片可能属于多个牌组）
	if (query.decks.length > 0) {
		// getCardDeckNames 返回卡片所属的所有牌组名称（逗号分隔的字符串）
		const deckNames = getCardDeckNames(card).toLowerCase();
		matches = matches && query.decks.some((deck) => deckNames.includes(deck.toLowerCase()));
	}

	// 匹配标签（同时检查 card.tags 和 card.content 内联 #标签）
	if (query.tags.length > 0) {
		const cardTags: string[] = card.tags || [];
		// 从 content 提取内联标签，合并去重
		const allTags = [...cardTags];
		if (typeof card.content === "string" && card.content) {
			const contentTags = TagExtractor.extractTagsExcludingCode(card.content);
			for (const ct of contentTags) {
				if (!allTags.some((t) => t.toLowerCase() === ct.toLowerCase())) {
					allTags.push(ct);
				}
			}
		}
		matches =
			matches &&
			query.tags.some((_tag) => {
				const cleanTag = _tag.startsWith("#") ? _tag.slice(1) : _tag;
				return allTags.some((cardTag: string) => {
					const cleanCardTag = cardTag.startsWith("#") ? cardTag.slice(1) : cardTag;
					return cleanCardTag.toLowerCase().includes(cleanTag.toLowerCase());
				});
			});
	}

	// 匹配优先级
	if (query.priorities.length > 0) {
		const cardPriority = card.priority || 0;
		matches = matches && query.priorities.includes(cardPriority);
	}

	// 匹配题型
	if (query.types.length > 0) {
		const cardType = getCardType(card);
		matches =
			matches && query.types.some((type) => cardType.toLowerCase().includes(type.toLowerCase()));
	}

	// 匹配来源文档
	if (query.sources.length > 0) {
		// 修复：使用正确的字段名 sourceFile，而不是 fields.source_document
		const sourceDoc = card.sourceFile || "";
		matches =
			matches &&
			query.sources.some((source) => sourceDoc.toLowerCase().includes(source.toLowerCase()));
	}

	if (query.folders.length > 0) {
		const sourceFolder = normalizeSourceFolderPath(card.sourceFile || "");
		matches = matches && query.folders.some((folder) => matchesFolderToken(sourceFolder, folder));
	}

	if (query.statuses.length > 0) {
		const stateNum = card.fsrs?.state;
		const statusString =
			stateNum === 0
				? "new"
				: stateNum === 1
				? "learning"
				: stateNum === 2
				? "review"
				: stateNum === 3
				? "relearning"
				: "";
		matches =
			matches &&
			query.statuses.some((status) => statusString.toLowerCase().includes(status.toLowerCase()));
	}

	if (query.states.length > 0) {
		const irState = (card.ir_state || card.scheduleStatus || "").toString();
		matches =
			matches && query.states.some((state) => irState.toLowerCase().includes(state.toLowerCase()));
	}

	if (query.accuracies.length > 0) {
		const stats = card.stats?.testStats;
		const acc = typeof stats?.accuracy === "number" ? stats.accuracy : null;
		const percent = acc !== null ? Math.round(acc * 100) : null;

		const matchesAccuracyToken = (tokenRaw: string): boolean => {
			if (percent === null) return false;
			const token = tokenRaw.trim().toLowerCase();
			if (!token) return false;
			if (token === "high") return percent >= 80;
			if (token === "medium") return percent >= 60 && percent < 80;
			if (token === "low") return percent < 60;

			const num = Number(token.replace("%", ""));
			if (Number.isFinite(num)) return percent >= num;
			return false;
		};

		matches = matches && query.accuracies.some(matchesAccuracyToken);
	}

	if (query.attempts.length > 0) {
		const attempts = Number(card.stats?.testStats?.totalAttempts ?? 0);
		matches = matches && query.attempts.some((_min) => attempts >= _min);
	}

	if (query.errors.length > 0) {
		const stats = card.stats?.testStats;
		const incorrect = Number(stats?.incorrectAttempts ?? 0);
		const inErrorBook = !!stats?.isInErrorBook;

		const level = !inErrorBook
			? "none"
			: incorrect >= 5
			? "high"
			: incorrect >= 3
			? "common"
			: incorrect > 0
			? "light"
			: "none";

		matches =
			matches &&
			query.errors.some((_token) => {
				const t = _token.trim().toLowerCase();
				if (!t) return false;
				return level === t;
			});
	}

	// 匹配日期范围
	if (query.dateRanges.length > 0) {
		const cardCreated = card.created || "";
		const cardDate = cardCreated.slice(0, 10); // YYYY-MM-DD
		matches =
			matches &&
			query.dateRanges.every((_range) => {
				if (_range.from && cardDate < _range.from) return false;
				if (_range.to && cardDate > _range.to) return false;
				return true;
			});
	}

	// 匹配修改日期范围
	if (query.modifiedRanges.length > 0) {
		const cardModified = card.modified || "";
		const modDate = cardModified.slice(0, 10);
		matches =
			matches &&
			query.modifiedRanges.every((_range) => {
				if (_range.from && modDate < _range.from) return false;
				if (_range.to && modDate > _range.to) return false;
				return true;
			});
	}

	// 匹配复习到期日范围
	if (query.dueRanges.length > 0) {
		const cardDue = card.fsrs?.due || "";
		const dueDate = cardDue.slice(0, 10);
		matches =
			matches &&
			query.dueRanges.every((_range) => {
				if (!dueDate) return false;
				if (_range.from && dueDate < _range.from) return false;
				if (_range.to && dueDate > _range.to) return false;
				return true;
			});
	}

	// 匹配 YAML 属性
	if (query.yamlFilters.length > 0) {
		let yamlData: Record<string, any> = {};
		try {
			if (typeof card.content === "string" && card.content) {
				yamlData = parseYAMLFromContent(card.content);
			}
		} catch {
			/* ignore */
		}

		matches =
			matches &&
			query.yamlFilters.every((_filter) => {
				const val = yamlData[_filter.key];
				if (val === undefined || val === null) return false;
				const valStr = Array.isArray(val) ? val.join(" ") : String(val);
				return valStr.toLowerCase().includes(_filter.value.toLowerCase());
			});
	}

	// 否定搜索：排除匹配的卡片
	if (query.excludeDecks.length > 0) {
		const deckNames = getCardDeckNames(card).toLowerCase();
		matches =
			matches && query.excludeDecks.every((deck) => !deckNames.includes(deck.toLowerCase()));
	}

	if (query.excludeTags.length > 0) {
		const cardTags: string[] = card.tags || [];
		matches =
			matches &&
			query.excludeTags.every((_excludeTag) => {
				const clean = _excludeTag.startsWith("#") ? _excludeTag.slice(1) : _excludeTag;
				return !cardTags.some((t: string) => {
					const ct = t.startsWith("#") ? t.slice(1) : t;
					return ct.toLowerCase().includes(clean.toLowerCase());
				});
			});
	}

	if (query.excludeTypes.length > 0) {
		const cardType = getCardType(card);
		matches =
			matches && query.excludeTypes.every((t) => !cardType.toLowerCase().includes(t.toLowerCase()));
	}

	if (query.excludeSources.length > 0) {
		const sourceDoc = card.sourceFile || "";
		matches =
			matches &&
			query.excludeSources.every((s) => !sourceDoc.toLowerCase().includes(s.toLowerCase()));
	}

	if (query.excludeFolders.length > 0) {
		const sourceFolder = normalizeSourceFolderPath(card.sourceFile || "");
		matches =
			matches &&
			query.excludeFolders.every((folder) => !matchesFolderToken(sourceFolder, folder));
	}

	if (query.excludeStatuses.length > 0) {
		const stateNum = card.fsrs?.state;
		const statusStr =
			stateNum === 0
				? "new"
				: stateNum === 1
				? "learning"
				: stateNum === 2
				? "review"
				: stateNum === 3
				? "relearning"
				: "";
		matches =
			matches &&
			query.excludeStatuses.every((s) => !statusStr.toLowerCase().includes(s.toLowerCase()));
	}

	// 匹配普通文本（在正面、背面、标签中搜索）
	if (query.text.length > 0 || query.excludeText.length > 0) {
		const front = getCardContent(card, "front").toLowerCase();
		const back = getCardContent(card, "back").toLowerCase();
		const tags = (card.tags || []).join(" ").toLowerCase();
		const allContent = `${front} ${back} ${tags}`;

		if (query.text.length > 0) {
			matches = matches && query.text.every((text) => allContent.includes(text.toLowerCase()));
		}
		if (query.excludeText.length > 0) {
			matches =
				matches && query.excludeText.every((text) => !allContent.includes(text.toLowerCase()));
		}
	}

	return matches;
}
