import { render, fireEvent } from '@testing-library/svelte';
import SidebarNavHeader from './SidebarNavHeader.svelte';
import { Menu } from 'obsidian';
import type { MenuItem as MockMenuItem } from '../../tests/mocks/obsidian';

type TrackingMenuInstance = Menu & {
  findItemByTitle(title: string): MockMenuItem | undefined;
};

const menuInstances: TrackingMenuInstance[] = [];
const premiumFeatureIds = vi.hoisted(() => new Set([
  'incremental-reading',
  'question-bank',
  'grid-view',
  'kanban-view',
  'timeline-view'
]));
const premiumMockState = vi.hoisted(() => ({
  isPremium: false,
  showPreview: false,
  blockedFeatures: new Set<string>()
}));
const mockPremiumGuard = vi.hoisted(() => {
  const createStore = <T, K extends 'isPremium' | 'showPreview'>(key: K) => ({
    subscribe: vi.fn((callback: (value: T) => void) => {
      callback(premiumMockState[key] as T);
      return () => {};
    }),
    set: vi.fn(),
    update: vi.fn()
  });

  const canUseFeature = vi.fn((featureId: string) => {
    if (!premiumFeatureIds.has(featureId)) {
      return true;
    }

    return premiumMockState.isPremium && !premiumMockState.blockedFeatures.has(featureId);
  });

  return {
    canUseFeature,
    isFeatureRestricted: vi.fn((featureId: string) => {
      if (!premiumFeatureIds.has(featureId)) {
        return false;
      }

      return !canUseFeature(featureId);
    }),
    shouldShowFeatureEntry: vi.fn((featureId: string) => {
      if (!premiumFeatureIds.has(featureId)) {
        return true;
      }

      return premiumMockState.isPremium || premiumMockState.showPreview;
    }),
    isPremiumActive: createStore<boolean, 'isPremium'>('isPremium'),
    premiumFeaturesPreviewEnabled: createStore<boolean, 'showPreview'>('showPreview'),
    setPremiumFeaturesPreview: vi.fn()
  };
});

vi.mock('obsidian', async () => {
  const actual = await vi.importActual<typeof import('../../tests/mocks/obsidian')>('../../tests/mocks/obsidian');

  class TrackingMenu extends actual.Menu {
    constructor() {
      super();
      menuInstances.push(this as unknown as TrackingMenuInstance);
    }
  }

  return {
    ...actual,
    Menu: TrackingMenu
  };
});

vi.mock('../../services/premium/PremiumFeatureGuard', () => {
  return {
    PremiumFeatureGuard: {
      getInstance: vi.fn(() => mockPremiumGuard)
    },
    PREMIUM_FEATURES: {
      INCREMENTAL_READING: 'incremental-reading',
      QUESTION_BANK: 'question-bank',
      GRID_VIEW: 'grid-view',
      KANBAN_VIEW: 'kanban-view',
      TIMELINE_VIEW: 'timeline-view'
    }
  };
});

vi.mock('../../utils/i18n', () => ({
  tr: {
    subscribe: (callback: (translator: (key: string) => string) => void) => {
      callback((key: string) => key);
      return () => {};
    }
  }
}));

