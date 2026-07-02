import { Menu, TFile, normalizePath, type App } from "obsidian";
import { addMenuSubmenuGroup } from "../../utils/obsidian-menu";
import { i18n } from "../../utils/i18n";
import { revealLeaf } from "../../utils/workspace-navigation";

export interface AssociatedNoteMenuOptions {
	menu: Menu;
	notePaths: string[];
	getLabel: (notePath: string) => string;
	onOpen: (notePath: string) => void | Promise<void>;
	onPick: (mode: "replace" | "append") => void | Promise<void>;
	onCreate: (mode: "replace" | "append") => void | Promise<void>;
	onSetPrimary: (notePath: string) => void | Promise<void>;
	onRemove: (notePath: string) => void | Promise<void>;
	onClear: () => void | Promise<void>;
	openAllTitle?: string;
}

function uiText(zh: string, en: string): string {
	return i18n.getCurrentLanguage() === "zh-CN" ? zh : en;
}

function untitledNoteLabel(): string {
	return uiText("\u672a\u547d\u540d\u7b14\u8bb0", "Untitled note");
}

export function populateAssociatedNoteMenu(options: AssociatedNoteMenuOptions): void {
	const {
		menu,
		notePaths,
		getLabel,
		onOpen,
		onPick,
		onCreate,
		onSetPrimary,
		onRemove,
		onClear,
		openAllTitle = uiText("\u6253\u5f00\u5173\u8054\u7b14\u8bb0", "Open linked notes"),
	} = options;

	if (notePaths.length > 0) {
		menu.addItem((item) =>
			item
				.setTitle(
					uiText(
						`\u6253\u5f00\u4e3b\u7b14\u8bb0\uff1a${getLabel(notePaths[0])}`,
						`Open primary note: ${getLabel(notePaths[0])}`
					)
				)
				.setIcon("file-text")
				.onClick(() => {
					void onOpen(notePaths[0]);
				})
		);

		addMenuSubmenuGroup(menu, { title: openAllTitle, icon: "files" }, (subMenu) => {
			for (const notePath of notePaths) {
				subMenu.addItem((subItem) => {
					subItem
						.setTitle(getLabel(notePath))
						.setIcon("file-text")
						.onClick(() => {
							void onOpen(notePath);
						});
				});
			}
		});

		menu.addSeparator();
	}

	menu.addItem((item) =>
		item
			.setTitle(
				notePaths.length > 0
					? uiText("\u8ffd\u52a0\u5173\u8054\u7b14\u8bb0", "Add linked note")
					: uiText("\u5173\u8054\u7b14\u8bb0", "Link note")
			)
			.setIcon("plus")
			.onClick(() => {
				void onPick(notePaths.length > 0 ? "append" : "replace");
			})
	);

	menu.addItem((item) =>
		item
			.setTitle(
				notePaths.length > 0
					? uiText("\u65b0\u5efa\u5e76\u8ffd\u52a0\u7b14\u8bb0", "Create and add note")
					: uiText("\u65b0\u5efa\u5e76\u5173\u8054\u7b14\u8bb0", "Create and link note")
			)
			.setIcon("file-plus")
			.onClick(() => {
				void onCreate(notePaths.length > 0 ? "append" : "replace");
			})
	);

	if (notePaths.length === 0) {
		return;
	}

	menu.addSeparator();

	addMenuSubmenuGroup(
		menu,
		{ title: uiText("\u8bbe\u4e3a\u4e3b\u7b14\u8bb0", "Set primary note"), icon: "star" },
		(subMenu) => {
			for (const notePath of notePaths) {
				const isPrimary = notePath === notePaths[0];
				subMenu.addItem((subItem) => {
					subItem
						.setTitle(
							`${isPrimary ? uiText("\u4e3b\u7b14\u8bb0", "Primary") : uiText("\u8bbe\u4e3a\u4e3b\u7b14\u8bb0", "Set primary note")}: ${getLabel(notePath)}`
						)
						.setIcon(isPrimary ? "check" : "chevrons-up")
						.setDisabled(isPrimary)
						.onClick(() => {
							if (!isPrimary) {
								void onSetPrimary(notePath);
							}
						});
				});
			}
		}
	);

	addMenuSubmenuGroup(
		menu,
		{ title: uiText("\u79fb\u9664\u5173\u8054\u7b14\u8bb0", "Remove linked note"), icon: "trash" },
		(subMenu) => {
			for (const notePath of notePaths) {
				subMenu.addItem((subItem) => {
					subItem
						.setTitle(getLabel(notePath))
						.setIcon("trash")
						.onClick(() => {
							void onRemove(notePath);
						});
				});
			}
		}
	);

	menu.addSeparator();
	menu.addItem((item) =>
		item
			.setTitle(uiText("\u6e05\u7a7a\u5173\u8054\u7b14\u8bb0", "Clear linked notes"))
			.setIcon("x-circle")
			.onClick(() => {
				void onClear();
			})
	);
}

