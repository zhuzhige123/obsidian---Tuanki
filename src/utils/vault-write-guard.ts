import type { TFile, Vault } from "obsidian";

export type VaultWriteResult = {
	written: boolean;
	skipped: boolean;
};

type AdapterLike = {
	read: (path: string) => Promise<string>;
	write: (path: string, data: string) => Promise<void>;
	exists: (path: string) => Promise<boolean>;
};

export type VaultAdapterLike = AdapterLike;

type VaultModifyOptions = {
	ctime?: number;
	mtime?: number;
};

/** 统一换行符，避免跨平台 diff 误判 */
export function normalizeTextForCompare(content: string): string {
	return String(content ?? "").replace(/\r\n/g, "\n");
}

export function textContentEquals(existing: string, next: string): boolean {
	return normalizeTextForCompare(existing) === normalizeTextForCompare(next);
}

/**
 * 仅在内容变化时写入 adapter 路径。
 * 用于避免插件启动或规范化流程无意义 touch 文件 mtime，从而干扰多端同步。
 */
export async function adapterWriteIfChanged(
	adapter: AdapterLike,
	filePath: string,
	content: string
): Promise<VaultWriteResult> {
	try {
		if (await adapter.exists(filePath)) {
			const current = await adapter.read(filePath);
			if (textContentEquals(current, content)) {
				return { written: false, skipped: true };
			}
		}
	} catch {
		// 文件不存在或不可读时继续写入
	}

	await adapter.write(filePath, content);
	return { written: true, skipped: false };
}

/** 仅在内容变化时调用 vault.modify */
export async function modifyVaultFileIfChanged(
	vault: Vault,
	file: TFile,
	content: string,
	options: VaultModifyOptions = {}
): Promise<VaultWriteResult> {
	let current = "";
	try {
		current = await vault.read(file);
	} catch {
		current = "";
	}

	if (textContentEquals(current, content)) {
		return { written: false, skipped: true };
	}

	await vault.modify(file, content, options);
	return { written: true, skipped: false };
}