describe('SidebarNavHeader desktop menu dedupe', () => {
  const mockOnNavigate = vi.fn();
  const mockOnViewChange = vi.fn();
  const mockOnCardDataSourceChange = vi.fn();

  beforeEach(() => {
    menuInstances.length = 0;
    premiumMockState.isPremium = false;
    premiumMockState.showPreview = false;
    premiumMockState.blockedFeatures.clear();
    vi.clearAllMocks();
  });

  it('keeps desktop deck-study dots responsive across repeated clicks', async () => {
    premiumMockState.isPremium = true;

    const onFilterSelect = vi.fn();
    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'deck-study',
        selectedFilter: 'memory',
        onNavigate: mockOnNavigate,
        onFilterSelect
      }
    });

    const dots = container.querySelectorAll('.sidebar-dot');
    expect(dots).toHaveLength(3);

    await fireEvent.click(dots[0]);
    await fireEvent.click(dots[2]);

    expect(onFilterSelect).toHaveBeenNthCalledWith(1, 'incremental-reading');
    expect(onFilterSelect).toHaveBeenNthCalledWith(2, 'question-bank');
  });

  it('shows the emergent filter button in memory deck study and dispatches its toolbar action', async () => {
    const toolbarListener = vi.fn();
    window.addEventListener('Weave:deck-study-toolbar-action', toolbarListener);

    const { getByLabelText } = render(SidebarNavHeader, {
      props: {
        currentPage: 'deck-study',
        selectedFilter: 'memory',
        onNavigate: mockOnNavigate
      }
    });

    const button = getByLabelText('涌现筛选');
    await fireEvent.click(button);

    expect(toolbarListener).toHaveBeenCalledTimes(1);
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.action).toBe('open-emergent-rule-groups');
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.anchor).toBe(button);

    window.removeEventListener('Weave:deck-study-toolbar-action', toolbarListener);
  });

  it('hides the emergent filter button outside the memory deck filter', () => {
    const { queryByLabelText } = render(SidebarNavHeader, {
      props: {
        currentPage: 'deck-study',
        selectedFilter: 'question-bank',
        onNavigate: mockOnNavigate
      }
    });

    expect(queryByLabelText('涌现筛选')).toBeNull();
  });

  it('removes toolbar-duplicated actions in desktop main-area table view', async () => {
    premiumMockState.isPremium = true;

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'table',
        cardDataSource: 'memory',
        isInSidebarMode: false,
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    expect(menu.findItemByTitle('\u6570\u636e\u6e90\u5207\u6362')).toBeUndefined();
    expect(menu.findItemByTitle('\u57fa\u7840\u4fe1\u606f\u6a21\u5f0f')).toBeUndefined();
    expect(menu.findItemByTitle('\u590d\u4e60\u5386\u53f2\u6a21\u5f0f')).toBeUndefined();
    expect(menu.findItemByTitle('\u5b57\u6bb5\u7ba1\u7406')).toBeUndefined();
    expect(menu.findItemByTitle('\u6570\u636e\u7ba1\u7406')).toBeUndefined();
    expect(menu.findItemByTitle('\u65f6\u95f4\u7ebf\u89c6\u56fe')).toBeUndefined();
  });

  it('removes toolbar-duplicated actions in desktop main-area grid view', async () => {
    premiumMockState.isPremium = true;

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'grid',
        cardDataSource: 'memory',
        isInSidebarMode: false,
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    expect(menu.findItemByTitle('\u6570\u636e\u6e90\u5207\u6362')).toBeUndefined();
    expect(menu.findItemByTitle('\u56fa\u5b9a\u5e03\u5c40')).toBeUndefined();
    expect(menu.findItemByTitle('\u7011\u5e03\u6d41\u5e03\u5c40')).toBeUndefined();
    expect(menu.findItemByTitle('\u65f6\u95f4\u7ebf\u89c6\u56fe')).toBeUndefined();
    expect(menu.findItemByTitle('\u5361\u7247\u5c5e\u6027')).toBeUndefined();
    expect(menu.findItemByTitle('\u6570\u636e\u7ba1\u7406')).toBeUndefined();
  });

  it('keeps sidebar menus focused on actions not already shown in the header', async () => {
    premiumMockState.isPremium = true;

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'table',
        cardDataSource: 'memory',
        isInSidebarMode: true,
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    expect(menu.findItemByTitle('\u5173\u8054\u5f53\u524d\u6d3b\u52a8\u6587\u6863')).toBeUndefined();
    expect(menu.findItemByTitle('\u5b9a\u4f4d\u8df3\u8f6c\u6a21\u5f0f')).toBeUndefined();
    expect(menu.findItemByTitle('\u6570\u636e\u6e90\u5207\u6362')).toBeTruthy();
    expect(menu.findItemByTitle('\u57fa\u7840\u4fe1\u606f\u6a21\u5f0f')).toBeTruthy();
    expect(menu.findItemByTitle('\u590d\u4e60\u5386\u53f2\u6a21\u5f0f')).toBeTruthy();
    expect(menu.findItemByTitle('\u6570\u636e\u7ba1\u7406')).toBeTruthy();
  });

  it('removes toolbar-duplicated actions in desktop main-area kanban view', async () => {
    premiumMockState.isPremium = true;

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'kanban',
        cardDataSource: 'memory',
        isInSidebarMode: false,
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    expect(menu.findItemByTitle('\u7d27\u51d1\u6a21\u5f0f')).toBeUndefined();
    expect(menu.findItemByTitle('\u8212\u9002\u6a21\u5f0f')).toBeUndefined();
    expect(menu.findItemByTitle('\u5bbd\u677e\u6a21\u5f0f')).toBeUndefined();
    expect(menu.findItemByTitle('\u770b\u677f\u5217\u8bbe\u7f6e')).toBeUndefined();
    expect(menu.findItemByTitle('\u5361\u7247\u5c5e\u6027')).toBeUndefined();
    expect(menu.findItemByTitle('\u6570\u636e\u7ba1\u7406')).toBeUndefined();
  });

  it('removes toolbar-duplicated actions for incremental-reading table view in desktop main area', async () => {
    premiumMockState.isPremium = true;

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'table',
        cardDataSource: 'incremental-reading',
        isInSidebarMode: false,
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    expect(menu.findItemByTitle('MD\u6587\u4ef6')).toBeUndefined();
    expect(menu.findItemByTitle('PDF\u4e66\u7b7e')).toBeUndefined();
    expect(menu.findItemByTitle('\u5b57\u6bb5\u7ba1\u7406')).toBeUndefined();
    expect(menu.findItemByTitle('\u6570\u636e\u7ba1\u7406')).toBeUndefined();
    expect(menu.findItemByTitle('\u65f6\u95f4\u7ebf\u89c6\u56fe')).toBeUndefined();
  });
});
