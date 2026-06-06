import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownRenderChild, TFile } from "obsidian";
import { ImageMaskIntegration } from "../image-mask/ImageMaskIntegration";

/**
 * 在 Obsidian 官方 Markdown 预览 / Live Preview 中应用图片遮罩。
 *
 * 设计原则：
 * - 只在渲染 markdown 预览时工作，不影响编辑器源文本。
 * - 使用现有的 ImageMaskIntegration / MaskRenderer 渲染 SVG 遮罩。
 * - 在笔记预览场景中始终启用交互模式：点击单个遮罩切换显示/隐藏。
 */
export function createImageMaskPostProcessor(app: App) {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    ctx.addChild(new ImageMaskRenderChild(app, el, ctx));
  };
}

class ImageMaskRenderChild extends MarkdownRenderChild {
  private readonly app: App;
  private readonly ctx: MarkdownPostProcessorContext;
  private readonly integration: ImageMaskIntegration;
  private readonly sourcePath: string;

  private observer: MutationObserver | null = null;
  private scheduled = false;
  private lastAppliedSignature = "";

  constructor(app: App, containerEl: HTMLElement, ctx: MarkdownPostProcessorContext) {
    super(containerEl);
    this.app = app;
    this.ctx = ctx;
    this.integration = new ImageMaskIntegration(app);
    this.sourcePath = String(ctx.sourcePath || "").trim();
  }

  onload(): void {
    if (!this.sourcePath) return;

    // Live Preview 会频繁替换 DOM 节点，必须用生命周期组件绑定并观察变化。
    this.observer = new MutationObserver(() => this.scheduleApply());
    this.observer.observe(this.containerEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "class"],
    });

    this.scheduleApply();
  }

  onunload(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.scheduled = false;
  }

  private scheduleApply(): void {
    if (this.scheduled) return;
    this.scheduled = true;

    // 用 rAF 合并高频变化，避免编辑时卡顿（非强制，只是节流）。
    requestAnimationFrame(() => {
      this.scheduled = false;
      void this.tryApplyOnce();
    });
  }

  private async tryApplyOnce(): Promise<void> {
    if (!this.containerEl?.isConnected) return;

    const abstract = this.app.vault.getAbstractFileByPath(this.sourcePath);
    if (!(abstract instanceof TFile)) return;
    if (abstract.extension !== "md") return;

    const imgs = this.containerEl.querySelectorAll("img");
    if (imgs.length === 0) return;

    // 等待图片完成加载（内部 embed 经常先插入占位，再异步补 src）
    await Promise.all(
      Array.from(imgs).map((node) => {
        const img = node as HTMLImageElement;
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
          setTimeout(() => resolve(), 1000);
        });
      })
    );

    const content = await this.app.vault.cachedRead(abstract);

    // 用“图片数量 + 文件 mtime”做轻量签名，避免无意义重复 apply
    const stat = await this.app.vault.adapter.stat(this.sourcePath).catch(() => null);
    const signature = `${imgs.length}:${stat?.mtime ?? 0}`;
    if (signature === this.lastAppliedSignature) return;
    this.lastAppliedSignature = signature;

    // 在普通笔记预览（阅读/Live Preview）中：始终启用单遮罩点击切换
    this.integration.applyMasksInContainer(this.containerEl, content, true, this.sourcePath);
  }
}

