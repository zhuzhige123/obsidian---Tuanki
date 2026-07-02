import { CardState, CardType, type Card } from "../data/types";
import { parseYAMLFromContent, setCardProperties } from "./yaml-utils";

type CardFingerprintInput =
	| string
	| Pick<Card, "content" | "type" | "uuid" | "parentCardId"> & { clozeOrd?: number };

/**
 * 提取卡片正文指纹（去除 YAML frontmatter 后标准化并哈希）。
 * 与数据管理「重复卡片」检测使用同一规则。
 *
 * 渐进式挖空父子卡共享同一段正文，但属于不同学习实体；
 * 指纹会附加 progressive 身份，避免被正文去重或重复卡片修复误删。
 */
export function getCardBodyFingerprint(card: CardFingerprintInput): string {
	const content = typeof card === "string" ? card : card.content || "";
	if (!content.trim()) {
		return "";
	}

	const stripped = content.replace(/^---[\s\S]*?---\s*/, "").trim();
	const normalized = stripped.replace(/\s+/g, " ");
	if (!normalized) {
		return "";
	}

	const identitySuffix = getProgressiveFingerprintSuffix(card);
	return hashBodyFingerprint(`${normalized}${identitySuffix}`);
}

function getProgressiveFingerprintSuffix(card: CardFingerprintInput): string {
	if (typeof card === "string") {
		return "";
	}

	if (card.type === CardType.ProgressiveParent) {
		const parentId = String(card.uuid || "").trim();
		return parentId ? `|pc:parent:${parentId}` : "|pc:parent";
	}

	if (card.type === CardType.ProgressiveChild) {
		const parentId = String(card.parentCardId || "").trim();
		const clozeOrd = typeof card.clozeOrd === "number" ? card.clozeOrd : -1;
		return parentId ? `|pc:child:${parentId}:${clozeOrd}` : `|pc:child::${clozeOrd}`;
	}

	return "";
}

function hashBodyFingerprint(normalized: string): string {
	let hash1 = 5381;
	let hash2 = 52711;
	for (let i = 0; i < normalized.length; i++) {
		const ch = normalized.charCodeAt(i);
		hash1 = ((hash1 << 5) + hash1 + ch) >>> 0;
		hash2 = ((hash2 << 5) + hash2 + ch) >>> 0;
	}
	return `${(hash1 >>> 0).toString(36)}_${(hash2 >>> 0).toString(36)}_${normalized.length}`;
}

function readDeckNameList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === "string");
}

/** 评估卡片保留优先分数（分数越高越应保留） */
export function getCardRetentionScore(card: Card): number {
	let score = 0;

	if (card.fsrs?.state !== undefined && card.fsrs.state > CardState.New) {
		score += 10000;
	}

	const reviewCount = card.reviewHistory?.length ?? 0;
	if (reviewCount > 0) {
		score += 5000 + reviewCount;
	}

	const content = card.content || "";
	const weStatus = content.match(/we_status:\s*"?(\w+)"?/);
	if (weStatus && weStatus[1] !== "new") {
		score += 3000;
	}

	if (content.startsWith("---")) {
		score += 100;
	}

	let created = 0;
	if (card.created) {
		created =
			typeof card.created === "number" ? card.created : new Date(card.created).getTime();
	}
	if (created > 0) {
		score += Math.max(0, 1_900_000_000 - created / 1000);
	}

	return score;
}

/** fingerprint -> canonical uuid（同指纹保留学习记录更完整的一张） */
export function buildBodyFingerprintIndex(cards: Card[]): Map<string, string> {
	const index = new Map<string, string>();
	const cardsByUuid = new Map<string, Card>();

	for (const card of cards) {
		if (!card?.uuid) {
			continue;
		}
		const fingerprint = getCardBodyFingerprint(card);
		if (!fingerprint) {
			continue;
		}

		const existingUuid = index.get(fingerprint);
		if (!existingUuid) {
			index.set(fingerprint, card.uuid);
			cardsByUuid.set(card.uuid, card);
			continue;
		}

		const existingCard = cardsByUuid.get(existingUuid);
		if (!existingCard || getCardRetentionScore(card) > getCardRetentionScore(existingCard)) {
			index.set(fingerprint, card.uuid);
			cardsByUuid.set(card.uuid, card);
		}
	}

	return index;
}

/** 将误创建副本的字段合并到已存在的正文相同卡片上 */
export function mergeDuplicateCreateOntoExisting(existing: Card, incoming: Card): Card {
	const existingYaml = parseYAMLFromContent(existing.content || "");
	const incomingYaml = parseYAMLFromContent(incoming.content || "");
	const mergedDeckNames = Array.from(
		new Set(
			[...readDeckNameList(existingYaml.we_decks), ...readDeckNameList(incomingYaml.we_decks)]
				.map((name) => name.trim())
				.filter(Boolean)
		)
	);

	let content = existing.content || "";
	if (mergedDeckNames.length > 0) {
		content = setCardProperties(content, { we_decks: mergedDeckNames });
	}

	const mergedTags = Array.from(
		new Set([...(existing.tags || []), ...(incoming.tags || [])].map((tag) => String(tag || "").trim()).filter(Boolean))
	);

	return {
		...existing,
		content,
		deckId: existing.deckId || incoming.deckId,
		sourceFile: existing.sourceFile || incoming.sourceFile,
		sourceBlock: existing.sourceBlock || incoming.sourceBlock,
		tags: mergedTags.length > 0 ? mergedTags : existing.tags,
		modified: new Date().toISOString(),
	};
}
