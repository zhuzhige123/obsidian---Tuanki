import { IRCognitiveProfileService } from "./IRCognitiveProfileService";
import type { IRPlannedDay, IRPlannedScheduleItem } from "./IRScheduleKernel";

export interface IRPlanGeneratorOptions {
	horizonDays?: number;
	dailyBudgetMinutes?: number;
	freezeWindowHours?: number;
	loadSmoothingPenalty?: number;
	volatilityPenaltyFactor?: number;
	continuityBonus?: number;
	enableInterleaving?: boolean;
	maxConsecutiveSameTopic?: number;
}

interface IRPlanningContext {
	dailyBudgetMinutes: number;
	targetDailyLoad: number;
	freezeWindowHours: number;
	loadSmoothingPenalty: number;
	volatilityPenaltyFactor: number;
	continuityBonus: number;
	enableInterleaving: boolean;
	maxConsecutiveSameTopic: number;
}

interface IRPlanningOrigin {
	originalReviewDate: Date;
	originalDayKey: string;
	frozenUntilOriginalDay: boolean;
}

function isPinnedToOriginalDay(item: IRPlannedScheduleItem, origin: IRPlanningOrigin | undefined, day: Date): boolean {
	return Boolean(
		origin?.frozenUntilOriginalDay && formatDateKey(day) === origin.originalDayKey && item.sourceSequenceAnchorDateKey
	);
}

interface IRCandidateEvaluation {
	utility: number;
	loadPenalty: number;
	fatiguePenalty: number;
	volatilityPenalty: number;
	interleavePenalty: number;
	tagGroupBoost: number;
	carryoverRecoveryBoost: number;
}

interface IRMoveCandidate {
	item: IRPlannedScheduleItem;
	destinationEvaluation: IRCandidateEvaluation;
	utilityDelta: number;
}

interface IRPlanningCursor {
	lastSourceFile: string | null;
	lastTopicKey: string | null;
	sameTopicRunLength: number;
}

function formatDateKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate()
	).padStart(2, "0")}`;
}

function startOfDay(date: Date): Date {
	const normalized = new Date(date);
	normalized.setHours(0, 0, 0, 0);
	return normalized;
}

function clampScore(value: number, min = 0, max = 10): number {
	return Math.max(min, Math.min(max, value));
}

function roundScore(value: number): number {
	return Math.round(value * 10) / 10;
}

function diffDays(target: Date, base: Date): number {
	return Math.round(
		(startOfDay(target).getTime() - startOfDay(base).getTime()) / (24 * 60 * 60 * 1000)
	);
}

function computeOverloadLevel(totalEstimatedMinutes: number): "normal" | "warning" | "overloaded" {
	if (totalEstimatedMinutes >= 60) return "overloaded";
	if (totalEstimatedMinutes >= 40) return "warning";
	return "normal";
}

function isInitialSequenceLockedForDay(item: IRPlannedScheduleItem, dayKey: string): boolean {
	return Boolean(
		item.sourceSequenceLocked &&
			item.sourceSequenceGroup &&
			typeof item.sourceSequenceOrder === "number" &&
			item.sourceSequenceAnchorDateKey &&
			item.sourceSequenceAnchorDateKey === dayKey
	);
}

function compareInitialSequenceWithinDay(
	left: IRPlannedScheduleItem,
	right: IRPlannedScheduleItem,
	dayKey: string
): number {
	if (!isInitialSequenceLockedForDay(left, dayKey) || !isInitialSequenceLockedForDay(right, dayKey)) {
		return 0;
	}
	if (left.sourceSequenceGroup !== right.sourceSequenceGroup) {
		return 0;
	}
	return Number(left.sourceSequenceOrder || 0) - Number(right.sourceSequenceOrder || 0);
}

export class IRPlanGeneratorService {
	private profileService: IRCognitiveProfileService;

	constructor(profileService = new IRCognitiveProfileService()) {
		this.profileService = profileService;
	}

	generatePlan(
		items: IRPlannedScheduleItem[],
		options?: IRPlanGeneratorOptions
	): { days: IRPlannedDay[]; itemsByDate: Map<string, IRPlannedScheduleItem[]> } {
		const horizonDays = options?.horizonDays ?? 7;
		const dailyBudgetMinutes = options?.dailyBudgetMinutes ?? 45;
		const freezeWindowHours = options?.freezeWindowHours ?? 24;
		const loadSmoothingPenalty = options?.loadSmoothingPenalty ?? 1.2;
		const volatilityPenaltyFactor = options?.volatilityPenaltyFactor ?? 1.6;
		const continuityBonus = options?.continuityBonus ?? 0.6;
		const enableInterleaving = options?.enableInterleaving ?? true;
		const maxConsecutiveSameTopic = Math.max(1, options?.maxConsecutiveSameTopic ?? 3);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const horizonEnd = new Date(today);
		horizonEnd.setDate(horizonEnd.getDate() + horizonDays - 1);

		const nearTerm: IRPlannedScheduleItem[] = [];
		const farFuture: IRPlannedScheduleItem[] = [];

		const origins = new Map<string, IRPlanningOrigin>();

		for (const item of items) {
			const anchorDate = item.sourceSequenceAnchorDateKey
				? startOfDay(new Date(`${item.sourceSequenceAnchorDateKey}T00:00:00`))
				: null;
			const targetDate = anchorDate && !Number.isNaN(anchorDate.getTime())
				? anchorDate
				: startOfDay(item.nextReviewDate ?? today);
			const hoursUntilOriginalDay = (targetDate.getTime() - today.getTime()) / (60 * 60 * 1000);
			origins.set(item.id, {
				originalReviewDate: targetDate,
				originalDayKey: formatDateKey(targetDate),
				frozenUntilOriginalDay:
					item.sourceSequenceLocked && item.sourceSequenceAnchorDateKey
						? hoursUntilOriginalDay >= 0
						: hoursUntilOriginalDay >= 0 && hoursUntilOriginalDay <= freezeWindowHours,
			});

			if (targetDate <= horizonEnd) {
				nearTerm.push({
					...item,
					explanation: {
						...item.explanation,
						scoreBreakdown: { ...item.explanation.scoreBreakdown },
					},
				});
			} else {
				farFuture.push(item);
			}
		}

		const assigned = new Set<string>();
		const itemsByDate = new Map<string, IRPlannedScheduleItem[]>();
		const totalNearTermMinutes = nearTerm.reduce((sum, item) => sum + item.estimatedMinutes, 0);
		const targetDailyLoad =
			horizonDays > 0
				? Math.min(
						dailyBudgetMinutes,
						Math.max(
							Math.min(dailyBudgetMinutes * 0.55, dailyBudgetMinutes),
							totalNearTermMinutes / horizonDays
						)
				  )
				: dailyBudgetMinutes;
		const planningContext: IRPlanningContext = {
			dailyBudgetMinutes,
			targetDailyLoad,
			freezeWindowHours,
			loadSmoothingPenalty,
			volatilityPenaltyFactor,
			continuityBonus,
			enableInterleaving,
			maxConsecutiveSameTopic,
		};

		for (let offset = 0; offset < horizonDays; offset++) {
			const day = new Date(today);
			day.setDate(day.getDate() + offset);
			const dayKey = formatDateKey(day);
			const endOfDay = new Date(day);
			endOfDay.setHours(23, 59, 59, 999);

			const dueCandidates = nearTerm
				.filter((item) => !assigned.has(item.id))
				.filter((item) => !item.nextReviewDate || item.nextReviewDate <= endOfDay);

			let currentLoad = 0;
			const selected: IRPlannedScheduleItem[] = [];
			let cursor: IRPlanningCursor = {
				lastSourceFile: null,
				lastTopicKey: null,
				sameTopicRunLength: 0,
			};

			({ currentLoad, cursor } = this.scheduleCandidatesForDay(
				dueCandidates,
				day,
				currentLoad,
				cursor,
				selected,
				assigned,
				origins,
				planningContext
			));

			if (selected.length > 0) {
				itemsByDate.set(dayKey, selected);
			}
		}

		for (const item of nearTerm) {
			if (assigned.has(item.id)) continue;
			const overflowDate = new Date(horizonEnd);
			const overflowKey = formatDateKey(overflowDate);
			item.nextReviewDate = overflowDate;
			item.nextRepDate = overflowDate.getTime();
			const list = itemsByDate.get(overflowKey) || [];
			list.push(item);
			itemsByDate.set(overflowKey, list);
		}

		for (const item of farFuture) {
			const dateKey = formatDateKey(item.nextReviewDate || today);
			const list = itemsByDate.get(dateKey) || [];
			list.push(item);
			itemsByDate.set(dateKey, list);
		}

		this.rebalanceAdjacentDays(itemsByDate, today, horizonDays, origins, planningContext);

		const days = Array.from(itemsByDate.entries())
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([dateKey, dayItems]) => {
				const totalEstimatedMinutes = dayItems.reduce(
					(sum, item) => sum + item.estimatedMinutes,
					0
				);
				const sortedItems = [...dayItems].sort(
					(a, b) => {
						const sequenceCompare = compareInitialSequenceWithinDay(a, b, dateKey);
						if (sequenceCompare !== 0) {
							return sequenceCompare;
						}
						return (b.explanation.compositeScore ?? 0) - (a.explanation.compositeScore ?? 0);
					}
				);
				return {
					dateKey,
					items: sortedItems,
					totalEstimatedMinutes,
					overloadLevel: computeOverloadLevel(totalEstimatedMinutes),
				} satisfies IRPlannedDay;
			});

		const normalized = new Map<string, IRPlannedScheduleItem[]>();
		for (const day of days) {
			normalized.set(day.dateKey, [...day.items]);
		}

		return { days, itemsByDate: normalized };
	}

	private scheduleCandidatesForDay(
		candidates: IRPlannedScheduleItem[],
		day: Date,
		currentLoad: number,
		cursor: IRPlanningCursor,
		selected: IRPlannedScheduleItem[],
		assigned: Set<string>,
		origins: Map<string, IRPlanningOrigin>,
		context: IRPlanningContext
	): { currentLoad: number; cursor: IRPlanningCursor } {
		const dayKey = formatDateKey(day);
		while (candidates.length > 0) {
			const selectableCandidates = candidates.filter(
				(candidate) => !this.hasPendingInitialSequencePredecessor(candidate, candidates, dayKey)
			);
			const evaluationPool = selectableCandidates.length > 0 ? selectableCandidates : candidates;
			const candidateTopicCounts = this.buildTopicCounts(evaluationPool);
			evaluationPool.sort((a, b) => {
				const sequenceCompare = compareInitialSequenceWithinDay(a, b, dayKey);
				if (sequenceCompare !== 0) return sequenceCompare;
				const aEvaluation = this.evaluateCandidateForDay(
					a,
					day,
					currentLoad,
					cursor,
					candidateTopicCounts,
					origins,
					context
				);
				const bEvaluation = this.evaluateCandidateForDay(
					b,
					day,
					currentLoad,
					cursor,
					candidateTopicCounts,
					origins,
					context
				);
				const aUtility = aEvaluation.utility;
				const bUtility = bEvaluation.utility;
				if (bUtility !== aUtility) return bUtility - aUtility;
				if (bEvaluation.carryoverRecoveryBoost !== aEvaluation.carryoverRecoveryBoost) {
					return bEvaluation.carryoverRecoveryBoost - aEvaluation.carryoverRecoveryBoost;
				}
				if (bEvaluation.tagGroupBoost !== aEvaluation.tagGroupBoost) {
					return bEvaluation.tagGroupBoost - aEvaluation.tagGroupBoost;
				}
				return (b.priority || 0) - (a.priority || 0);
			});

			const next = evaluationPool[0];
			if (!next) break;
			const nextIndex = candidates.findIndex((candidate) => candidate.id === next.id);
			if (nextIndex < 0) {
				break;
			}
			candidates.splice(nextIndex, 1);

			const evaluation = this.evaluateCandidateForDay(
				next,
				day,
				currentLoad,
				cursor,
				candidateTopicCounts,
				origins,
				context
			);
			const origin = origins.get(next.id);

			if (!this.canAssignCandidateToDay(currentLoad, next, context.dailyBudgetMinutes, origin, day)) {
				continue;
			}

			currentLoad += next.estimatedMinutes;
			next.nextReviewDate = new Date(day);
			next.nextRepDate = next.nextReviewDate.getTime();
			next.explanation.scoreBreakdown.loadPenalty = evaluation.loadPenalty;
			next.explanation.scoreBreakdown.fatiguePenalty = evaluation.fatiguePenalty;
			next.explanation.scoreBreakdown.volatilityPenalty = evaluation.volatilityPenalty;
			next.explanation.compositeScore = evaluation.utility;
			selected.push(next);
			assigned.add(next.id);
			cursor = this.advanceCursor(cursor, next);
		}

		return { currentLoad, cursor };
	}

	private hasPendingInitialSequencePredecessor(
		candidate: IRPlannedScheduleItem,
		candidates: IRPlannedScheduleItem[],
		dayKey: string
	): boolean {
		if (!isInitialSequenceLockedForDay(candidate, dayKey)) {
			return false;
		}

		return candidates.some((other) => {
			if (other.id === candidate.id) {
				return false;
			}
			if (!isInitialSequenceLockedForDay(other, dayKey)) {
				return false;
			}
			if (other.sourceSequenceGroup !== candidate.sourceSequenceGroup) {
				return false;
			}
			return Number(other.sourceSequenceOrder || 0) < Number(candidate.sourceSequenceOrder || 0);
		});
	}

	private canAssignCandidateToDay(
		currentLoad: number,
		item: IRPlannedScheduleItem,
		dailyBudgetMinutes: number,
		origin?: IRPlanningOrigin,
		day?: Date
	): boolean {
		if (origin && day && isPinnedToOriginalDay(item, origin, day)) {
			return true;
		}
		const projectedLoad = currentLoad + item.estimatedMinutes;
		const allowOverflow =
			currentLoad > 0 &&
			dailyBudgetMinutes > 0 &&
			currentLoad / dailyBudgetMinutes >= 0.8 &&
			projectedLoad <= dailyBudgetMinutes * 1.15;
		return projectedLoad <= dailyBudgetMinutes || allowOverflow || currentLoad === 0;
	}

	private evaluateCandidateForDay(
		item: IRPlannedScheduleItem,
		day: Date,
		currentLoad: number,
		cursor: IRPlanningCursor,
		candidateTopicCounts: Map<string, number>,
		origins: Map<string, IRPlanningOrigin>,
		context: IRPlanningContext
	): IRCandidateEvaluation {
		const origin = origins.get(item.id) ?? {
			originalReviewDate: startOfDay(item.nextReviewDate ?? day),
			originalDayKey: formatDateKey(item.nextReviewDate ?? day),
			frozenUntilOriginalDay: false,
		};
		const dayShift = diffDays(day, origin.originalReviewDate);
		const projectedLoad = currentLoad + item.estimatedMinutes;
		const loadRatio =
			context.dailyBudgetMinutes > 0 ? projectedLoad / context.dailyBudgetMinutes : 0;
		const overloadDelta = Math.max(0, projectedLoad - context.targetDailyLoad);
		const smoothingPenalty =
			context.dailyBudgetMinutes > 0
				? Math.min(
						3,
						(overloadDelta / context.dailyBudgetMinutes) * 4 * context.loadSmoothingPenalty
				  )
				: 0;
		const freezePenalty = origin.frozenUntilOriginalDay && dayShift !== 0 ? 8 : 0;
		const postponePenalty = dayShift > 0 ? dayShift * context.volatilityPenaltyFactor : 0;
		const manualSchedulePenalty = item.explanation.hasManualSchedule && dayShift > 0 ? 0.8 : 0;
		const volatilityPenalty = clampScore(freezePenalty + postponePenalty + manualSchedulePenalty);
		const fatiguePenalty = clampScore(
			projectedLoad >= context.dailyBudgetMinutes * 0.8 && item.estimatedMinutes >= 8
				? item.explanation.scoreBreakdown.fatiguePenalty + 1.2
				: item.explanation.scoreBreakdown.fatiguePenalty
		);
		const baseUtility = this.profileService.computeUtility(item.explanation.scoreBreakdown as any, {
			loadRatio,
			fatiguePenalty,
			volatilityPenalty,
		});
		const tagGroupBoost = item.tagGroupPriorityBias ?? 0;
		const continuityBoost =
			cursor.lastSourceFile && cursor.lastSourceFile === item.sourceFile
				? context.continuityBonus
				: 0;
		const carryoverRecoveryBoost = this.calculateCarryoverRecoveryBoost(item, dayShift, origin);
		const interleavePenalty = this.calculateInterleavePenalty(
			item,
			dayShift,
			cursor,
			candidateTopicCounts,
			context
		);
		const scheduleFidelityBoost =
			dayShift === 0
				? origin.frozenUntilOriginalDay
					? 1.2
					: item.explanation.hasManualSchedule
					? 0.6
					: 0.2
				: 0;
		const utility = roundScore(
			clampScore(
				baseUtility +
					continuityBoost +
					scheduleFidelityBoost +
					tagGroupBoost +
					carryoverRecoveryBoost -
					smoothingPenalty -
					interleavePenalty
			)
		);
		const loadPenalty = roundScore(clampScore(loadRatio * 4 + smoothingPenalty));

		return {
			utility,
			loadPenalty,
			fatiguePenalty: roundScore(fatiguePenalty),
			volatilityPenalty: roundScore(volatilityPenalty),
			interleavePenalty,
			tagGroupBoost: roundScore(tagGroupBoost),
			carryoverRecoveryBoost: roundScore(carryoverRecoveryBoost),
		};
	}

	private calculateCarryoverRecoveryBoost(
		item: IRPlannedScheduleItem,
		dayShift: number,
		origin: IRPlanningOrigin
	): number {
		if (dayShift <= 0 || origin.frozenUntilOriginalDay) {
			return 0;
		}

		const carryoverDepthBoost = dayShift * 1.7;
		const overdueBoost = item.explanation.isOverdue ? 0.35 : 0;
		const stalenessBoost = Math.min(
			0.55,
			Math.max(0, (item.explanation.scoreBreakdown.stalenessScore ?? 0) - 1.5) * 0.18
		);
		const priorityProtectionBoost = item.priority >= 7 ? 0 : 0.15;
		const manualScheduleRelief = item.explanation.hasManualSchedule ? 0.95 : 0.35;
		return roundScore(
			Math.min(
				3.1,
				carryoverDepthBoost +
					overdueBoost +
					stalenessBoost +
					priorityProtectionBoost +
					manualScheduleRelief
			)
		);
	}

	private buildTopicCounts(items: IRPlannedScheduleItem[]): Map<string, number> {
		const counts = new Map<string, number>();
		for (const item of items) {
			counts.set(item.topicKey, (counts.get(item.topicKey) || 0) + 1);
		}
		return counts;
	}

	private advanceCursor(cursor: IRPlanningCursor, item: IRPlannedScheduleItem): IRPlanningCursor {
		if (cursor.lastTopicKey === item.topicKey) {
			return {
				lastSourceFile: item.sourceFile,
				lastTopicKey: item.topicKey,
				sameTopicRunLength: cursor.sameTopicRunLength + 1,
			};
		}

		return {
			lastSourceFile: item.sourceFile,
			lastTopicKey: item.topicKey,
			sameTopicRunLength: 1,
		};
	}

	private getTailCursor(items: IRPlannedScheduleItem[]): IRPlanningCursor {
		const tail = items[items.length - 1];
		if (!tail) {
			return {
				lastSourceFile: null,
				lastTopicKey: null,
				sameTopicRunLength: 0,
			};
		}

		let sameTopicRunLength = 1;
		for (let index = items.length - 2; index >= 0; index--) {
			if (items[index].topicKey !== tail.topicKey) {
				break;
			}
			sameTopicRunLength += 1;
		}

		return {
			lastSourceFile: tail.sourceFile,
			lastTopicKey: tail.topicKey,
			sameTopicRunLength,
		};
	}

	private calculateInterleavePenalty(
		item: IRPlannedScheduleItem,
		dayShift: number,
		cursor: IRPlanningCursor,
		candidateTopicCounts: Map<string, number>,
		context: IRPlanningContext
	): number {
		if (!context.enableInterleaving) {
			return 0;
		}
		if (!cursor.lastTopicKey || cursor.lastTopicKey !== item.topicKey) {
			return 0;
		}
		if (!this.hasAlternativeTopic(candidateTopicCounts, item.topicKey)) {
			return 0;
		}
		if (item.explanation.isOverdue) {
			return 0;
		}

		const overflow = cursor.sameTopicRunLength + 1 - context.maxConsecutiveSameTopic;
		if (overflow <= 0) {
			return 0;
		}

		let penalty = Math.min(2.7, overflow * 0.9);
		if (dayShift < 0) {
			penalty *= 0.7;
		}
		if (item.priority >= 8 || item.explanation.scoreBreakdown.urgencyScore >= 6.5) {
			penalty *= 0.4;
		} else if (item.priority >= 7) {
			penalty *= 0.7;
		}

		return roundScore(penalty);
	}

	private hasAlternativeTopic(candidateTopicCounts: Map<string, number>, topicKey: string): boolean {
		for (const [candidateTopic, count] of candidateTopicCounts.entries()) {
			if (candidateTopic !== topicKey && count > 0) {
				return true;
			}
		}
		return false;
	}

	private incrementTopicCount(
		candidateTopicCounts: Map<string, number>,
		topicKey: string
	): Map<string, number> {
		const next = new Map(candidateTopicCounts);
		next.set(topicKey, (next.get(topicKey) || 0) + 1);
		return next;
	}

	private rebalanceAdjacentDays(
		itemsByDate: Map<string, IRPlannedScheduleItem[]>,
		today: Date,
		horizonDays: number,
		origins: Map<string, IRPlanningOrigin>,
		context: IRPlanningContext
	): void {
		if (horizonDays <= 1) return;

		for (let offset = 0; offset < horizonDays - 1; offset++) {
			const currentDay = new Date(today);
			currentDay.setDate(currentDay.getDate() + offset);
			const nextDay = new Date(today);
			nextDay.setDate(nextDay.getDate() + offset + 1);
			this.smoothDayPair(itemsByDate, currentDay, nextDay, origins, context);
		}
	}

	private smoothDayPair(
		itemsByDate: Map<string, IRPlannedScheduleItem[]>,
		sourceDay: Date,
		destinationDay: Date,
		origins: Map<string, IRPlanningOrigin>,
		context: IRPlanningContext
	): void {
		const sourceKey = formatDateKey(sourceDay);
		const destinationKey = formatDateKey(destinationDay);
		const sourceItems = itemsByDate.get(sourceKey);
		if (!sourceItems || sourceItems.length <= 1) return;

		const destinationItems = itemsByDate.get(destinationKey) || [];
		let sourceLoad = sourceItems.reduce((sum, item) => sum + item.estimatedMinutes, 0);
		let destinationLoad = destinationItems.reduce((sum, item) => sum + item.estimatedMinutes, 0);

		const sourceNeedsRelief =
			sourceLoad > context.dailyBudgetMinutes ||
			sourceLoad > context.targetDailyLoad + Math.max(4, context.dailyBudgetMinutes * 0.15);
		const destinationCanAccept =
			destinationLoad < context.dailyBudgetMinutes || destinationLoad < context.targetDailyLoad;

		if (!sourceNeedsRelief || !destinationCanAccept) return;

		while (true) {
			const moveCandidate = this.findBestMoveCandidate(
				sourceItems,
				destinationItems,
				sourceDay,
				destinationDay,
				sourceLoad,
				destinationLoad,
				origins,
				context
			);
			if (!moveCandidate) break;

			const itemIndex = sourceItems.findIndex((item) => item.id === moveCandidate.item.id);
			if (itemIndex < 0) break;

			sourceItems.splice(itemIndex, 1);
			moveCandidate.item.nextReviewDate = new Date(destinationDay);
			moveCandidate.item.nextRepDate = moveCandidate.item.nextReviewDate.getTime();
			moveCandidate.item.explanation.scoreBreakdown.loadPenalty =
				moveCandidate.destinationEvaluation.loadPenalty;
			moveCandidate.item.explanation.scoreBreakdown.fatiguePenalty =
				moveCandidate.destinationEvaluation.fatiguePenalty;
			moveCandidate.item.explanation.scoreBreakdown.volatilityPenalty =
				moveCandidate.destinationEvaluation.volatilityPenalty;
			moveCandidate.item.explanation.compositeScore = moveCandidate.destinationEvaluation.utility;
			destinationItems.push(moveCandidate.item);

			sourceLoad -= moveCandidate.item.estimatedMinutes;
			destinationLoad += moveCandidate.item.estimatedMinutes;

			if (sourceItems.length === 0) {
				itemsByDate.delete(sourceKey);
			} else {
				itemsByDate.set(sourceKey, sourceItems);
			}
			itemsByDate.set(destinationKey, destinationItems);

			const stillNeedsRelief =
				sourceLoad > context.dailyBudgetMinutes ||
				sourceLoad > context.targetDailyLoad + Math.max(4, context.dailyBudgetMinutes * 0.15);
			const stillCanAccept =
				destinationLoad < context.dailyBudgetMinutes * 1.05 &&
				destinationLoad <= context.targetDailyLoad + Math.max(6, context.dailyBudgetMinutes * 0.2);
			if (!stillNeedsRelief || !stillCanAccept) {
				break;
			}
		}
	}

	private findBestMoveCandidate(
		sourceItems: IRPlannedScheduleItem[],
		destinationItems: IRPlannedScheduleItem[],
		sourceDay: Date,
		destinationDay: Date,
		sourceLoad: number,
		destinationLoad: number,
		origins: Map<string, IRPlanningOrigin>,
		context: IRPlanningContext
	): IRMoveCandidate | null {
		const destinationCursor = this.getTailCursor(destinationItems);
		const destinationTopicCounts = this.buildTopicCounts(destinationItems);
		const candidates = sourceItems
			.map((item): IRMoveCandidate | null => {
				const origin = origins.get(item.id);
				if (origin?.frozenUntilOriginalDay && formatDateKey(sourceDay) === origin.originalDayKey) {
					return null;
				}

				const sourceEvaluation = this.evaluateCandidateForDay(
					item,
					sourceDay,
					Math.max(0, sourceLoad - item.estimatedMinutes),
					{
						lastSourceFile: null,
						lastTopicKey: null,
						sameTopicRunLength: 0,
					},
					this.buildTopicCounts(sourceItems.filter((sourceItem) => sourceItem.id !== item.id)),
					origins,
					context
				);
				const destinationEvaluation = this.evaluateCandidateForDay(
					item,
					destinationDay,
					destinationLoad,
					destinationCursor,
					this.incrementTopicCount(destinationTopicCounts, item.topicKey),
					origins,
					context
				);

				const sourceOverflowAfterMove = Math.max(
					0,
					sourceLoad - item.estimatedMinutes - context.targetDailyLoad
				);
				const destinationOverflowAfterMove = Math.max(
					0,
					destinationLoad + item.estimatedMinutes - context.targetDailyLoad
				);
				const smoothingGain = roundScore(
					(sourceLoad - context.targetDailyLoad - sourceOverflowAfterMove) * 0.08
				);
				const destinationRisk = roundScore(destinationOverflowAfterMove * 0.1);
				const utilityDelta = roundScore(
					destinationEvaluation.utility - sourceEvaluation.utility + smoothingGain - destinationRisk
				);

				if (destinationLoad + item.estimatedMinutes > context.dailyBudgetMinutes * 1.1) {
					return null;
				}
				if (utilityDelta < -0.9) {
					return null;
				}

				return {
					item,
					destinationEvaluation,
					utilityDelta,
				};
			})
			.filter((candidate): candidate is IRMoveCandidate => candidate !== null);

		if (candidates.length === 0) return null;

		candidates.sort((a, b) => {
			if (b.utilityDelta !== a.utilityDelta) return b.utilityDelta - a.utilityDelta;
			return b.item.estimatedMinutes - a.item.estimatedMinutes;
		});

		return candidates[0] ?? null;
	}
}

export function createIRPlanGeneratorService(): IRPlanGeneratorService {
	return new IRPlanGeneratorService();
}
