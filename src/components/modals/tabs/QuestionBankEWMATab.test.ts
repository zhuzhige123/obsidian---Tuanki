import { render, waitFor } from '@testing-library/svelte';
import type { QuestionBankAnalyticsSnapshot } from '../../../utils/question-bank-analytics';

const echartsMocks = vi.hoisted(() => ({
  init: vi.fn(),
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn()
}));

vi.mock('obsidian', () => ({
  Platform: { isMobile: false }
}));

vi.mock('../../../utils/pinch-range-gesture', () => ({
  bindPinchRangeGesture: () => () => {}
}));

vi.mock('../../../utils/echarts-loader', () => ({
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

import QuestionBankEWMATab from './QuestionBankEWMATab.svelte';

function createSnapshot(multiplier = 1): QuestionBankAnalyticsSnapshot {
  return {
    ewmaSeries: {
      dates: ['04/10', '04/11'],
      ewmaData: [60, 65 + multiplier],
      historicalData: [100, 50 + multiplier],
      confidenceData: [0.2, 0.3]
    }
  };
}

describe('QuestionBankEWMATab', () => {
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

  it('shows the empty state when no attempts are available', () => {
    const rendered = render(QuestionBankEWMATab, {
      props: {
        snapshot: {
          ewmaSeries: { dates: [], ewmaData: [], historicalData: [], confidenceData: [] }
        },
        isLoading: false
      }
    });

    expect(rendered.getByText('暂无可用的真实答题数据')).toBeTruthy();
    expect(echartsMocks.init).not.toHaveBeenCalled();
  });

  it('refreshes the chart after props updates and theme changes', async () => {
    const rendered = render(QuestionBankEWMATab, {
      props: {
        snapshot: createSnapshot(),
        isLoading: false
      }
    });

    await waitFor(() => {
      expect(echartsMocks.init).toHaveBeenCalledTimes(1);
      expect(echartsMocks.setOption).toHaveBeenCalledTimes(1);
    });

    await rendered.rerender({
      snapshot: createSnapshot(2),
      isLoading: false
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
