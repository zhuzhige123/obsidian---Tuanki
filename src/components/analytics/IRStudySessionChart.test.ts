import { render, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IRStudySessionSnapshot } from '../../services/incremental-reading/IRAnalyticsService';

const echartsMocks = vi.hoisted(() => ({
  init: vi.fn(),
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn()
}));

vi.mock('obsidian', () => ({
  Platform: { isMobile: false }
}));

vi.mock('../../utils/pinch-range-gesture', () => ({
  bindPinchRangeGesture: () => () => {}
}));

vi.mock('../../utils/echarts-loader', () => ({
  default: {
    init(container: HTMLElement) {
      echartsMocks.init(container);
      return {
        setOption: echartsMocks.setOption,
        resize: echartsMocks.resize,
        dispose: echartsMocks.dispose,
        getDom: () => container
      };
    }
  }
}));

import IRStudySessionChart from './IRStudySessionChart.svelte';

function createSnapshot(multiplier = 1): IRStudySessionSnapshot {
  const session = {
    id: `session-${multiplier}`,
    deckId: 'deck-a',
    topicId: 'topic-a',
    deckName: '专题 A',
    startTime: '2026-04-10T10:00:00.000Z',
    endTime: '2026-04-10T10:45:00.000Z',
    autoRecordedDuration: 2700,
    confirmedDuration: 2700,
    blocksCompleted: 3 * multiplier,
    cardsCreated: 2 * multiplier
  };

  return {
    sessions: [session],
    scatter: {
      minDurationSeconds: 60,
      dateAxis: ['2026-04-10'],
      weekdayAxis: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
      dateViewData: [{ value: [10, 0, 45], session }],
      weekdayViewData: [{ value: [10, 5, 45], session }],
      maxDurationMinutes: 45,
      summary: {
        totalSessions: 1,
        totalHours: 0.8,
        averageMinutes: 45
      }
    },
    heatmap: {
      weeks: [],
      monthLabels: [],
      maxMinutes: 45,
      summary: {
        totalBlocks: 3 * multiplier,
        totalMinutes: 45,
        totalDays: 1,
        avgBlocksPerDay: 3,
        currentStreak: 1,
        maxStreak: 1
      }
    }
  };
}

describe('IRStudySessionChart', () => {
  beforeEach(() => {
    echartsMocks.init.mockClear();
    echartsMocks.setOption.mockClear();
    echartsMocks.resize.mockClear();
    echartsMocks.dispose.mockClear();
    document.body.className = '';
    (globalThis as any).ResizeObserver = class ResizeObserver {
      observe() {}
      disconnect() {}
    };
  });

  it('shows the empty state when there is no scatter session data', () => {
    const emptySnapshot: IRStudySessionSnapshot = {
      sessions: [],
      scatter: {
        minDurationSeconds: 60,
        dateAxis: [],
        weekdayAxis: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
        dateViewData: [],
        weekdayViewData: [],
        maxDurationMinutes: 0,
        summary: {
          totalSessions: 0,
          totalHours: 0,
          averageMinutes: 0
        }
      },
      heatmap: {
        weeks: [],
        monthLabels: [],
        maxMinutes: 0,
        summary: {
          totalBlocks: 0,
          totalMinutes: 0,
          totalDays: 0,
          avgBlocksPerDay: 0,
          currentStreak: 0,
          maxStreak: 0
        }
      }
    };

    const rendered = render(IRStudySessionChart, {
      props: {
        snapshot: emptySnapshot
      }
    });

    expect(rendered.getByText('暂无学习会话')).toBeTruthy();
    expect(echartsMocks.init).not.toHaveBeenCalled();
  });

  it('refreshes setOption after props changes and theme changes', async () => {
    const rendered = render(IRStudySessionChart, {
      props: {
        snapshot: createSnapshot()
      }
    });

    await waitFor(() => {
      expect(echartsMocks.init).toHaveBeenCalledTimes(1);
      expect(echartsMocks.setOption).toHaveBeenCalledTimes(1);
    });

    await rendered.rerender({
      snapshot: createSnapshot(2)
    });

    await waitFor(() => {
      expect(echartsMocks.setOption).toHaveBeenCalledTimes(2);
    });

    document.body.classList.add('theme-dark');

    await waitFor(() => {
      expect(echartsMocks.setOption).toHaveBeenCalledTimes(3);
    });
  });
});
