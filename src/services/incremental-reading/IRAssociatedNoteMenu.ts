import { Menu, TFile, normalizePath, type App } from "obsidian";

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
		openAllTitle = "打开关联笔记",
	} = options;

	if (notePaths.length > 0) {
		menu.addItem((item) =>
			item
				.setTitle(`打开主笔记: ${getLabel(notePaths[0])}`)
				.setIcon("file-text")
				.onClick(() => {
					void onOpen(notePaths[0]);
				})
		);

		menu.addItem((item) => {
			item.setTitle(openAllTitle).setIcon("files");
			const subMenu = (item as any).setSubmenu();
			for (const notePath of notePaths) {
				subMenu.addItem((subItem: any) => {
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
			.setTitle(notePaths.length > 0 ? "追加关联笔记" : "关联笔记")
			.setIcon("plus")
			.onClick(() => {
				void onPick(notePaths.length > 0 ? "append" : "replace");
			})
	);

	menu.addItem((item) =>
		item
			.setTitle(notePaths.length > 0 ? "新建并追加笔记" : "新建并关联笔记")
			.setIcon("file-plus")
			.onClick(() => {
				void onCreate(notePaths.length > 0 ? "append" : "replace");
			})
	);

	if (notePaths.length === 0) {
		return;
	}

	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle("设为主笔记").setIcon("star");
		const subMenu = (item as any).setSubmenu();
		for (const notePath of notePaths) {
			const isPrimary = notePath === notePaths[0];
			subMenu.addItem((subItem: any) => {
				subItem
					.setTitle(`${isPrimary ? "主笔记" : "设为主笔记"}: ${getLabel(notePath)}`)
					.setIcon(isPrimary ? "check" : "chevrons-up")
					.setDisabled(isPrimary)
					.onClick(() => {
						if (!isPrimary) {
							void onSetPrimary(notePath);
						}
					});
			});
		}
	});

	menu.addItem((item) => {
		item.setTitle("移除关联笔记").setIcon("trash");
		const subMenu = (item as any).setSubmenu();
		for (const notePath of notePaths) {
			subMenu.addItem((subItem: any) => {
				subItem
					.setTitle(getLabel(notePath))
					.setIcon("trash")
					.onClick(() => {
						void onRemove(notePath);
					});
			});
		}
	});

	menu.addSeparator();
	menu.addItem((item) =>
		item
			.setTitle("清空关联笔记")
			.setIcon("x-circle")
			.onClick(() => {
				void onClear();
			})
	);
}

function sanitizeAssociatedNoteBaseName(rawName: string): string {
	const normalized = String(rawName || "").trim().replace(/[\\/:*?"<>|#^\[\]]+/g, " ");
	const compact = normalized.replace(/\s+/g, " ").trim();
	return compact || "未命名笔记";
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
	await leaf.openFile(file, { active: true, state: { mode: "source" } as any });
	await app.workspace.revealLeaf(leaf);
	return file;
}

export function getAssociatedMarkdownLabel(app: App, notePath: string): string {
	const normalized = normalizePath(String(notePath || "").trim());
	if (!normalized) return "未命名笔记";

	let file = app.vault.getAbstractFileByPath(normalized);
	if (!(file instanceof TFile) && !/\.[^/.]+$/i.test(normalized)) {
		file = app.vault.getAbstractFileByPath(`${normalized}.md`);
	}

	if (file instanceof TFile) {
		return file.basename || "未命名笔记";
	}

	const filename = normalized.split("/").pop() || normalized;
	return filename.replace(/\.md$/i, "") || "未命名笔记";
}
