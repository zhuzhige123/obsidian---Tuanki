import type {
  IRProjectedDayLoad,
  IRProjectedScheduleSummary
} from '../IRProjectedScheduleSummary';

const mockState = vi.hoisted(() => ({
  decks: {} as Record<string, any>,
  blocks: {} as Record<string, any>,
  sources: {} as Record<string, any>,
  chunks: {} as Record<string, any>,
  history: { sessions: [] as any[] },
  studySessions: [] as any[],
  projectedSummary: null as IRProjectedScheduleSummary | null,
  monitoringReport: {
    weeklyAvg: {
      readingMinutes: 20,
      scheduledCount: 4,
      completedCount: 3
    }
  },
  calibration: {
    linkedOutcomeRate: 0.6
  }
}));

vi.mock('../IRStorageService', () => ({
  IRStorageService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    getAllDecks: vi.fn(async () => mockState.decks),
    getAllBlocks: vi.fn(async () => mockState.blocks),
    getAllSources: vi.fn(async () => mockState.sources),
    getAllChunkDataWithSync: vi.fn(async () => mockState.chunks),
    getHistory: vi.fn(async () => mockState.history),
    getStudySessions: vi.fn(async () => mockState.studySessions)
  }))
}));

vi.mock('../IRPdfBookmarkTaskService', () => ({
  IRPdfBookmarkTaskService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    getAllTasks: vi.fn(async () => [])
  }))
}));

vi.mock('../IREpubBookmarkTaskService', () => ({
  IREpubBookmarkTaskService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    getAllTasks: vi.fn(async () => [])
  }))
}));

vi.mock('../IRMonitoringService', () => ({
  IRMonitoringService: vi.fn().mockImplementation(() => ({
    load: vi.fn(),
    getSummaryReport: vi.fn(() => mockState.monitoringReport),
    getDecisionCalibrationSummary: vi.fn(() => mockState.calibration)
  }))
}));

vi.mock('../IRProjectedScheduleSummary', async () => {
  const actual = await vi.importActual<any>('../IRProjectedScheduleSummary');
  return {
    ...actual,
    getProjectedScheduleSummary: vi.fn(async () => mockState.projectedSummary)
  };
});

import { IRAnalyticsService, IR_TIMING_BUCKET_LABELS } from '../IRAnalyticsService';

function createProjectedSummary(): IRProjectedScheduleSummary {
  const dayLoadsByDate = new Map<string, IRProjectedDayLoad>([
    [
      '2026-04-10',
      {
        dateKey: '2026-04-10',
        items: [
          {
            id: 'item-1',
            title: 'Item 1',
            sourceFile: 'Notes/item-1.md',
            topicKey: 'topic-a',
            priority: 6,
            intervalDays: 2,
            scheduleStatus: 'scheduled',
            nextRepDate: new Date('2026-04-10T09:00:00.000Z').getTime(),
            nextReviewDate: new Date('2026-04-10T09:00:00.000Z'),
            estimatedMinutes: 12,
            deckId: 'deck-a',
            sourceType: 'chunk',
            explanation: {} as any
          }
        ],
        totalEstimatedMinutes: 12
      }
    ],
    [
      '2026-04-11',
      {
        dateKey: '2026-04-11',
        items: [
          {
            id: 'item-2',
            title: 'Item 2',
            sourceFile: 'Notes/item-2.md',
            topicKey: 'topic-a',
            priority: 5,
            intervalDays: 3,
            scheduleStatus: 'queued',
            nextRepDate: new Date('2026-04-11T09:00:00.000Z').getTime(),
            nextReviewDate: new Date('2026-04-11T09:00:00.000Z'),
            estimatedMinutes: 8,
            deckId: 'deck-a',
            sourceType: 'chunk',
            explanation: {} as any
          }
        ],
        totalEstimatedMinutes: 8
      }
    ]
  ]);

  return {
    schedule: {
      generatedAt: 1,
      version: 1,
      deckIds: ['deck-a'],
      days: [
        { dateKey: '2026-04-10', items: [], totalEstimatedMinutes: 0, overloadLevel: 'normal' },
        { dateKey: '2026-04-11', items: [], totalEstimatedMinutes: 0, overloadLevel: 'warning' }
      ],
      itemsByDate: new Map(),
      triggerReason: 'ui_refresh'
    },
    dayLoadsByDate,
    dayLoadsByDeckId: new Map()
  };
}

