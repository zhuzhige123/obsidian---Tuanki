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
  'timeline-view',
  'emergent-decks'
]));
const premiumMockState = vi.hoisted(() => ({
  isPremium: false,
  showPreview: false,
  blockedFeatures: new Set<string>()
}));
const translationMap = vi.hoisted(() => ({
  'navigation.deckStudy': '牌组学习',
  'navigation.cardManagement': '卡片管理',
  'navigation.aiAssistant': 'AI制卡',
  'mainMenu.deckStudy.switchToEmergent': '切换到涌现牌组',
  'mainMenu.deckStudy.switchToFormal': '切换到正式牌组',
  'mainMenu.deckStudy.showingFormal': '当前显示正式牌组',
  'mainMenu.deckStudy.showingEmergent': '当前显示涌现牌组',
  'mainMenu.deckStudy.emergentFilter': '涌现筛选',
  'mainMenu.deckStudy.kanbanColumnSettings': '看板设置',
  'mainMenu.cardManagement.dataSourceSwitch': '数据源切换',
  'mainMenu.cardManagement.tableViewMode': '表格视图模式',
  'mainMenu.cardManagement.tableBasic': '基础信息模式',
  'mainMenu.cardManagement.tableReview': '复习历史模式',
  'mainMenu.cardManagement.gridFixed': '固定布局',
  'mainMenu.cardManagement.gridMasonry': '瀑布流布局',
  'mainMenu.cardManagement.timeline': '时间线视图',
  'mainMenu.cardManagement.kanbanCompact': '紧凑模式',
  'mainMenu.cardManagement.kanbanComfortable': '舒适模式',
  'mainMenu.cardManagement.kanbanSpacious': '宽松模式',
  'mainMenu.cardManagement.kanbanColumnSettings': '看板列设置',
  'mainMenu.cardManagement.gridAttributes': '卡片属性',
  'mainMenu.cardManagement.dataManagement': '数据管理',
  'mainMenu.cardManagement.currentDocumentOnly': '关联当前活动文档',
  'mainMenu.cardManagement.cardLocationJump': '定位跳转模式',
  'mainMenu.cardManagement.irMd': 'MD文件',
  'mainMenu.cardManagement.irPdf': 'PDF书签',
  'cardManagement.search': '搜索卡片',
  'cardManagement.viewModes.grid': '网格视图',
  'cardManagement.density.title': '密度',
  'cardManagement.density.compact': '紧凑',
  'cardManagement.density.comfortable': '舒适',
  'cardManagement.density.spacious': '宽松'
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
    getFeatureEntryTitle: vi.fn((baseTitle: string, featureId: string) => {
      return canUseFeature(featureId) ? baseTitle : `${baseTitle} (高级)`;
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
      TIMELINE_VIEW: 'timeline-view',
      EMERGENT_DECKS: 'emergent-decks'
    }
  };
});

vi.mock('../../utils/i18n', () => ({
  tr: {
    subscribe: (callback: (translator: (key: string) => string) => void) => {
      callback((key: string) => translationMap[key as keyof typeof translationMap] ?? key);
      return () => {};
    }
  },
  i18n: {
    t: (key: string) => translationMap[key as keyof typeof translationMap] ?? key
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
    window.localStorage.clear();
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
    expect(dots).toHaveLength(2);

    await fireEvent.click(dots[1]);

    expect(onFilterSelect).toHaveBeenCalledTimes(1);
    expect(onFilterSelect).toHaveBeenCalledWith('question-bank');
  });

  it('keeps premium preview deck-study dots clickable so page-level activation prompt can handle them', async () => {
    premiumMockState.showPreview = true;

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
    expect(dots).toHaveLength(2);

    await fireEvent.click(dots[1]);

    expect(onFilterSelect).toHaveBeenCalledTimes(1);
    expect(onFilterSelect).toHaveBeenCalledWith('question-bank');
  });

  it('hides deck-study dots entirely when premium preview is off and only the base filter remains', () => {
    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'deck-study',
        selectedFilter: 'memory',
        onNavigate: mockOnNavigate
      }
    });

    expect(container.querySelectorAll('.sidebar-dot')).toHaveLength(0);
  });

  it('hides card-management dots entirely when premium preview is off and only table view remains', () => {
    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'table',
        cardDataSource: 'memory',
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    expect(container.querySelectorAll('.sidebar-dot')).toHaveLength(0);
  });

  it('shows the emergent filter button in memory deck study and dispatches its toolbar action', async () => {
    premiumMockState.isPremium = true;
    const toolbarListener = vi.fn();
    window.addEventListener('Weave:deck-study-toolbar-action', toolbarListener);

    const { getByLabelText } = render(SidebarNavHeader, {
      props: {
        currentPage: 'deck-study',
        selectedFilter: 'memory',
        onNavigate: mockOnNavigate
      }
    });

    const toggleButton = getByLabelText('切换到涌现牌组');
    await fireEvent.click(toggleButton);

    const button = getByLabelText('涌现筛选');
    await fireEvent.click(button);

    expect(toolbarListener).toHaveBeenCalledTimes(2);
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.action).toBe('set-memory-deck-display-mode');
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.mode).toBe('emergent');
    expect((toolbarListener.mock.calls[1][0] as CustomEvent).detail?.action).toBe('open-emergent-rule-groups');
    expect((toolbarListener.mock.calls[1][0] as CustomEvent).detail?.anchor).toBe(button);

    window.removeEventListener('Weave:deck-study-toolbar-action', toolbarListener);
  });

  it('shows the memory deck display toggle button and dispatches display mode change action', async () => {
    premiumMockState.isPremium = true;
    const toolbarListener = vi.fn();
    window.addEventListener('Weave:deck-study-toolbar-action', toolbarListener);

    const { getByLabelText } = render(SidebarNavHeader, {
      props: {
        currentPage: 'deck-study',
        selectedFilter: 'memory',
        onNavigate: mockOnNavigate
      }
    });

    const toggleButton = getByLabelText('切换到涌现牌组');
    await fireEvent.click(toggleButton);

    expect(toolbarListener).toHaveBeenCalledTimes(1);
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.action).toBe('set-memory-deck-display-mode');
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.mode).toBe('emergent');
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.anchor).toBe(toggleButton);

    window.removeEventListener('Weave:deck-study-toolbar-action', toolbarListener);
  });

  it('shows deck-study kanban settings button when kanban premium access is active', () => {
    premiumMockState.isPremium = true;
    const { getByLabelText } = render(SidebarNavHeader, {
      props: {
        currentPage: 'deck-study',
        selectedFilter: 'memory',
        deckStudyView: 'kanban',
        onNavigate: mockOnNavigate
      }
    });

    expect(getByLabelText('看板设置')).toBeTruthy();
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
    expect(menu.findItemByTitle('\u7d27\u51d1\u6a21\u5f0f')).toBeTruthy();
    expect(menu.findItemByTitle('\u8212\u9002\u6a21\u5f0f')).toBeTruthy();
    expect(menu.findItemByTitle('\u5bbd\u677e\u6a21\u5f0f')).toBeTruthy();
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
