import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { Menu } from 'obsidian';
import type { MenuItem as MockMenuItem } from '../../tests/mocks/obsidian';
import CardSearchInput from './CardSearchInput.svelte';

const floatingUiMocks = vi.hoisted(() => ({
  computePosition: vi.fn(),
  autoUpdate: vi.fn()
}));

vi.mock('@floating-ui/dom', () => ({
  computePosition: floatingUiMocks.computePosition,
  autoUpdate: floatingUiMocks.autoUpdate,
  flip: vi.fn(() => ({ name: 'flip' })),
  shift: vi.fn(() => ({ name: 'shift' })),
  offset: vi.fn(() => ({ name: 'offset' }))
}));

type TrackingMenuInstance = Menu & {
  getItems(): MockMenuItem[];
};

const menuInstances: TrackingMenuInstance[] = [];

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

vi.mock('../../utils/vault-local-storage', () => ({
  vaultStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn()
  }
}));

describe('CardSearchInput', () => {
  beforeEach(() => {
    menuInstances.length = 0;
    floatingUiMocks.computePosition.mockResolvedValue({ x: 120, y: 80 });
    floatingUiMocks.autoUpdate.mockImplementation((_anchor, _menu, update) => {
      void update();
      return vi.fn();
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.querySelectorAll('.floating-menu').forEach((element) => element.remove());
  });

  function getEnabledMenuTitles(menu: TrackingMenuInstance): string[] {
    return menu
      .getItems()
      .filter((item) => !item.isDisabled())
      .map((item) => item.getTitle());
  }

  it('tag: 建议会展示完整标签列表，不再截断到前 20 项', async () => {
    const tags = Array.from({ length: 25 }, (_, index) => `tag-${index + 1}`);
    const { container } = render(CardSearchInput, {
      props: {
        app: {} as any,
        availableTags: tags
      }
    });

    const input = container.querySelector('input') as HTMLInputElement;
    input.value = 'tag:';
    input.setSelectionRange(input.value.length, input.value.length);

    await fireEvent.input(input);

    const menu = menuInstances.at(-1);
    expect(menu).toBeTruthy();
    expect(getEnabledMenuTitles(menu!)).toHaveLength(25);
    expect(getEnabledMenuTitles(menu!)).toContain('tag-25');
  });

  it('tag: 后继续输入时会按已输入内容过滤标签建议', async () => {
    const { container } = render(CardSearchInput, {
      props: {
        app: {} as any,
        availableTags: ['alpha', 'beta', 'gamma', 'gamut']
      }
    });

    const input = container.querySelector('input') as HTMLInputElement;
    input.value = 'tag:ga';
    input.setSelectionRange(input.value.length, input.value.length);

    await fireEvent.input(input);

    const menu = menuInstances.at(-1);
    expect(menu).toBeTruthy();
    expect(getEnabledMenuTitles(menu!)).toEqual(['gamma', 'gamut']);
  });

  it('搜索面板会 portal 到 body，避免被卡片网格层级穿透', async () => {
    const { container } = render(CardSearchInput, {
      props: {
        app: {} as any
      }
    });

    const input = container.querySelector('input') as HTMLInputElement;
    await fireEvent.focus(input);

    await waitFor(() => {
      const floatingMenu = document.body.querySelector('.floating-menu.card-search-floating-menu');
      expect(floatingMenu).toBeInTheDocument();
      expect(floatingMenu?.parentElement).toBe(document.body);
      expect(floatingMenu?.querySelector('.search-dropdown')).toBeInTheDocument();
    });

    expect(container.querySelector('.search-dropdown')).not.toBeInTheDocument();
  });
});
