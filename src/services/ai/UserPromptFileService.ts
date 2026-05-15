import { App, TFile, normalizePath } from "obsidian";
import { getV2PathsFromApp } from "../../config/paths";
import { DirectoryUtils } from "../../utils/directory-utils";

export const USER_PROMPT_FOLDER_SEGMENT = "ai-assistant/user-prompts";
export const DEFAULT_USER_PROMPT_BASENAME = "用户提示词";
export const DEFAULT_USER_PROMPT_CONTENT = "请根据以下材料生成学习卡片：";

const INVALID_FILE_NAME_CHARS = /[\\/:*?"<>|]/g;

export function getUserPromptFolderPath(app: App): string {
	return normalizePath(`${getV2PathsFromApp(app).root}/${USER_PROMPT_FOLDER_SEGMENT}`);
}

export async function ensureUserPromptFolder(app: App): Promise<string> {
	const folderPath = getUserPromptFolderPath(app);
	await DirectoryUtils.ensureDirRecursive(app.vault.adapter, folderPath);
	return folderPath;
}

export function isUserPromptFilePath(app: App, filePath: string | null | undefined): boolean {
	if (!filePath) return false;
	const normalized = normalizePath(filePath);
	const folderPath = getUserPromptFolderPath(app);
	if (!normalized.endsWith(".md")) return false;
	return normalized.startsWith(`${folderPath}/`);
}

export function resolveUserPromptFile(app: App, filePath: string | null | undefined): TFile | null {
	if (!isUserPromptFilePath(app, filePath)) return null;
	const abstractFile = app.vault.getAbstractFileByPath(normalizePath(filePath as string));
	if (!(abstractFile instanceof TFile) || abstractFile.extension !== "md") return null;
	return abstractFile;
}

export async function listUserPromptFiles(app: App): Promise<TFile[]> {
	const folderPath = await ensureUserPromptFolder(app);
	const prefix = `${folderPath}/`;
	return app.vault
		.getMarkdownFiles()
		.filter((file) => file.path.startsWith(prefix))
		.sort((left, right) => {
			if (right.stat.mtime !== left.stat.mtime) {
				return right.stat.mtime - left.stat.mtime;
			}
			return left.path.localeCompare(right.path, "zh-Hans-CN");
		});
}

export function getUserPromptRelativePath(app: App, filePath: string): string {
	const folderPath = getUserPromptFolderPath(app);
	const prefix = `${folderPath}/`;
	const normalized = normalizePath(filePath);
	return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}

export async function createUserPromptFile(
	app: App,
	options?: { baseName?: string; initialContent?: string }
): Promise<TFile> {
	const folderPath = await ensureUserPromptFolder(app);
	const baseName = sanitizeBaseName(options?.baseName);
	const initialContent = options?.initialContent ?? DEFAULT_USER_PROMPT_CONTENT;

	for (let index = 0; index < 500; index++) {
		const suffix = index === 0 ? "" : ` ${index + 1}`;
		const filePath = normalizePath(`${folderPath}/${baseName}${suffix}.md`);
		if (!(await app.vault.adapter.exists(filePath))) {
			return app.vault.create(filePath, initialContent);
		}
	}

	const fallbackPath = normalizePath(`${folderPath}/${baseName}-${Date.now()}.md`);
	return app.vault.create(fallbackPath, initialContent);
}

function sanitizeBaseName(name?: string): string {
	const normalized = (name ?? DEFAULT_USER_PROMPT_BASENAME)
		.trim()
		.replace(/\.md$/i, "")
		.replace(INVALID_FILE_NAME_CHARS, "-");
	return normalized.length > 0 ? normalized : DEFAULT_USER_PROMPT_BASENAME;
}
