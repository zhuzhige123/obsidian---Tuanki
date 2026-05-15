import { describe, expect, it, vi } from 'vitest';
import { Menu, type MenuItem } from '../../tests/mocks/obsidian';
import { populateCalendarBackgroundWallMenu } from './ir-calendar-tools-menu';

type TrackingMenu = Menu & {
  findItemByTitle(title: string): MenuItem | undefined;
};

describe('populateCalendarBackgroundWallMenu', () => {
  it('统一保留背景墙子菜单结构', () => {
    const menu = new Menu() as TrackingMenu;
    const onChoose = vi.fn();
    const onClear = vi.fn();
    const onSetFade = vi.fn();

    populateCalendarBackgroundWallMenu(menu, {
      backgroundWallTitle: '背景墙',
      chooseTitle: '选择图片',
      clearTitle: '清除图片',
      fadeTitle: '设置淡化 70%',
      hasImage: true,
      onChoose,
      onClear,
      onSetFade,
    });

    const submenu = menu.findItemByTitle('背景墙')?.getSubmenu() as TrackingMenu | null;
    expect(submenu).toBeTruthy();

    submenu?.findItemByTitle('选择图片')?.trigger();
    submenu?.findItemByTitle('清除图片')?.trigger();
    submenu?.findItemByTitle('设置淡化 70%')?.trigger();

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSetFade).toHaveBeenCalledTimes(1);
  });

  it('在没有背景图时禁用清除动作', () => {
    const menu = new Menu() as TrackingMenu;

    populateCalendarBackgroundWallMenu(menu, {
      backgroundWallTitle: '背景墙',
      chooseTitle: '选择图片',
      clearTitle: '清除图片',
      fadeTitle: '设置淡化 70%',
      hasImage: false,
      onChoose: vi.fn(),
      onClear: vi.fn(),
      onSetFade: vi.fn(),
    });

    const submenu = menu.findItemByTitle('背景墙')?.getSubmenu() as TrackingMenu | null;
    expect(submenu).toBeTruthy();
    expect(submenu?.findItemByTitle('选择图片')).toBeTruthy();
    expect(submenu?.findItemByTitle('清除图片')?.isDisabled()).toBe(true);
    expect(submenu?.findItemByTitle('设置淡化 70%')).toBeTruthy();
  });
});
