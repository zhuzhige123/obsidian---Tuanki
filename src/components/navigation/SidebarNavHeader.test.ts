import { render, fireEvent } from '@testing-library/svelte';
import SidebarNavHeader from './SidebarNavHeader.svelte';
import { App, Menu } from 'obsidian';
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
  'emergent-decks',
  'csv-import'
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
  'cardManagement.search': '搜索卡片',
  'cardManagement.viewModes.grid': '网格视图',
  'cardManagement.density.title': '密度',
  'cardManagement.density.compact': '紧凑',
  'cardManagement.density.comfortable': '舒适',
  'cardManagement.density.spacious': '宽松',
  'mainMenu.deckStudy.switchView': '切换视图',
  'mainMenu.deckStudy.createMemoryDeck': '创建记忆牌组',
  'mainMenu.deckStudy.kanbanColumnSettings': '看板列设置',
  'mainMenu.deckStudy.importLegacyPackage': '导入旧版卡包',
  'mainMenu.deckStudy.importCsv': '导入CSV文件',
  'mainMenu.cardManagement.dataSourceSwitch': '数据源切换',
  'mainMenu.cardManagement.memoryDeck': '记忆牌组',
  'mainMenu.cardManagement.incrementalReading': '增量阅读',
  'mainMenu.cardManagement.incrementalReadingPremium': '增量阅读（高级）',
  'mainMenu.cardManagement.questionBank': '考试题组',
  'mainMenu.cardManagement.questionBankPremium': '考试题组（高级）',
  'mainMenu.cardManagement.timeline': '时间线视图',
  'mainMenu.cardManagement.fixedShort': '固高',
  'mainMenu.cardManagement.masonryShort': '瀑布',
  'mainMenu.cardManagement.timelineShort': '时间线',
  'mainMenu.cardManagement.gridLayout': '网格布局',
  'mainMenu.cardManagement.gridBorderStyle': '显示风格',
  'mainMenu.cardManagement.gridFixed': '固定布局',
  'mainMenu.cardManagement.gridMasonry': '瀑布流布局',
  'mainMenu.cardManagement.gridBorderSolid': '实线边框',
  'mainMenu.cardManagement.gridBorderDashed': '虚线边框',
  'mainMenu.cardManagement.gridBorderSolidShort': '实线',
  'mainMenu.cardManagement.gridBorderDashedShort': '虚线',
  'aiAssistant.staging.followActiveDocument': '跟随当前文档',
  'mainMenu.aiAssistant.fileList': '文件列表'
}));

