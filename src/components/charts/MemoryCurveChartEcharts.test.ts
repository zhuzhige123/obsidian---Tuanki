import { render, waitFor } from '@testing-library/svelte';
import type { MemoryCurveData } from '../../types/view-card-modal-types';

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
    },
    graphic: {
      LinearGradient: class LinearGradient {
        constructor(..._args: unknown[]) {}
      }
    }
  }
}));

import MemoryCurveChartEcharts from './MemoryCurveChartEcharts.svelte';

function createData(multiplier = 1): MemoryCurveData {
  return {
    predicted: [
      { day: 0, retrievability: 100, isActual: false },
      { day: 3 * multiplier, retrievability: 82, isActual: false }
    ],
    actual: [
      { day: 1 * multiplier, retrievability: 96, isActual: true },
      { day: 2 * multiplier, retrievability: 88, isActual: true }
    ],
    reviewMarkers: [
      { day: 1 * multiplier, retrievability: 96, rating: 3 }
    ]
  };
}

describe('MemoryCurveChartEcharts', () => {
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

  afterEach(() => {
    document.body.className = '';
  });

  it('renders the chart and refreshes setOption after props updates', async () => {
    const rendered = render(MemoryCurveChartEcharts, {
      props: {
        data: createData(),
        height: 360
      }
    });

    await waitFor(() => {
      expect(echartsMocks.init).toHaveBeenCalledTimes(1);
      expect(echartsMocks.setOption).toHaveBeenCalledTimes(1);
    });

    await rendered.rerender({
      data: createData(2),
      height: 360
    });

    await waitFor(() => {
      expect(echartsMocks.setOption).toHaveBeenCalledTimes(2);
    });
  });

  it('re-renders the chart when the Obsidian theme class changes', async () => {
    render(MemoryCurveChartEcharts, {
      props: {
        data: createData(),
        height: 360
      }
    });

    await waitFor(() => {
      expect(echartsMocks.setOption).toHaveBeenCalledTimes(1);
    });

    document.body.classList.add('theme-dark');

    await waitFor(() => {
      expect(echartsMocks.setOption).toHaveBeenCalledTimes(2);
    });
  });
});