function createService() {
  const pluginMock = {
    settings: {
      incrementalReading: {
        dailyTimeBudgetMinutes: 45
      }
    },
    dataStorage: {
      getAllCards: async () => []
    },
    readingMaterialManager: {
      getAllMaterials: async () => []
    }
  };

  const service = new IRAnalyticsService({
    plugins: {
      getPlugin: (id: string) => (id === 'weave' ? pluginMock : null)
    },
    vault: {}
  } as any);

  (service as any).storage = {
    initialize: vi.fn(),
    getAllDecks: vi.fn(async () => mockState.decks),
    getAllBlocks: vi.fn(async () => mockState.blocks),
    getAllSources: vi.fn(async () => mockState.sources),
    getAllChunkDataWithSync: vi.fn(async () => mockState.chunks),
    getHistory: vi.fn(async () => mockState.history),
    getStudySessions: vi.fn(async () => mockState.studySessions)
  };
  (service as any).pdfService = {
    initialize: vi.fn(),
    getAllTasks: vi.fn(async () => [])
  };
  (service as any).epubService = {
    initialize: vi.fn(),
    getAllTasks: vi.fn(async () => [])
  };
  (service as any).monitoringService = {
    load: vi.fn(),
    getSummaryReport: vi.fn(() => mockState.monitoringReport),
    getDecisionCalibrationSummary: vi.fn(() => mockState.calibration)
  };

  return service;
}

describe('IRAnalyticsService snapshots', () => {
  beforeEach(() => {
    mockState.decks = {
      'deck-a': {
        id: 'deck-a',
        name: '专题 A',
        path: 'deck-path',
        blockIds: []
      }
    };
    mockState.blocks = {};
    mockState.sources = {};
    mockState.chunks = {};
    mockState.history = { sessions: [] };
    mockState.studySessions = [];
    mockState.projectedSummary = createProjectedSummary();
  });

  it('keeps load forecast snapshot consistent with the overall forecast projection', async () => {
    const service = createService();

    const loadForecast = await service.getLoadForecastSnapshot({ days: 2 });
    const overallSnapshot = await service.getSnapshot({ mode: 'overall', days: 2 });

    expect(loadForecast.dailyBudgetMinutes).toBe(45);
    expect(loadForecast.forecast).toEqual(overallSnapshot.forecast);
  });

  it('returns empty load forecast rows when the deck filter is explicitly empty', async () => {
    const service = createService();

    const snapshot = await service.getLoadForecastSnapshot({
      deckIds: [],
      days: 2
    });

    expect(snapshot.forecast).toEqual([
      expect.objectContaining({ itemCount: 0, totalEstimatedMinutes: 0 }),
      expect.objectContaining({ itemCount: 0, totalEstimatedMinutes: 0 })
    ]);
  });

  it('filters study sessions by deck aliases and builds derived scatter summaries', async () => {
    mockState.studySessions = [
      {
        id: 'session-a',
        deckId: 'legacy-id',
        topicId: 'deck-path',
        deckName: '专题 A',
        startTime: '2026-04-10T08:00:00.000Z',
        endTime: '2026-04-10T08:45:00.000Z',
        autoRecordedDuration: 2700,
        confirmedDuration: 2700,
        blocksCompleted: 3,
        cardsCreated: 1
      },
      {
        id: 'session-b',
        deckId: 'deck-b',
        topicId: 'deck-b',
        deckName: '专题 B',
        startTime: '2026-04-11T08:00:00.000Z',
        endTime: '2026-04-11T08:20:00.000Z',
        autoRecordedDuration: 1200,
        confirmedDuration: 1200,
        blocksCompleted: 2,
        cardsCreated: 0
      }
    ];

    const service = createService();
    const snapshot = await service.getStudySessionSnapshot({
      deckIds: ['deck-path']
    });

    expect(snapshot.sessions.map((session) => session.id)).toEqual(['session-a']);
    expect(snapshot.scatter.summary.totalSessions).toBe(1);
    expect(snapshot.heatmap.summary.totalDays).toBe(1);
  });

  it('exposes translated timing bucket labels in the overall analytics snapshot', async () => {
    const service = createService();
    const snapshot = await service.getSnapshot({ mode: 'overall', days: 7 });

    expect(IR_TIMING_BUCKET_LABELS.due_today).toBe('今日到期');
    expect(snapshot.timingBuckets.some((bucket) => bucket.label === '今日到期')).toBe(true);
    expect(snapshot.timingBuckets.some((bucket) => bucket.label === 'Due today')).toBe(false);
  });
});
