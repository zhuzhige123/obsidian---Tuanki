import { App, Notice } from "obsidian";
import { resolveEpubHost } from "./epub-host";

export function ensureEpubPremiumAccess(app: App, noticeMessage = "EPUB 阅读器是高级功能，请激活许可证后使用"): boolean {
  const host = resolveEpubHost(app);
  if (!host?.hasEpubPremiumAccess) {
    return true;
  }

  if (host.hasEpubPremiumAccess()) {
    return true;
  }

  new Notice(noticeMessage);
  host.openEpubPremiumSettings?.();
  return false;
}
