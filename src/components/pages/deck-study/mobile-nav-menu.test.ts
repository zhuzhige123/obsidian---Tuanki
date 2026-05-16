import { Menu } from 'obsidian';
import type { MenuItem as MockMenuItem } from '../../../tests/mocks/obsidian';
import { showDeckStudyMobileNavMenu } from './mobile-nav-menu';

type TrackingMenu = Menu & {
  findItemByTitle(title: string): MockMenuItem | undefined;
};

const menuInstances: TrackingMenu[] = [];

vi.mock('obsidian', async () => {
  const actual = await vi.importActual<typeof import('../../../tests/mocks/obsidian')>('../../../tests/mocks/obsidian');

  class TrackingMenuImpl extends actual.Menu {
    constructor() {
      super();
      menuInstances.push(this as unknown as TrackingMenu);
    }
  }

  return {
    ...actual,
    Menu: TrackingMenuImpl,
  };
});

vi.mock('../../../services/premium/PremiumFeatureGuard', () => ({
  PREMIUM_FEATURES: {
    EMERGENT_DECKS: 'emergent-decks',
  },
}));

describe('showDeckStudyMobileNavMenu', () => {
  beforeEach(() => {
    menuInstances.length = 0;
    vi.clearAllMocks();
  });

  function buildOptions(overrides: Partial<Parameters<typeof showDeckStudyMobileNavMenu>[0]> = {}) {
    return {
      evt: new MouseEvent('click', { clientX: 40, clientY: 60 }),
      selectedFilter: 'memory',
      currentView: 'grid' as const,
      memoryDeckDisplayMode: 'formal' as const,
      tr: (key: string) => key,
      getCreateEntryTitle: () => '创建记忆牌组',
      showViewSwitcher: vi.fn(),
      handleCreateDeckForCurrentFilter: vi.fn(),
      setMemoryDeckDisplayMode: vi.fn(),
      showEmergentRuleGroupMenu: vi.fn(),
      openAPKGImport: vi.fn(),
      handleCSVImport: vi.fn(),
      canUseFeature: vi.fn(() => false),
      isAPKGImportEnabled: vi.fn(() => false),
      isCSVImportEnabled: vi.fn(() => false),
      shouldShowPremiumEntry: vi.fn(() => true),
      getPremiumEntryTitle: (title: string) => title,
      ...overrides,
    };
  }

  it('在记忆牌组移动菜单中显示涌现牌组切换入口', () => {
    const options = buildOptions();

    showDeckStudyMobileNavMenu(options);

    const menu = menuInstances[0];
    const toggleItem = menu.findItemByTitle('切换到涌现牌组');
    expect(toggleItem).toBeTruthy();

    toggleItem?.trigger();
    expect(options.setMemoryDeckDisplayMode).toHaveBeenCalledWith('emergent');
  });

  it('在已进入涌现牌组时显示涌现筛选入口', () => {
    const options = buildOptions({
      memoryDeckDisplayMode: 'emergent',
      canUseFeature: vi.fn(() => true),
    });

    showDeckStudyMobileNavMenu(options);

    const menu = menuInstances[0];
    const filterItem = menu.findItemByTitle('涌现筛选');
    expect(filterItem).toBeTruthy();

    filterItem?.trigger();
    expect(options.showEmergentRuleGroupMenu).toHaveBeenCalledTimes(1);
  });
});