function sanitizeAssociatedNoteBaseName(rawName: string): string {
	const normalized = String(rawName || "").trim().replace(/[\\/:*?"<>|#^[\]]+/g, " ");
	const compact = normalized.replace(/\s+/g, " ").trim();
	return compact || untitledNoteLabel();
}

async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const normalized = normalizePath(folderPath || "");
	if (!normalized) return;

	const parts = normalized.split("/").filter(Boolean);
	let currentPath = "";
	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(currentPath);
		if (!existing) {
			await app.vault.createFolder(currentPath);
		}
	}
}

export function resolvePreferredAssociatedNoteFolder(
	app: App,
	options: {
		notePaths?: string[];
		fallbackFilePath?: string;
	}
): string {
	for (const notePath of options.notePaths || []) {
		const normalizedNotePath = normalizePath(String(notePath || "").trim());
		if (!normalizedNotePath) continue;
		const slashIndex = normalizedNotePath.lastIndexOf("/");
		if (slashIndex > 0) {
			return normalizedNotePath.slice(0, slashIndex);
		}
	}

	const fallbackFilePath = normalizePath(String(options.fallbackFilePath || "").trim());
	if (fallbackFilePath) {
		const slashIndex = fallbackFilePath.lastIndexOf("/");
		if (slashIndex > 0) {
			return fallbackFilePath.slice(0, slashIndex);
		}
	}

	const activeFile = app.workspace.getActiveFile();
	if (activeFile?.parent?.path) {
		return normalizePath(activeFile.parent.path);
	}

	return "";
}

export async function createAssociatedMarkdownNote(
	app: App,
	options: {
		baseName: string;
		preferredFolderPath?: string;
		initialContent?: string;
	}
): Promise<TFile> {
	const folderPath = normalizePath(String(options.preferredFolderPath || "").trim());
	if (folderPath) {
		await ensureFolderExists(app, folderPath);
	}

	const safeBaseName = sanitizeAssociatedNoteBaseName(options.baseName);
	const basePath = folderPath ? `${folderPath}/${safeBaseName}` : safeBaseName;
	let targetPath = normalizePath(`${basePath}.md`);
	let counter = 2;

	while (app.vault.getAbstractFileByPath(targetPath)) {
		targetPath = normalizePath(`${basePath} ${counter}.md`);
		counter += 1;
	}

	const content = String(options.initialContent || "").replace(/\r\n?/g, "\n");
	return await app.vault.create(targetPath, content);
}

export async function openAssociatedMarkdownNote(app: App, notePath: string): Promise<TFile | null> {
	const normalized = normalizePath(String(notePath || "").trim());
	if (!normalized) return null;

	let file = app.vault.getAbstractFileByPath(normalized);
	if (!(file instanceof TFile) && !/\.[^/.]+$/i.test(normalized)) {
		file = app.vault.getAbstractFileByPath(`${normalized}.md`);
	}

	if (!(file instanceof TFile)) {
		return null;
	}

	const leaf = app.workspace.getRightLeaf(false) || app.workspace.getLeaf("tab");
	await leaf.openFile(file, {
		active: true,
		state: { mode: "source" } as Record<string, unknown>,
	});
	revealLeaf(app, leaf);
	return file;
}

export function getAssociatedMarkdownLabel(app: App, notePath: string): string {
	const normalized = normalizePath(String(notePath || "").trim());
	if (!normalized) return untitledNoteLabel();

	let file = app.vault.getAbstractFileByPath(normalized);
	if (!(file instanceof TFile) && !/\.[^/.]+$/i.test(normalized)) {
		file = app.vault.getAbstractFileByPath(`${normalized}.md`);
	}

	if (file instanceof TFile) {
		return file.basename || untitledNoteLabel();
	}

	const filename = normalized.split("/").pop() || normalized;
	return filename.replace(/\.md$/i, "") || untitledNoteLabel();
}
