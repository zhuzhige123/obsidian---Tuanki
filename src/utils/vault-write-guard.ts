import { normalizePath, TFile, type Vault } from "obsidian";

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

	try {
		await adapter.write(filePath, content);
		return { written: true, skipped: false };
	} catch (error) {
		if (!isVaultFileAlreadyExistsError(error)) {
			throw error;
		}

		const current = await adapter.read(filePath);
		if (textContentEquals(current, content)) {
			return { written: false, skipped: true };
		}

		await adapter.write(filePath, content);
		return { written: true, skipped: false };
	}
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

export function isVaultFileAlreadyExistsError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return message.toLowerCase().includes("already exists");
}

export async function vaultFileExists(vault: Vault, filePath: string): Promise<boolean> {
	const normalizedPath = normalizePath(String(filePath || "").trim());
	if (!normalizedPath) {
		return false;
	}

	const indexed = vault.getAbstractFileByPath(normalizedPath);
	if (indexed instanceof TFile) {
		return true;
	}

	const adapter = vault.adapter as VaultAdapterLike;
	try {
		return await adapter.exists(normalizedPath);
	} catch {
		return false;
	}
}

export async function resolveUniqueVaultFilePath(
	vault: Vault,
	filePath: string,
	maxAttempts = 1000
): Promise<string> {
	const normalizedPath = normalizePath(String(filePath || "").trim());
	if (!normalizedPath) {
		throw new Error("Vault file path is empty");
	}

	const extMatch = normalizedPath.match(/(\.[^./\\]+)$/);
	const ext = extMatch ? extMatch[1] : "";
	const basePath = ext ? normalizedPath.slice(0, -ext.length) : normalizedPath;

	for (let counter = 0; counter <= maxAttempts; counter++) {
		const candidate = counter === 0 ? normalizedPath : `${basePath} ${counter}${ext}`;
		if (!(await vaultFileExists(vault, candidate))) {
			return candidate;
		}
	}

	throw new Error(`无法生成唯一文件路径: ${normalizedPath}`);
}

/**
 * 创建 vault 文本文件；若目标路径已存在则自动追加「 1」「 2」… 后缀。
 */
export async function createUniqueVaultTextFile(
	vault: Vault,
	filePath: string,
	content: string
): Promise<string> {
	const normalizedPath = normalizePath(String(filePath || "").trim());
	if (!normalizedPath) {
		throw new Error("Vault file path is empty");
	}

	const extMatch = normalizedPath.match(/(\.[^./\\]+)$/);
	const ext = extMatch ? extMatch[1] : "";
	const basePath = ext ? normalizedPath.slice(0, -ext.length) : normalizedPath;

	for (let counter = 0; counter <= 1000; counter++) {
		const candidate = counter === 0 ? normalizedPath : `${basePath} ${counter}${ext}`;
		if (await vaultFileExists(vault, candidate)) {
			continue;
		}

		try {
			await vault.create(candidate, content);
			return candidate;
		} catch (error) {
			if (!isVaultFileAlreadyExistsError(error)) {
				throw error;
			}
		}
	}

	throw new Error(`无法生成唯一文件路径: ${normalizedPath}`);
}

const VAULT_WRITE_RETRY_DELAYS_MS = [0, 40, 120];

function sleep(ms: number): Promise<void> {
	if (ms <= 0) {
		return Promise.resolve();
	}
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function recoverVaultTextFileWrite(
	vault: Vault,
	adapter: VaultAdapterLike,
	normalizedPath: string,
	content: string
): Promise<VaultWriteResult | null> {
	const recovered = vault.getAbstractFileByPath(normalizedPath);
	if (recovered instanceof TFile) {
		return modifyVaultFileIfChanged(vault, recovered, content);
	}

	if (await adapter.exists(normalizedPath)) {
		return adapterWriteIfChanged(adapter, normalizedPath, content);
	}

	try {
		const existing = await adapter.read(normalizedPath);
		if (textContentEquals(existing, content)) {
			return { written: false, skipped: true };
		}
		await adapter.write(normalizedPath, content);
		return { written: true, skipped: false };
	} catch {
		return null;
	}
}

/**
 * 写入 vault 文本文件：优先 modify，兼容「磁盘已存在但索引未登记」与 create 竞态。
 */
export async function ensureVaultTextFile(
	vault: Vault,
	filePath: string,
	content: string
): Promise<VaultWriteResult> {
	const normalizedPath = normalizePath(String(filePath || "").trim());
	if (!normalizedPath) {
		throw new Error("Vault file path is empty");
	}

	let lastError: unknown;
	for (let attempt = 0; attempt < VAULT_WRITE_RETRY_DELAYS_MS.length; attempt++) {
		await sleep(VAULT_WRITE_RETRY_DELAYS_MS[attempt] ?? 0);

		try {
			return await ensureVaultTextFileOnce(vault, normalizedPath, content);
		} catch (error) {
			lastError = error;
			if (!isVaultFileAlreadyExistsError(error)) {
				throw error;
			}
		}
	}

	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function ensureVaultTextFileOnce(
	vault: Vault,
	normalizedPath: string,
	content: string
): Promise<VaultWriteResult> {
	const existing = vault.getAbstractFileByPath(normalizedPath);
	if (existing instanceof TFile) {
		return modifyVaultFileIfChanged(vault, existing, content);
	}

	const adapter = vault.adapter as VaultAdapterLike;
	if (await adapter.exists(normalizedPath)) {
		return adapterWriteIfChanged(adapter, normalizedPath, content);
	}

	try {
		await vault.create(normalizedPath, content);
		return { written: true, skipped: false };
	} catch (error) {
		if (!isVaultFileAlreadyExistsError(error)) {
			throw error;
		}

		const recovered = await recoverVaultTextFileWrite(vault, adapter, normalizedPath, content);
		if (recovered) {
			return recovered;
		}

		throw error;
	}
}
