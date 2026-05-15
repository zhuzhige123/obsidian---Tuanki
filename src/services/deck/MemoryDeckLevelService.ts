import { CardState, type Card } from "../../data/types";

export const MEMORY_DECK_MAX_LEVEL = 30;
export const MEMORY_DECK_MASTERED_STABILITY_THRESHOLD = 21;

export interface MemoryDeckLevelProgress {
	level: number;
	experience: number;
	masteredCardCount: number;
	currentLevelThreshold: number;
	nextLevelThreshold: number;
	experienceIntoLevel: number;
	experienceNeededForNextLevel: number;
	levelSpan: number;
	progressPercent: number;
	isMaxLevel: boolean;
}

function getSafeLevel(level: number): number {
	if (!Number.isFinite(level)) {
		return 1;
	}

	return Math.max(1, Math.min(MEMORY_DECK_MAX_LEVEL, Math.floor(level)));
}

export function getMemoryDeckLevelUpRequirement(level: number): number {
	const safeLevel = Math.max(1, Math.min(MEMORY_DECK_MAX_LEVEL - 1, Math.floor(level)));
	const baseRequirement = 3 + Math.ceil((safeLevel - 1) * 1.5);
	const midGameBonus = safeLevel > 10 ? Math.ceil((safeLevel - 10) * 1.5) : 0;
	const lateGameBonus = safeLevel > 20 ? Math.ceil((safeLevel - 20) * 2) : 0;
	return baseRequirement + midGameBonus + lateGameBonus;
}

const MEMORY_DECK_LEVEL_THRESHOLDS: number[] = (() => {
	const thresholds: number[] = [0];
	let total = 0;
	for (let level = 1; level < MEMORY_DECK_MAX_LEVEL; level += 1) {
		total += getMemoryDeckLevelUpRequirement(level);
		thresholds.push(total);
	}
	return thresholds;
})();

export function getMemoryDeckLevelThreshold(level: number): number {
	return MEMORY_DECK_LEVEL_THRESHOLDS[getSafeLevel(level) - 1] ?? 0;
}

export function isMasteredMemoryCard(card: Card): boolean {
	return (
		!!card.fsrs &&
		card.fsrs.state === CardState.Review &&
		(card.fsrs.stability ?? 0) > MEMORY_DECK_MASTERED_STABILITY_THRESHOLD
	);
}

export function countMasteredMemoryCards(cards: Card[]): number {
	let count = 0;
	for (const card of cards) {
		if (isMasteredMemoryCard(card)) {
			count += 1;
		}
	}
	return count;
}

export function getMemoryDeckLevelProgress(experience: number): MemoryDeckLevelProgress {
	const safeExperience = Math.max(0, Math.floor(Number.isFinite(experience) ? experience : 0));
	let level = 1;

	for (let candidateLevel = MEMORY_DECK_MAX_LEVEL; candidateLevel >= 1; candidateLevel -= 1) {
		if (safeExperience >= getMemoryDeckLevelThreshold(candidateLevel)) {
			level = candidateLevel;
			break;
		}
	}

	const isMaxLevel = level >= MEMORY_DECK_MAX_LEVEL;
	const currentLevelThreshold = getMemoryDeckLevelThreshold(level);
	const nextLevelThreshold = isMaxLevel
		? currentLevelThreshold
		: getMemoryDeckLevelThreshold(level + 1);
	const levelSpan = Math.max(0, nextLevelThreshold - currentLevelThreshold);
	const experienceIntoLevel = isMaxLevel ? levelSpan : Math.max(0, safeExperience - currentLevelThreshold);
	const experienceNeededForNextLevel = isMaxLevel ? 0 : Math.max(0, nextLevelThreshold - safeExperience);
	const progressPercent = isMaxLevel
		? 100
		: levelSpan > 0
			? Math.max(0, Math.min(100, Math.round((experienceIntoLevel / levelSpan) * 100)))
			: 0;

	return {
		level,
		experience: safeExperience,
		masteredCardCount: safeExperience,
		currentLevelThreshold,
		nextLevelThreshold,
		experienceIntoLevel,
		experienceNeededForNextLevel,
		levelSpan,
		progressPercent,
		isMaxLevel,
	};
}

export function getMemoryDeckLevelProgressFromCards(cards: Card[]): MemoryDeckLevelProgress {
	return getMemoryDeckLevelProgress(countMasteredMemoryCards(cards));
}
