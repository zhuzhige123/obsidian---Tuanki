<script lang="ts">
  import { FuzzySuggestModal, TFile, TFolder } from "obsidian";
  import type { Card } from "../../data/types";
  import type { WeavePlugin } from "../../main";
  import { MAIN_SEPARATOR } from "../../constants/markdown-delimiters";
  import { sanitizeFileName } from "../../utils/card-export-utils";
  import { extractBodyContent } from "../../utils/yaml-utils";
  import { applyStyleProps } from "../../utils/style-props";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";

  interface ConfirmPayload {
    mode: "create" | "append";
    folderPath: string;
    fileName: string;
    targetFilePath: string;
    deleteOriginal: boolean;
  }

  interface Props {
    open: boolean;
    plugin: WeavePlugin;
    card: Card | null;
    busy?: boolean;
    onClose: () => void;
    onConfirm: (payload: ConfirmPayload) => void | Promise<void>;
  }

  let {
    open,
    plugin,
    card,
    busy = false,
    onClose,
    onConfirm
  }: Props = $props();

  let mode = $state<"create" | "append">("create");
  let folderPath = $state("");
  let fileName = $state("");
  let targetFilePath = $state("");
  let deleteOriginal = $state(false);

  class VaultFolderPickerModal extends FuzzySuggestModal<string> {
    private readonly items: string[];
    private readonly choose: (value: string) => void;

    constructor(app: WeavePlugin["app"], items: string[], choose: (value: string) => void) {
      super(app);
      this.items = items;
      this.choose = choose;
    }

    getItems(): string[] {
      return this.items;
    }

    getItemText(item: string): string {
      return item || "/（Vault 根目录）";
    }

    onChooseItem(item: string): void {
      this.choose(item);
    }
  }

  class MarkdownFilePickerModal extends FuzzySuggestModal<TFile> {
    private readonly items: TFile[];
    private readonly choose: (value: TFile) => void;

    constructor(app: WeavePlugin["app"], items: TFile[], choose: (value: TFile) => void) {
      super(app);
      this.items = items;
      this.choose = choose;
    }

    getItems(): TFile[] {
      return this.items;
    }

    getItemText(item: TFile): string {
      return item.path;
    }

    onChooseItem(item: TFile): void {
      this.choose(item);
    }
  }

  function ensureMdExtension(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "";
    return trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
  }

  function portalToBody(node: HTMLElement) {
    if (typeof document === "undefined" || !document.body) {
      return;
    }

    document.body.appendChild(node);

    return {
      destroy() {
        if (node.isConnected) {
          node.remove();
        }
      }
    };
  }

  function getCardLabel(sourceCard: Card | null): string {
    if (!sourceCard) return "";
    const body = extractBodyContent(sourceCard.content || "").trim();
    const frontPart = (body.split(MAIN_SEPARATOR)[0] || body).trim();
    const lines = frontPart
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const cleaned = line.replace(/^#{1,6}\s+/, "").replace(/^>\s*/, "").trim();
      if (!cleaned) continue;
      if (/^---+$/.test(cleaned)) continue;
      if (/^[A-Za-z_][\w-]*\s*:\s*/.test(cleaned)) continue;
      if (/^-\s+/.test(cleaned)) continue;
      return cleaned;
    }

    return `Weave Card ${sourceCard.uuid.slice(0, 8)}`;
  }

  function getDefaultFileName(sourceCard: Card | null): string {
    const baseName = sanitizeFileName(getCardLabel(sourceCard)).trim();
    const fallback = sourceCard ? `Weave Card ${sourceCard.uuid.slice(0, 8)}` : "Weave Card";
    return ensureMdExtension(baseName || fallback);
  }

  function collectFolders(): string[] {
    const folders: string[] = [""];

    function walk(folder: TFolder) {
      if (folder.path) {
        folders.push(folder.path);
      }
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          walk(child);
        }
      }
    }

    walk(plugin.app.vault.getRoot());
    return folders.sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  function openFolderPicker() {
    const modal = new VaultFolderPickerModal(plugin.app, collectFolders(), (value) => {
      folderPath = value;
    });
    modal.setPlaceholder("选择保存文件夹...");
    modal.open();
  }

  function openMarkdownFilePicker() {
    const files = [...plugin.app.vault.getMarkdownFiles()].sort((a, b) =>
      a.path.localeCompare(b.path, "zh-CN")
    );
    const modal = new MarkdownFilePickerModal(plugin.app, files, (value) => {
      targetFilePath = value.path;
    });
    modal.setPlaceholder("选择要追加的 Markdown 文件...");
    modal.open();
  }

  const confirmDisabled = $derived.by(() => {
    if (busy || !card) return true;
    if (mode === "create") {
      return !fileName.trim();
    }
    return !targetFilePath.trim();
  });

  $effect(() => {
    if (!open) return;
    mode = "create";
    folderPath = "";
    fileName = getDefaultFileName(card);
    targetFilePath = "";
    deleteOriginal = false;
  });

  $effect(() => {
    if (!open || typeof document === "undefined" || !document.body) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    applyStyleProps(document.body, { overflow: "hidden" });

    return () => {
      applyStyleProps(document.body, {
        overflow: previousOverflow || null
      });
    };
  });

  function handleOverlayClick(event: MouseEvent) {
    if (busy) return;
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onClose();
    }
  }

  async function handleSubmit() {
    if (confirmDisabled) return;
    await Promise.resolve(
      onConfirm({
        mode,
        folderPath: folderPath.trim(),
        fileName: ensureMdExtension(fileName),
        targetFilePath: targetFilePath.trim(),
        deleteOriginal
      })
    );
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && card}
  <div
    class="card-to-md-overlay"
    use:portalToBody
    role="presentation"
    onclick={handleOverlayClick}
    onkeydown={handleKeydown}
    tabindex="-1"
  >
    <div
      class="card-to-md-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-to-md-title"
      tabindex="0"
      onkeydown={handleKeydown}
    >
      <header class="card-to-md-header">
        <div class="card-to-md-header-copy">
          <h2 id="card-to-md-title">转换为 MD 文件</h2>
        </div>
        <button class="icon-btn" type="button" onclick={onClose} disabled={busy} aria-label="关闭">
          <EnhancedIcon name="x" size={16} />
        </button>
      </header>

      <div class="card-to-md-body">
        <div class="mode-group">
          <label class="mode-option" class:active={mode === "create"}>
            <input type="radio" bind:group={mode} value="create" />
            <span>新建 md 文件</span>
          </label>
          <label class="mode-option" class:active={mode === "append"}>
            <input type="radio" bind:group={mode} value="append" />
            <span>追加到已有 md 文件</span>
          </label>
        </div>

        {#if mode === "create"}
          <div class="field-group">
            <label for="card-to-md-folder">保存文件夹</label>
            <div class="picker-row">
              <input
                id="card-to-md-folder"
                type="text"
                bind:value={folderPath}
                placeholder="留空则保存到 Vault 根目录"
                disabled={busy}
              />
              <button type="button" class="picker-btn" onclick={openFolderPicker} disabled={busy}>
                <EnhancedIcon name="folder" size={14} />
                选择
              </button>
            </div>
          </div>

          <div class="field-group">
            <label for="card-to-md-file-name">文件名</label>
            <input
              id="card-to-md-file-name"
              type="text"
              bind:value={fileName}
              placeholder="请输入文件名"
              disabled={busy}
            />
          </div>
        {:else}
          <div class="field-group">
            <label for="card-to-md-target-file">目标 Markdown 文件</label>
            <div class="picker-row">
              <input
                id="card-to-md-target-file"
                type="text"
                bind:value={targetFilePath}
                placeholder="请选择或输入现有 md 文件路径"
                disabled={busy}
              />
              <button type="button" class="picker-btn" onclick={openMarkdownFilePicker} disabled={busy}>
                <EnhancedIcon name="file-text" size={14} />
                选择
              </button>
            </div>
          </div>
        {/if}

        <label class="checkbox-row">
          <input type="checkbox" bind:checked={deleteOriginal} disabled={busy} />
          <span>转换完成后删除对应的 Weave 卡片</span>
        </label>

        <div class="hint-box">
          新建时会生成单独的 Markdown 文件；追加时会把当前卡片内容追加到目标文件末尾，并自动插入分隔线。
        </div>
      </div>

      <footer class="card-to-md-footer">
        <button type="button" class="secondary-btn" onclick={onClose} disabled={busy}>
          取消
        </button>
        <button type="button" class="primary-btn" onclick={handleSubmit} disabled={confirmDisabled}>
          {busy ? "转换中..." : "开始转换"}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .card-to-md-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: var(--layer-modal, 50);
  }

  .card-to-md-modal {
    width: min(560px, calc(100vw - 32px));
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 16px;
    box-shadow: var(--shadow-l);
    display: flex;
    flex-direction: column;
    max-height: min(720px, calc(100vh - 48px));
    overflow: hidden;
  }

  .card-to-md-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 22px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .card-to-md-header-copy h2 {
    margin: 0;
    font-size: 20px;
  }

  .icon-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .card-to-md-body {
    padding: 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow: auto;
  }

  .mode-group {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .mode-option {
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    padding: 12px 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: var(--text-normal);
    background: var(--background-secondary);
  }

  .mode-option.active {
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-primary));
  }

  .mode-option input {
    margin: 0;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-group label {
    font-size: 13px;
    color: var(--text-muted);
  }

  .field-group input {
    width: 100%;
    min-height: 38px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
  }

  .picker-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
  }

  .picker-btn,
  .secondary-btn,
  .primary-btn {
    min-height: 38px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    font-size: 13px;
  }

  .picker-btn,
  .secondary-btn {
    background: var(--background-secondary);
    color: var(--text-normal);
  }

  .primary-btn {
    background: var(--interactive-accent);
    color: var(--text-on-accent, white);
    border-color: var(--interactive-accent);
  }

  .picker-btn:hover:not(:disabled),
  .secondary-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .primary-btn:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: var(--text-normal);
  }

  .checkbox-row input {
    margin: 0;
  }

  .hint-box {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--background-secondary);
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.6;
  }

  .card-to-md-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 22px 20px;
    border-top: 1px solid var(--background-modifier-border);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .card-to-md-overlay {
      padding: 12px;
      align-items: flex-end;
    }

    .card-to-md-modal {
      width: 100%;
      max-height: min(760px, calc(100vh - 16px));
      border-radius: 18px 18px 0 0;
    }

    .mode-group {
      grid-template-columns: 1fr;
    }

    .picker-row {
      grid-template-columns: 1fr;
    }

    .card-to-md-footer {
      flex-direction: column-reverse;
    }

    .secondary-btn,
    .primary-btn {
      width: 100%;
    }
  }
</style>
