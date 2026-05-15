import { vi } from "vitest";

export function normalizeTestPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function parentPath(path: string): string {
	const normalized = normalizeTestPath(path);
	const idx = normalized.lastIndexOf("/");
	return idx > 0 ? normalized.slice(0, idx) : "";
}

export function createMemoryApp(options?: {
	initialFiles?: Record<string, string>;
	initialDirs?: string[];
	weavePlugin?: Record<string, unknown>;
}) {
	const initialFiles = options?.initialFiles || {};
	const initialDirs = options?.initialDirs || [];
	const files = new Map<string, string>();
	const folders = new Set<string>(["", ".obsidian", ".obsidian/plugins", ".obsidian/plugins/weave"]);

	const ensureDir = (dir: string) => {
		const normalized = normalizeTestPath(dir);
		if (!normalized) return;
		const parts = normalized.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			folders.add(current);
		}
	};

	const writeText = (path: string, content: string) => {
		const normalized = normalizeTestPath(path);
		ensureDir(parentPath(normalized));
		files.set(normalized, content);
	};

	for (const [path, content] of Object.entries(initialFiles)) {
		writeText(path, content);
	}

	for (const dir of initialDirs) {
		ensureDir(dir);
	}

	const adapter = {
		exists: vi.fn(async (path: string) => {
			const normalized = normalizeTestPath(path);
			return files.has(normalized) || folders.has(normalized);
		}),
		mkdir: vi.fn(async (path: string) => {
			ensureDir(path);
		}),
		list: vi.fn(async (dir: string) => {
			const normalized = normalizeTestPath(dir);
			const prefix = normalized ? `${normalized}/` : "";
			const childFolders = new Set<string>();
			const childFiles: string[] = [];

			for (const folder of folders) {
				if (!folder || folder === normalized || !folder.startsWith(prefix)) continue;
				const rest = folder.slice(prefix.length);
				if (!rest || rest.includes("/")) continue;
				childFolders.add(folder);
			}

			for (const file of files.keys()) {
				if (!file.startsWith(prefix)) continue;
				const rest = file.slice(prefix.length);
				if (!rest || rest.includes("/")) continue;
				childFiles.push(file);
			}

			return {
				files: childFiles.sort(),
				folders: Array.from(childFolders).sort(),
			};
		}),
		read: vi.fn(async (path: string) => {
			const normalized = normalizeTestPath(path);
			const value = files.get(normalized);
			if (value === undefined) {
				throw new Error(`File not found: ${normalized}`);
			}
			return value;
		}),
		write: vi.fn(async (path: string, content: string) => {
			writeText(path, content);
		}),
		remove: vi.fn(async (path: string) => {
			files.delete(normalizeTestPath(path));
		}),
		rmdir: vi.fn(async (dir: string, recursive = false) => {
			const normalized = normalizeTestPath(dir);
			if (recursive) {
				for (const file of Array.from(files.keys())) {
					if (file === normalized || file.startsWith(`${normalized}/`)) {
						files.delete(file);
					}
				}
				for (const folder of Array.from(folders)) {
					if (folder === normalized || folder.startsWith(`${normalized}/`)) {
						folders.delete(folder);
					}
				}
				return;
			}
			folders.delete(normalized);
		}),
	};

	const weavePlugin = {
		settings: {
			weaveParentFolder: "",
			...(typeof options?.weavePlugin?.settings === "object" ? (options.weavePlugin.settings as object) : {}),
		},
		...(options?.weavePlugin || {}),
	};

	const app = {
		vault: {
			configDir: ".obsidian",
			adapter,
		},
		plugins: {
			getPlugin: vi.fn((id?: string) => (id === "weave" ? weavePlugin : null)),
		},
	} as any;

	return { app, adapter, files, folders, weavePlugin };
}
