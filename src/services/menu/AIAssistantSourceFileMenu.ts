import { Menu, TFile } from "obsidian";
import { addMenuRadioChoice, addMenuSubmenuGroup } from "../../utils/obsidian-menu";

export interface AIAssistantSourceFileMenuOptions {
	files: TFile[];
	currentFilePath?: string | null;
	onSelect: (file: TFile) => void | Promise<void>;
}

export interface AIAssistantSourceFileMenuNode {
	kind: "folder" | "file";
	name: string;
	path: string;
	file?: TFile;
	children?: AIAssistantSourceFileMenuNode[];
}

const EMPTY_MENU_LABEL = "\u5f53\u524d\u4ed3\u5e93\u91cc\u8fd8\u6ca1\u6709 Markdown \u6587\u4ef6";
const CURRENT_FILE_LABEL_PREFIX = "\u5f53\u524d\u6587\u4ef6\uff1a";
const ALL_FILES_LABEL = "\u5168\u90e8 Markdown \u6587\u4ef6";
const menuLabelCollator = new Intl.Collator("zh-Hans-CN", {
	numeric: true,
	sensitivity: "base",
});

export function compareAIAssistantMenuLabel(left: string, right: string): number {
	return menuLabelCollator.compare(left, right);
}

export function buildAIAssistantSourceFileTree(
	files: TFile[]
): AIAssistantSourceFileMenuNode[] {
	const root: AIAssistantSourceFileMenuNode[] = [];

	for (const file of files) {
		insertFileNode(root, file.path.split("/"), file);
	}

	sortMenuNodes(root);
	return root;
}

export function buildAIAssistantSourceFileMenu(
	menu: Menu,
	options: AIAssistantSourceFileMenuOptions
): void {
	const files = [...options.files];
	if (files.length === 0) {
		menu.addItem((item) => {
			item.setTitle(EMPTY_MENU_LABEL).setDisabled(true);
		});
		return;
	}

	const currentFile = options.currentFilePath
		? files.find((file) => file.path === options.currentFilePath) ?? null
		: null;

	if (currentFile) {
		menu.addItem((item) => {
			item
				.setTitle(`${CURRENT_FILE_LABEL_PREFIX}${currentFile.name}`)
				.setIcon("check")
				.setDisabled(true);
		});
		menu.addSeparator();
	}
	menu.addItem((item) => {
		item.setTitle(ALL_FILES_LABEL).setDisabled(true);
	});

	populateAIAssistantSourceFileTreeMenu(
		menu,
		buildAIAssistantSourceFileTree(files),
		options.currentFilePath ?? null,
		options.onSelect
	);
}

function populateAIAssistantSourceFileTreeMenu(
	menu: Menu,
	nodes: AIAssistantSourceFileMenuNode[],
	currentFilePath: string | null,
	onSelect: (file: TFile) => void | Promise<void>
): void {
	for (const node of nodes) {
		if (node.kind === "folder") {
			addMenuSubmenuGroup(menu, { title: node.name, icon: "folder-open" }, (submenu) => {
				populateAIAssistantSourceFileTreeMenu(
					submenu,
					node.children ?? [],
					currentFilePath,
					onSelect
				);
			});
			continue;
		}

		if (!node.file) {
			continue;
		}
		const file = node.file;

		addMenuRadioChoice(
			menu,
			{ title: node.name, icon: "file-text", value: file },
			currentFilePath === file.path,
			(selectedFile) => {
				void onSelect(selectedFile);
			}
		);
	}
}

function insertFileNode(
	nodes: AIAssistantSourceFileMenuNode[],
	segments: string[],
	file: TFile,
	parentPath = ""
): void {
	const [current, ...rest] = segments;
	if (!current) {
		return;
	}

	const currentPath = parentPath ? `${parentPath}/${current}` : current;

	if (rest.length === 0) {
		nodes.push({
			kind: "file",
			name: file.name || current,
			path: file.path,
			file,
		});
		return;
	}

	let folderNode = nodes.find(
		(node) => node.kind === "folder" && node.path === currentPath
	);

	if (!folderNode) {
		folderNode = {
			kind: "folder",
			name: current,
			path: currentPath,
			children: [],
		};
		nodes.push(folderNode);
	}

	insertFileNode(folderNode.children ?? [], rest, file, currentPath);
}

function sortMenuNodes(nodes: AIAssistantSourceFileMenuNode[]): void {
	nodes.sort((left, right) => {
		if (left.kind !== right.kind) {
			return left.kind === "folder" ? -1 : 1;
		}

		return compareAIAssistantMenuLabel(left.name, right.name);
	});

	for (const node of nodes) {
		if (node.kind === "folder" && node.children) {
			sortMenuNodes(node.children);
		}
	}
}
