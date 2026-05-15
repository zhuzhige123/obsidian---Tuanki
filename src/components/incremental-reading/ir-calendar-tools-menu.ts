interface CalendarBackgroundWallMenuOptions {
  backgroundWallTitle: string;
  chooseTitle: string;
  clearTitle: string;
  fadeTitle: string;
  hasImage: boolean;
  onChoose: () => void;
  onClear: () => void;
  onSetFade: () => void;
}

interface CalendarMenuItemLike {
  setTitle(title: string): this;
  setIcon(icon: string): this;
  setDisabled(disabled: boolean): this;
  onClick(callback: () => void): this;
  setSubmenu?(): CalendarMenuLike;
}

interface CalendarMenuLike {
  addItem(callback: (item: CalendarMenuItemLike) => void): unknown;
}

export function populateCalendarBackgroundWallMenu(
  menu: CalendarMenuLike,
  options: CalendarBackgroundWallMenuOptions
): void {
  menu.addItem((item) => {
    item.setTitle(options.backgroundWallTitle).setIcon("image");
    const sub = item.setSubmenu?.();

    if (!sub) {
      return;
    }

    sub.addItem((subItem) => {
      subItem
        .setTitle(options.chooseTitle)
        .setIcon("image-plus")
        .onClick(() => {
          options.onChoose();
        });
    });

    sub.addItem((subItem) => {
      subItem
        .setTitle(options.clearTitle)
        .setIcon("image-off")
        .setDisabled(!options.hasImage)
        .onClick(() => {
          options.onClear();
        });
    });

    sub.addItem((subItem) => {
      subItem
        .setTitle(options.fadeTitle)
        .setIcon("sliders-horizontal")
        .onClick(() => {
          options.onSetFade();
        });
    });
  });
}