const mockPremiumGuard = vi.hoisted(() => {
  const createStore = <T, K extends 'isPremium' | 'showPreview'>(key: K) => ({
    subscribe: vi.fn((callback: (value: T) => void) => {
      callback(premiumMockState[key] as T);
      return () => {};
    }),
    set: vi.fn((value: T) => {
      (premiumMockState[key] as T) = value;
    }),
    update: vi.fn((updater: (value: T) => T) => {
      (premiumMockState[key] as T) = updater(premiumMockState[key] as T);
    })
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
    setPremiumFeaturesPreview: vi.fn((enabled: boolean) => {
      premiumMockState.showPreview = enabled;
    })
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
      EMERGENT_DECKS: 'emergent-decks',
      CSV_IMPORT: 'csv-import'
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

describe('SidebarNavHeader', () => {
  const mockApp = new App();
  const mockOnNavigate = vi.fn();
  const mockOnViewChange = vi.fn();
  const mockOnCardDataSourceChange = vi.fn();
  const mockOnFilterSelect = vi.fn();

  beforeEach(() => {
    menuInstances.length = 0;
    premiumMockState.isPremium = false;
    premiumMockState.showPreview = false;
    premiumMockState.blockedFeatures.clear();
    vi.clearAllMocks();
  });

  it('在卡片管理页面默认隐藏高级数据源入口', async () => {
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
    expect(menu).toBeTruthy();

    const dataSourceItem = menu.findItemByTitle('数据源切换');
    expect(dataSourceItem).toBeTruthy();
    expect(dataSourceItem?.getIcon()).toBe('database');

    const submenu = dataSourceItem?.getSubmenu();
    expect(submenu).toBeTruthy();
    expect(submenu?.findItemByTitle('记忆牌组')).toBeTruthy();
    expect(submenu?.findItemByTitle('增量阅读')).toBeUndefined();
    expect(submenu?.findItemByTitle('考试题组')).toBeUndefined();
  });

  it('在卡片管理页面已激活后点击高级数据源会触发切换回调和事件', async () => {
    premiumMockState.isPremium = true;
    premiumMockState.showPreview = true;

    const eventListener = vi.fn();
    window.addEventListener('Weave:card-data-source-change', eventListener);

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'table',
        cardDataSource: 'memory',
        isInSidebarMode: true,
        onNavigate: mockOnNavigate,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    const submenu = menu.findItemByTitle('数据源切换')?.getSubmenu();
    submenu?.findItemByTitle('考试题组')?.trigger();

    expect(mockOnCardDataSourceChange).toHaveBeenCalledWith('questionBank');
    expect(eventListener).toHaveBeenCalled();
    expect((eventListener.mock.calls[0][0] as CustomEvent).detail).toBe('questionBank');

    window.removeEventListener('Weave:card-data-source-change', eventListener);
  });

  it('开启高级预览但未激活时显示锁定的考试题组数据源标题', async () => {
    premiumMockState.showPreview = true;

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'table',
        cardDataSource: 'memory',
        isInSidebarMode: true,
        onNavigate: mockOnNavigate,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    const submenu = menu.findItemByTitle('数据源切换')?.getSubmenu();
    const questionBankItem = submenu?.findItemByTitle('考试题组（高级）');

    expect(submenu?.findItemByTitle('增量阅读（高级）')).toBeUndefined();
    expect(questionBankItem).toBeTruthy();
  });

  it('开启高级预览但未激活时显示锁定的时间线视图标题', async () => {
    premiumMockState.showPreview = true;

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'grid',
        cardDataSource: 'memory',
        isInSidebarMode: true,
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    const timelineItem = menu.findItemByTitle('时间线视图 (高级)');
    expect(timelineItem).toBeTruthy();
  });

  it('在牌组学习页面显示新建牌组菜单项', async () => {
    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'deck-study',
        selectedFilter: 'memory',
        onNavigate: mockOnNavigate,
        onFilterSelect: mockOnFilterSelect
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    expect(menu.findItemByTitle('切换视图')).toBeUndefined();
    expect(menu.findItemByTitle('创建记忆牌组')?.getIcon()).toBe('folder-plus');
  });

  it('牌组学习页在已激活高级功能时在顶栏显示看板列设置', async () => {
    premiumMockState.isPremium = true;

    const { container, getByLabelText } = render(SidebarNavHeader, {
      props: {
        currentPage: 'deck-study',
        selectedFilter: 'memory',
        deckStudyView: 'kanban',
        onNavigate: mockOnNavigate,
        onFilterSelect: mockOnFilterSelect
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    expect(menu.findItemByTitle('看板列设置')).toBeUndefined();
    expect(getByLabelText('看板列设置')).toBeTruthy();
  });

  it('AI 制卡文件按钮：侧边栏切换跟随文档，内容区打开文件列表', async () => {
    const toolbarListener = vi.fn();
    window.addEventListener('Weave:ai-toolbar-action', toolbarListener);

    const { getByLabelText, unmount } = render(SidebarNavHeader, {
      props: {
        currentPage: 'ai-assistant',
        isInSidebarMode: false,
        onNavigate: mockOnNavigate
      }
    });

    await fireEvent.click(getByLabelText('文件列表'));
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.action).toBe('file');

    toolbarListener.mockClear();
    unmount();

    render(SidebarNavHeader, {
      props: {
        currentPage: 'ai-assistant',
        isInSidebarMode: true,
        onNavigate: mockOnNavigate
      }
    });

    await fireEvent.click(getByLabelText('跟随当前文档'));
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.action).toBe('toggle-follow-document');

    window.removeEventListener('Weave:ai-toolbar-action', toolbarListener);
  });

  it('在 AI 助手页面不显示无效功能入口', async () => {
    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'ai-assistant',
        onNavigate: mockOnNavigate
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    expect(menu.findItemByTitle('牌组学习')?.isChecked()).toBe(false);
    expect(menu.findItemByTitle('卡片管理')?.isChecked()).toBe(false);
    expect(menu.findItemByTitle('AI制卡')?.isChecked()).toBe(true);
    expect(menu.findItemByTitle('切换视图')).toBeUndefined();
    expect(menu.findItemByTitle('新建牌组')).toBeUndefined();
    expect(menu.findItemByTitle('数据源切换')).toBeUndefined();
    expect(menu.findItemByTitle('导入旧版卡包')).toBeUndefined();
    expect(menu.findItemByTitle('导入CSV文件')).toBeUndefined();
    expect(menu.findItemByTitle('操作管理')).toBeUndefined();
  });

  it('在卡片管理页面不显示仅牌组学习可用的全局操作', async () => {
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
    expect(menu.findItemByTitle('数据源切换')).toBeTruthy();
    expect(menu.findItemByTitle('导入旧版卡包')).toBeUndefined();
    expect(menu.findItemByTitle('导入CSV文件')).toBeUndefined();
    expect(menu.findItemByTitle('操作管理')).toBeUndefined();
  });

  it('在卡片管理菜单中显示时间线视图入口并触发切换', async () => {
    premiumMockState.isPremium = true;

    const toolbarListener = vi.fn();
    window.addEventListener('Weave:card-management-toolbar-action', toolbarListener);

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'grid',
        cardDataSource: 'memory',
        isInSidebarMode: true,
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    const timelineItem = menu.findItemByTitle('时间线视图');
    expect(timelineItem).toBeTruthy();
    expect(timelineItem?.getIcon()).toBe('history');

    timelineItem?.trigger();

    expect(mockOnViewChange).not.toHaveBeenCalled();
    expect(toolbarListener).toHaveBeenCalled();
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.action).toBe('grid-layout-timeline');

    window.removeEventListener('Weave:card-management-toolbar-action', toolbarListener);
  });

  it('在时间线布局下点击蓝色网格圆点会回到标准网格布局', async () => {
    premiumMockState.isPremium = true;

    const toolbarListener = vi.fn();
    window.addEventListener('Weave:card-management-toolbar-action', toolbarListener);

    const { getByLabelText } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'grid',
        cardDataSource: 'memory',
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    window.dispatchEvent(new CustomEvent('Weave:card-management-toolbar-state', {
      detail: {
        gridLayout: 'timeline'
      }
    }));

    await fireEvent.click(getByLabelText('网格视图'));

    expect(toolbarListener).toHaveBeenCalledTimes(1);
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.action).toBe('grid-layout-fixed');
    expect(mockOnViewChange).not.toHaveBeenCalled();

    window.removeEventListener('Weave:card-management-toolbar-action', toolbarListener);
  });

  it('从其他视图点击蓝色网格圆点会切到标准网格布局', async () => {
    premiumMockState.isPremium = true;

    const toolbarListener = vi.fn();
    window.addEventListener('Weave:card-management-toolbar-action', toolbarListener);

    const { getByLabelText } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'table',
        cardDataSource: 'memory',
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    window.dispatchEvent(new CustomEvent('Weave:card-management-toolbar-state', {
      detail: {
        gridLayout: 'timeline'
      }
    }));

    await fireEvent.click(getByLabelText('网格视图'));

    expect(mockOnViewChange).toHaveBeenCalledWith('grid');
    expect(toolbarListener).toHaveBeenCalledTimes(1);
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.action).toBe('grid-layout-fixed');

    window.removeEventListener('Weave:card-management-toolbar-action', toolbarListener);
  });

  it('桌面网格视图顶部布局按钮会打开菜单并在选择后切换布局', async () => {
    premiumMockState.isPremium = true;

    const toolbarListener = vi.fn();
    window.addEventListener('Weave:card-management-toolbar-action', toolbarListener);

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'grid',
        cardDataSource: 'memory',
        isInSidebarMode: false,
        app: mockApp,
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    window.dispatchEvent(new CustomEvent('Weave:card-management-toolbar-state', {
      detail: { gridLayout: 'fixed' }
    }));

    const layoutButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('固高')
    );
    expect(layoutButton).toBeTruthy();

    await fireEvent.click(layoutButton as HTMLButtonElement);

    const menu = menuInstances[menuInstances.length - 1];
    const masonryItem = menu.findItemByTitle('瀑布流布局');
    expect(masonryItem).toBeTruthy();
    masonryItem?.trigger();

    expect(toolbarListener).toHaveBeenCalledTimes(1);
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.action).toBe('grid-layout-masonry');

    window.removeEventListener('Weave:card-management-toolbar-action', toolbarListener);
  });

  it('桌面网格视图顶部边框按钮会打开菜单并在选择后切换样式', async () => {
    premiumMockState.isPremium = true;

    const toolbarListener = vi.fn();
    window.addEventListener('Weave:card-management-toolbar-action', toolbarListener);

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'grid',
        cardDataSource: 'memory',
        isInSidebarMode: false,
        app: mockApp,
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    window.dispatchEvent(new CustomEvent('Weave:card-management-toolbar-state', {
      detail: { gridCardBorderStyle: 'solid' }
    }));

    const borderButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('实线')
    );
    expect(borderButton).toBeTruthy();

    await fireEvent.click(borderButton as HTMLButtonElement);

    const menu = menuInstances[menuInstances.length - 1];
    const dashedItem = menu.findItemByTitle('虚线边框');
    expect(dashedItem).toBeTruthy();
    dashedItem?.trigger();

    expect(toolbarListener).toHaveBeenCalledTimes(1);
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.action).toBe('grid-border-style-dashed');

    window.removeEventListener('Weave:card-management-toolbar-action', toolbarListener);
  });

  it('桌面卡片管理顶栏数据源按钮直接显示当前数据源名称', () => {
    premiumMockState.isPremium = true;

    const { getByLabelText, queryByLabelText } = render(SidebarNavHeader, {
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

    expect(getByLabelText('记忆牌组')).toBeTruthy();
    expect(queryByLabelText('数据源切换')).toBeNull();
  });

  it('看板视图顶部密度按钮会按当前模式循环切换到下一种布局', async () => {
    premiumMockState.isPremium = true;

    const toolbarListener = vi.fn();
    window.addEventListener('Weave:card-management-toolbar-action', toolbarListener);

    const { container, queryByLabelText } = render(SidebarNavHeader, {
      props: {
        currentPage: 'weave-card-management',
        currentView: 'kanban',
        cardDataSource: 'memory',
        onNavigate: mockOnNavigate,
        onViewChange: mockOnViewChange,
        onCardDataSourceChange: mockOnCardDataSourceChange
      }
    });

    expect(queryByLabelText('紧凑布局')).toBeNull();
    expect(queryByLabelText('舒适布局')).toBeNull();
    expect(queryByLabelText('宽松布局')).toBeNull();

    const densityButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('密度·舒适')
    );
    expect(densityButton).toBeTruthy();

    await fireEvent.click(densityButton as HTMLButtonElement);

    expect(toolbarListener).toHaveBeenCalledTimes(1);
    expect((toolbarListener.mock.calls[0][0] as CustomEvent).detail?.action).toBe('kanban-layout-spacious');

    window.removeEventListener('Weave:card-management-toolbar-action', toolbarListener);
  });

  it('在导航可见性关闭时隐藏导入入口', async () => {
    premiumMockState.showPreview = true;

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'deck-study',
        selectedFilter: 'memory',
        navigationVisibility: {
          apkgImport: false,
          csvImport: false
        },
        onNavigate: mockOnNavigate,
        onFilterSelect: mockOnFilterSelect
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    expect(menu.findItemByTitle('导入旧版卡包')).toBeUndefined();
    expect(menu.findItemByTitle('导入CSV文件 (高级)')).toBeUndefined();
  });

  it('侧边栏模式下默认只显示搜索图标，点击后在下方展开搜索栏', async () => {
    const searchLabel = '\u641c\u7d22\u5361\u7247';
    const { container, getByLabelText } = render(SidebarNavHeader, {
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

    expect(container.querySelector('.sidebar-card-search-panel')).toBeNull();

    await fireEvent.click(getByLabelText(searchLabel));

    expect(container.querySelector('.sidebar-card-search-panel')).toBeTruthy();
    expect(container.querySelector('.sidebar-card-search-panel input[aria-label=\"搜索卡片\"]')).toBeTruthy();
  });
});



