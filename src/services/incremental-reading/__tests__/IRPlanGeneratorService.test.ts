vi.mock("obsidian", () => ({
  normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/{2,}/g, "/"),
}));

vi.mock("../../../config/paths", () => ({
  normalizeWeaveParentFolder: (path?: string) => String(path || "").trim(),
  getV2Paths: () => ({
    ir: {
      root: "weave/incremental-reading",
      epub: "weave/incremental-reading/epub-reading",
    },
  }),
  getV2PathsFromApp: () => ({
    ir: {
      root: "weave/incremental-reading",
      epub: "weave/incremental-reading/epub-reading",
    },
  }),
  resolveIRImportFolder: (chunkRoot?: string) => String(chunkRoot || "weave/incremental-reading/chunks"),
}));

import { IRPlanGeneratorService } from '../IRPlanGeneratorService';
import { IRCognitiveProfileService } from '../IRCognitiveProfileService';
import type { IRPlannedScheduleItem } from '../IRScheduleKernel';

describe('IRPlanGeneratorService', () => {
  let planGenerator: IRPlanGeneratorService;
  let profileService: IRCognitiveProfileService;

  beforeEach(() => {
    vi.restoreAllMocks();
    profileService = new IRCognitiveProfileService();
    planGenerator = new IRPlanGeneratorService(profileService);
  });

  function createDate(dayOffset: number): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);
    return date;
  }

  function formatDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function createItem(input: {
    id: string;
    dayOffset: number;
    priority: number;
    estimatedMinutes?: number;
    sourceFile?: string;
    topicKey?: string;
    tagGroupId?: string;
    tagGroupPriorityBias?: number;
    sourceSequenceLocked?: boolean;
    sourceSequenceAnchorDateKey?: string;
  }): IRPlannedScheduleItem {
    const nextReviewDate = createDate(input.dayOffset);
    const estimatedMinutes = input.estimatedMinutes ?? 5;
    const today = createDate(0);
    const profile = profileService.computeProfile({
      scheduleStatus: 'scheduled',
      nextRepDate: nextReviewDate.getTime(),
      manualPriority: input.priority,
      effectivePriority: input.priority,
      intervalDays: 1,
      estimatedMinutes,
      stats: {
        impressions: 1,
      },
      nowMs: today.getTime(),
      continuityHint: 0,
    });
    const overdueDays = nextReviewDate.getTime() < today.getTime()
      ? Math.max(1, Math.round((today.getTime() - nextReviewDate.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    return {
      id: input.id,
      title: input.id,
      sourceFile: input.sourceFile ?? `/test/${input.id}.md`,
      topicKey: input.topicKey ?? `source:${input.sourceFile ?? `/test/${input.id}.md`}`,
      tagGroupId: input.tagGroupId,
      tagGroupPriorityBias: input.tagGroupPriorityBias,
      priority: input.priority,
      intervalDays: 1,
      scheduleStatus: 'scheduled',
      nextRepDate: nextReviewDate.getTime(),
      nextReviewDate,
      estimatedMinutes,
      sourceType: 'chunk',
      sourceSequenceLocked: input.sourceSequenceLocked,
      sourceSequenceAnchorDateKey: input.sourceSequenceAnchorDateKey,
      explanation: {
        primaryReason: 'test',
        secondaryReasons: [],
        manualPriority: input.priority,
        effectivePriority: input.priority,
        isOverdue: overdueDays > 0,
        overdueDays,
        hasManualSchedule: true,
        estimatedMinutes,
        scoreBreakdown: profile,
        compositeScore: profile.compositeScore,
      },
    };
  }

  test('冻结窗口内的原定项目优先保留在原计划日', () => {
    const today = createDate(0);
    const tomorrow = createDate(1);
    const dayAfterTomorrow = createDate(2);
    const plan = planGenerator.generatePlan(
      [
        createItem({ id: 'today-top', dayOffset: 0, priority: 9, estimatedMinutes: 10 }),
        createItem({ id: 'carryover', dayOffset: 0, priority: 7, estimatedMinutes: 10 }),
        createItem({ id: 'tomorrow-slot', dayOffset: 1, priority: 5, estimatedMinutes: 10 }),
      ],
      {
        horizonDays: 3,
        dailyBudgetMinutes: 10,
      }
    );

    expect(plan.itemsByDate.get(formatDateKey(today))?.map(item => item.id)).toEqual(['today-top']);
    expect(plan.itemsByDate.get(formatDateKey(tomorrow))?.map(item => item.id)).toEqual(['tomorrow-slot']);
    expect(plan.itemsByDate.get(formatDateKey(dayAfterTomorrow))?.map(item => item.id)).toEqual(['carryover']);
  });

  test('同源连续性奖励会在分数接近时保持阅读上下文', () => {
    const today = createDate(0);
    const sourceA = '/test/source-a.md';
    const sourceB = '/test/source-b.md';
    const plan = planGenerator.generatePlan(
      [
        createItem({ id: 'a-1', dayOffset: 0, priority: 6, sourceFile: sourceA }),
        createItem({ id: 'a-2', dayOffset: 0, priority: 5, sourceFile: sourceA }),
        createItem({ id: 'b-1', dayOffset: 0, priority: 5.4, sourceFile: sourceB }),
      ],
      {
        horizonDays: 2,
        dailyBudgetMinutes: 10,
        continuityBonus: 0.8,
      }
    );

    expect(plan.itemsByDate.get(formatDateKey(today))?.map(item => item.id)).toEqual(['a-1', 'a-2']);
  });

  test('相邻日期二次平滑会把可移动项目推向次日以缓解过载', () => {
    const tomorrow = createDate(1);
    const dayAfterTomorrow = createDate(2);
    const plan = planGenerator.generatePlan(
      [
        createItem({ id: 'day1-heavy', dayOffset: 1, priority: 8, estimatedMinutes: 6 }),
        createItem({ id: 'day1-movable', dayOffset: 1, priority: 6, estimatedMinutes: 5 }),
      ],
      {
        horizonDays: 4,
        dailyBudgetMinutes: 10,
        freezeWindowHours: 0,
      }
    );

    expect(plan.itemsByDate.get(formatDateKey(tomorrow))?.map(item => item.id)).toEqual(['day1-heavy']);
    expect(plan.itemsByDate.get(formatDateKey(dayAfterTomorrow))?.map(item => item.id)).toEqual(['day1-movable']);
  });

  test('锁定到今天的项目即使超过当天预算也应保留在今天', () => {
    const today = createDate(0);
    const tomorrow = createDate(1);
    const todayKey = formatDateKey(today);
    const plan = planGenerator.generatePlan(
      [
        createItem({
          id: 'auto-sub-1',
          dayOffset: 0,
          priority: 7,
          estimatedMinutes: 12,
          sourceSequenceLocked: true,
          sourceSequenceAnchorDateKey: todayKey,
        }),
        createItem({
          id: 'auto-sub-2',
          dayOffset: 0,
          priority: 6.5,
          estimatedMinutes: 12,
          sourceSequenceLocked: true,
          sourceSequenceAnchorDateKey: todayKey,
        }),
        createItem({ id: 'tomorrow-normal', dayOffset: 1, priority: 5, estimatedMinutes: 10 }),
      ],
      {
        horizonDays: 3,
        dailyBudgetMinutes: 10,
      }
    );

    expect(plan.itemsByDate.get(todayKey)?.map(item => item.id)).toEqual(['auto-sub-1', 'auto-sub-2']);
    expect(plan.itemsByDate.get(formatDateKey(tomorrow))?.map(item => item.id)).toEqual(['tomorrow-normal']);
  });

  test('标签组轻量偏置会在分数接近时影响排序，但不会改变调度单元', () => {
    const today = createDate(0);
    const plan = planGenerator.generatePlan(
      [
        createItem({
          id: 'dense-group',
          dayOffset: 0,
          priority: 5,
          sourceFile: '/test/dense.md',
          topicKey: 'tag:dense',
          tagGroupId: 'dense',
          tagGroupPriorityBias: 0.45,
        }),
        createItem({
          id: 'loose-group',
          dayOffset: 0,
          priority: 5.1,
          sourceFile: '/test/loose.md',
          topicKey: 'tag:loose',
          tagGroupId: 'loose',
          tagGroupPriorityBias: -0.1,
        }),
      ],
      {
        horizonDays: 1,
        dailyBudgetMinutes: 15,
        enableInterleaving: false,
      }
    );

    expect(plan.itemsByDate.get(formatDateKey(today))?.map(item => item.id)).toEqual([
      'dense-group',
      'loose-group',
    ]);
  });

  test('被预算顺延的材料会获得恢复加成，而原计划日材料不会收到这类补偿', () => {
    const today = createDate(0);
    const tomorrow = createDate(1);
    const carryover = createItem({ id: 'carryover', dayOffset: 0, priority: 5, estimatedMinutes: 10 });
    const tomorrowFresh = createItem({ id: 'tomorrow-fresh', dayOffset: 1, priority: 5, estimatedMinutes: 10 });
    const planningContext = {
      dailyBudgetMinutes: 10,
      targetDailyLoad: 10,
      freezeWindowHours: 0,
      loadSmoothingPenalty: 1.2,
      volatilityPenaltyFactor: 1.6,
      continuityBonus: 0.6,
      enableInterleaving: false,
      maxConsecutiveSameTopic: 3,
    };
    const cursor = {
      lastSourceFile: null,
      lastTopicKey: null,
      sameTopicRunLength: 0,
    };
    const topicCounts = new Map<string, number>([
      [carryover.topicKey, 1],
      [tomorrowFresh.topicKey, 1],
    ]);
    const origins = new Map<string, any>([
      [carryover.id, {
        originalReviewDate: today,
        originalDayKey: formatDateKey(today),
        frozenUntilOriginalDay: false,
      }],
      [tomorrowFresh.id, {
        originalReviewDate: tomorrow,
        originalDayKey: formatDateKey(tomorrow),
        frozenUntilOriginalDay: false,
      }],
    ]);

    const carryoverEval = (planGenerator as any).evaluateCandidateForDay(
      carryover,
      tomorrow,
      0,
      cursor,
      topicCounts,
      origins,
      planningContext
    );
    const tomorrowFreshEval = (planGenerator as any).evaluateCandidateForDay(
      tomorrowFresh,
      tomorrow,
      0,
      cursor,
      topicCounts,
      origins,
      planningContext
    );

    expect(carryoverEval.carryoverRecoveryBoost).toBeGreaterThan(0);
    expect(tomorrowFreshEval.carryoverRecoveryBoost).toBe(0);
  });

  test('当天有空位时未来阅读点不会自动前补到今天', () => {
    const today = createDate(0);
    const dayAfterTomorrow = createDate(2);
    const twoDaysAfterTomorrow = createDate(3);
    const plan = planGenerator.generatePlan(
      [
        createItem({ id: 'gap-fill-1', dayOffset: 2, priority: 7, estimatedMinutes: 10 }),
        createItem({ id: 'gap-fill-2', dayOffset: 3, priority: 6, estimatedMinutes: 10 }),
      ],
      {
        horizonDays: 4,
        dailyBudgetMinutes: 10,
      }
    );

    expect(plan.itemsByDate.get(formatDateKey(today))).toBeUndefined();
    expect(plan.itemsByDate.get(formatDateKey(dayAfterTomorrow))?.map(item => item.id)).toEqual(['gap-fill-1']);
    expect(plan.itemsByDate.get(formatDateKey(twoDaysAfterTomorrow))?.map(item => item.id)).toEqual(['gap-fill-2']);
  });

  test('remove_block 重算不会把明天的计划补到今天空位', async () => {
    const today = createDate(0);
    const tomorrow = createDate(1);
    const { IRScheduleKernel } = await import('../IRScheduleKernel');
    const { IRStorageService } = await import('../IRStorageService');
    const { IRPdfBookmarkTaskService } = await import('../IRPdfBookmarkTaskService');
    const { IREpubBookmarkTaskService } = await import('../IREpubBookmarkTaskService');

    vi.spyOn(IRStorageService.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(IRStorageService.prototype, 'getAllDecks').mockResolvedValue({
      'deck-1': {
        id: 'deck-1',
        name: 'Deck 1',
        path: 'deck-1',
      } as any,
    });
    vi.spyOn(IRStorageService.prototype, 'getAllChunkDataWithSync').mockResolvedValue({
      'chunk-tomorrow': {
        chunkId: 'chunk-tomorrow',
        filePath: 'Books/Tomorrow.md',
        deckIds: ['deck-1'],
        priorityEff: 6,
        intervalDays: 1,
        nextRepDate: tomorrow.getTime(),
        scheduleStatus: 'queued',
        stats: {},
        meta: {},
      } as any,
    });
    vi.spyOn(IRPdfBookmarkTaskService.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(IRPdfBookmarkTaskService.prototype, 'getAllTasks').mockResolvedValue([]);
    vi.spyOn(IREpubBookmarkTaskService.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(IREpubBookmarkTaskService.prototype, 'getAllTasks').mockResolvedValue([]);

    const kernel = new IRScheduleKernel({
      plugins: {
        getPlugin: () => null,
      },
    } as any);
    const normalPlan = await kernel.recomputeScheduleForDeck('ui_refresh', {
      deckIds: ['deck-1'],
      horizonDays: 3,
    });
    const removedPlan = await kernel.recomputeScheduleForDeck('remove_block', {
      deckIds: ['deck-1'],
      horizonDays: 3,
    });

    expect(normalPlan.itemsByDate.get(formatDateKey(tomorrow))?.map(item => item.id)).toEqual(['chunk-tomorrow']);
    expect(removedPlan.itemsByDate.get(formatDateKey(today))).toBeUndefined();
    expect(removedPlan.itemsByDate.get(formatDateKey(tomorrow))?.map(item => item.id)).toEqual(['chunk-tomorrow']);
  });

  test('archive_block 重算也不会把未来计划补到今天', async () => {
    const today = createDate(0);
    const tomorrow = createDate(1);
    const dayAfterTomorrow = createDate(2);
    const { IRScheduleKernel } = await import('../IRScheduleKernel');
    const { IRStorageService } = await import('../IRStorageService');
    const { IRPdfBookmarkTaskService } = await import('../IRPdfBookmarkTaskService');
    const { IREpubBookmarkTaskService } = await import('../IREpubBookmarkTaskService');

    vi.spyOn(IRStorageService.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(IRStorageService.prototype, 'getAllDecks').mockResolvedValue({
      'deck-1': {
        id: 'deck-1',
        name: 'Deck 1',
        path: 'deck-1',
      } as any,
    });
    vi.spyOn(IRStorageService.prototype, 'getAllChunkDataWithSync').mockResolvedValue({
      'chunk-tomorrow': {
        chunkId: 'chunk-tomorrow',
        filePath: 'Books/Tomorrow.md',
        deckIds: ['deck-1'],
        priorityEff: 6,
        intervalDays: 1,
        nextRepDate: tomorrow.getTime(),
        scheduleStatus: 'queued',
        stats: {},
        meta: {},
      } as any,
      'chunk-day-after': {
        chunkId: 'chunk-day-after',
        filePath: 'Books/DayAfter.md',
        deckIds: ['deck-1'],
        priorityEff: 6,
        intervalDays: 1,
        nextRepDate: dayAfterTomorrow.getTime(),
        scheduleStatus: 'queued',
        stats: {},
        meta: {},
      } as any,
    });
    vi.spyOn(IRPdfBookmarkTaskService.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(IRPdfBookmarkTaskService.prototype, 'getAllTasks').mockResolvedValue([]);
    vi.spyOn(IREpubBookmarkTaskService.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(IREpubBookmarkTaskService.prototype, 'getAllTasks').mockResolvedValue([]);

    const kernel = new IRScheduleKernel({
      plugins: {
        getPlugin: () => null,
      },
    } as any);
    const normalPlan = await kernel.recomputeScheduleForDeck('ui_refresh', {
      deckIds: ['deck-1'],
      horizonDays: 4,
    });
    const archivedPlan = await kernel.recomputeScheduleForDeck('archive_block', {
      deckIds: ['deck-1'],
      horizonDays: 4,
    });

    expect(normalPlan.itemsByDate.get(formatDateKey(tomorrow))?.map(item => item.id)).toEqual(['chunk-tomorrow']);
    expect(normalPlan.itemsByDate.get(formatDateKey(dayAfterTomorrow))?.map(item => item.id)).toEqual(['chunk-day-after']);
    expect(archivedPlan.itemsByDate.get(formatDateKey(today))).toBeUndefined();
    expect(archivedPlan.itemsByDate.get(formatDateKey(tomorrow))?.map(item => item.id)).toEqual(['chunk-tomorrow']);
    expect(archivedPlan.itemsByDate.get(formatDateKey(dayAfterTomorrow))?.map(item => item.id)).toEqual(['chunk-day-after']);
  });

  test('交错软阈值会在分数接近时优先切换主题，而不是硬切断', () => {
    const today = createDate(0);
    const plan = planGenerator.generatePlan(
      [
        createItem({ id: 'a-1', dayOffset: 0, priority: 6.2, sourceFile: '/test/a.md', topicKey: 'tag:A' }),
        createItem({ id: 'a-2', dayOffset: 0, priority: 5.2, sourceFile: '/test/a.md', topicKey: 'tag:A' }),
        createItem({ id: 'b-1', dayOffset: 0, priority: 5.0, sourceFile: '/test/b.md', topicKey: 'tag:B' }),
      ],
      {
        horizonDays: 1,
        dailyBudgetMinutes: 15,
        continuityBonus: 0.8,
        enableInterleaving: true,
        maxConsecutiveSameTopic: 1,
      }
    );

    expect(plan.itemsByDate.get(formatDateKey(today))?.map(item => item.id)).toEqual(['a-1', 'b-1', 'a-2']);
  });

  test('逾期块不会被交错软阈值强行打断', () => {
    const today = createDate(0);
    const plan = planGenerator.generatePlan(
      [
        createItem({ id: 'a-overdue-1', dayOffset: -2, priority: 8.5, sourceFile: '/test/a.md', topicKey: 'tag:A' }),
        createItem({ id: 'a-overdue-2', dayOffset: -2, priority: 7.8, sourceFile: '/test/a.md', topicKey: 'tag:A' }),
        createItem({ id: 'b-today', dayOffset: 0, priority: 5.2, sourceFile: '/test/b.md', topicKey: 'tag:B' }),
      ],
      {
        horizonDays: 1,
        dailyBudgetMinutes: 15,
        continuityBonus: 0.8,
        enableInterleaving: true,
        maxConsecutiveSameTopic: 1,
      }
    );

    expect(plan.itemsByDate.get(formatDateKey(today))?.map(item => item.id)).toEqual([
      expect.stringMatching(/^a-overdue-/),
      expect.stringMatching(/^a-overdue-/),
      'b-today',
    ]);
  });
});
