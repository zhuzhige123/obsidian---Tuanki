import { FileSystemAdapter, type App } from "obsidian";

/**
 * 为当前 Obsidian 库生成稳定标识（同一路径 = 同一 vault_id）。
 * 用于云端「每设备最多 N 个库」槽位，不随仓库内文件变化。
 */
export async function getLicenseVaultId(app: App): Promise<string> {
	const adapter = app.vault.adapter;
	const name = String(app.vault.getName?.() || "").trim();
	const basePath =
		adapter instanceof FileSystemAdapter ? String(adapter.getBasePath() || "").trim() : "";
	const raw = basePath || name || "obsidian-vault";
	const digest = await sha256Hex(raw.toLowerCase());
	return digest.slice(0, 32);
}

async function sha256Hex(message: string): Promise<string> {
	const msgBuffer = new TextEncoder().encode(message);
	const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
