import { render, fireEvent } from '@testing-library/svelte';
import SidebarNavHeader from './SidebarNavHeader.svelte';
import { PremiumFeatureGuard, PREMIUM_FEATURES } from '../../services/premium/PremiumFeatureGuard';
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
  'csv-import',
  'clipboard-import'
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
      CSV_IMPORT: 'csv-import',
      CLIPBOARD_IMPORT: 'clipboard-import'
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

describe('SidebarNavHeader', () => {
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

  it('开启高级预览但未激活时显示锁定的高级数据源标题', async () => {
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
    const irItem = submenu?.findItemByTitle('增量阅读 (高级)');
    const questionBankItem = submenu?.findItemByTitle('考试题组 (高级)');

    expect(irItem).toBeTruthy();
    expect(questionBankItem).toBeTruthy();
  });

  it('开启高级预览但未激活时显示锁定的时间线视图标题', async () => {
    premiumMockState.showPreview = true;

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
    const timelineItem = menu.findItemByTitle('时间线视图 (高级)');
    expect(timelineItem).toBeTruthy();
  });

  it('在牌组学习页面显示切换视图和新建牌组菜单项', async () => {
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
    expect(menu.findItemByTitle('切换视图')?.getIcon()).toBe('layout-grid');
    expect(menu.findItemByTitle('创建记忆牌组')?.getIcon()).toBe('folder-plus');
  });

  it('在牌组学习页面点击切换视图时派发菜单事件', async () => {
    const eventListener = vi.fn();
    window.addEventListener('show-view-menu', eventListener);

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
    menu.findItemByTitle('切换视图')?.trigger();

    expect(eventListener).toHaveBeenCalled();

    window.removeEventListener('show-view-menu', eventListener);
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
    expect(menu.findItemByTitle('AI助手')?.isChecked()).toBe(true);
    expect(menu.findItemByTitle('切换视图')).toBeUndefined();
    expect(menu.findItemByTitle('新建牌组')).toBeUndefined();
    expect(menu.findItemByTitle('数据源切换')).toBeUndefined();
    expect(menu.findItemByTitle('导入旧版卡包')).toBeUndefined();
    expect(menu.findItemByTitle('导入CSV文件')).toBeUndefined();
    expect(menu.findItemByTitle('粘贴卡片批量导入')).toBeUndefined();
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
    expect(menu.findItemByTitle('粘贴卡片批量导入')).toBeUndefined();
    expect(menu.findItemByTitle('操作管理')).toBeUndefined();
  });

  it('在卡片管理菜单中显示时间线视图入口并触发切换', async () => {
    premiumMockState.isPremium = true;

    const toolbarListener = vi.fn();
    window.addEventListener('Weave:card-management-toolbar-action', toolbarListener);

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
    const timelineItem = menu.findItemByTitle('时间线视图');
    expect(timelineItem).toBeTruthy();
    expect(timelineItem?.getIcon()).toBe('history');

    timelineItem?.trigger();

    expect(mockOnViewChange).toHaveBeenCalledWith('grid');
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

  it('在导航可见性关闭时隐藏导入入口', async () => {
    premiumMockState.showPreview = true;

    const { container } = render(SidebarNavHeader, {
      props: {
        currentPage: 'deck-study',
        selectedFilter: 'memory',
        navigationVisibility: {
          apkgImport: false,
          csvImport: false,
          clipboardImport: false
        },
        onNavigate: mockOnNavigate,
        onFilterSelect: mockOnFilterSelect
      }
    });

    await fireEvent.click(container.querySelector('.sidebar-menu-trigger')!);

    const menu = menuInstances[0];
    expect(menu.findItemByTitle('导入旧版卡包')).toBeUndefined();
    expect(menu.findItemByTitle('导入CSV文件 (高级)')).toBeUndefined();
    expect(menu.findItemByTitle('粘贴卡片批量导入 (高级)')).toBeUndefined();
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



