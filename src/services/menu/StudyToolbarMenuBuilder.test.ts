import { Menu } from 'obsidian';
import type { MenuItem as MockMenuItem } from '../../tests/mocks/obsidian';
import { StudyToolbarMenuBuilder } from './StudyToolbarMenuBuilder';

type TrackingMenu = Menu & {
  findItemByTitle(title: string): MockMenuItem | undefined;
};

const menuInstances: TrackingMenu[] = [];

vi.mock('obsidian', async () => {
  const actual = await vi.importActual<typeof import('../../tests/mocks/obsidian')>('../../tests/mocks/obsidian');

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

vi.mock('../../utils/i18n', () => ({
  i18n: {
    t: (key: string) => key,
  },
}));

describe('StudyToolbarMenuBuilder', () => {
  beforeEach(() => {
    menuInstances.length = 0;
    vi.clearAllMocks();
  });

  it('在移动菜单中构建更多设置子菜单并复用现有设置回调', () => {
    const callbacks = {
      onToggleEdit: vi.fn(),
      onDelete: vi.fn(),
      onSetReminder: vi.fn(),
      onChangePriority: vi.fn(),
      onChangeDeck: vi.fn(),
      onRecycleCard: vi.fn(),
      onSplitCard: vi.fn(),
      onOpenAIConfig: vi.fn(),
      onGraphLinkToggle: vi.fn(),
      onOpenDetailedView: vi.fn(),
      onOpenSourceBlock: vi.fn(),
      onMediaAutoPlayChange: vi.fn(),
      onDirectDeleteToggle: vi.fn(),
      onCardOrderChange: vi.fn(),
      onChoiceOptionOrderChange: vi.fn(),
      onRatingLabelStyleChange: vi.fn(),
      onTimerAutoPauseChange: vi.fn(),
      onHintMaxUsesChange: vi.fn(),
      onClozeModeSwitchButtonToggle: vi.fn(),
    };

    const builder = new StudyToolbarMenuBuilder(
      {
        card: { priority: 2, sourceFile: '', content: '' } as any,
        decks: [],
        isPremium: false,
        isGraphLinked: false,
        hasSourceFile: false,
        currentPriority: 2,
        enableDirectDelete: false,
        autoPlayMedia: false,
        playMediaMode: 'first',
        playMediaTiming: 'cardChange',
        playbackInterval: 2000,
        cardOrder: 'sequential',
        choiceOptionOrder: 'sequential',
        ratingLabelStyle: 'classic',
        timerAutoPauseSeconds: 60,
        hintMaxUses: 5,
        showClozeModeSwitchButton: true,
        aiActions: {
          split: [],
        },
      },
      callbacks,
    );

    builder.showMenu({ x: 10, y: 20 });

    const menu = menuInstances[0];
    const settingsItem = menu.findItemByTitle('study.menu.moreSettings');
    expect(settingsItem).toBeTruthy();

    const settingsSubmenu = settingsItem?.getSubmenu() as TrackingMenu | null;
    expect(settingsSubmenu?.findItemByTitle('study.menu.settings.autoPlayMedia')).toBeTruthy();
    expect(settingsSubmenu?.findItemByTitle('study.menu.settings.cardOrder.label: study.menu.settings.cardOrder.sequential')).toBeTruthy();
    expect(settingsSubmenu?.findItemByTitle('study.menu.settings.choiceOptionOrder.label: 正序')).toBeTruthy();
    expect(settingsSubmenu?.findItemByTitle('study.menu.settings.timerAutoPause.label: studyInterface.intervals.minutes')).toBeTruthy();
    expect(settingsSubmenu?.findItemByTitle('study.menu.settings.directDeleteEnabled')).toBeTruthy();
    expect(settingsSubmenu?.findItemByTitle('study.menu.settings.showClozeModeSwitchButton')).toBeTruthy();

    settingsSubmenu?.findItemByTitle('study.menu.settings.autoPlayMedia')?.trigger();
    settingsSubmenu?.findItemByTitle('study.menu.settings.directDeleteEnabled')?.trigger();
    settingsSubmenu?.findItemByTitle('study.menu.settings.showClozeModeSwitchButton')?.trigger();

    const orderSubmenu = settingsSubmenu?.findItemByTitle('study.menu.settings.cardOrder.label: study.menu.settings.cardOrder.sequential')?.getSubmenu() as TrackingMenu | null;
    orderSubmenu?.findItemByTitle('study.menu.settings.cardOrder.random')?.trigger();
    const optionOrderSubmenu = settingsSubmenu?.findItemByTitle('study.menu.settings.choiceOptionOrder.label: 正序')?.getSubmenu() as TrackingMenu | null;
    optionOrderSubmenu?.findItemByTitle('study.menu.settings.choiceOptionOrder.random')?.trigger();

    expect(callbacks.onMediaAutoPlayChange).toHaveBeenCalledWith('enabled', true);
    expect(callbacks.onDirectDeleteToggle).toHaveBeenCalledWith(true);
    expect(callbacks.onClozeModeSwitchButtonToggle).toHaveBeenCalledWith(false);
    expect(callbacks.onCardOrderChange).toHaveBeenCalledWith('random');
    expect(callbacks.onChoiceOptionOrderChange).toHaveBeenCalledWith('random');
  });
});
