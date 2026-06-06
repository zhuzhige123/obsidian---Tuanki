/**
 * 跨插件（Weave 主插件 + EPUB 阅读器等）共用的安装级设备标识。
 * 写入当前库的 vault.configDir，通过 Obsidian DataAdapter 访问（不使用 Node fs）。
 */

import type { App } from "obsidian";
import { normalizePath } from "obsidian";

const DEVICE_ID_FILE_NAME = "weave-install-device-id";

let cachedDeviceId: string | null = null;
let deviceIdLoadPromise: Promise<string> | null = null;

function getDeviceIdVaultPath(app: App): string {
	return normalizePath(`${app.vault.configDir}/${DEVICE_ID_FILE_NAME}`);
}

async function loadOrCreateCrossPluginDeviceId(app: App): Promise<string> {
	const adapter = app.vault.adapter;
	const filePath = getDeviceIdVaultPath(app);

	try {
		if (await adapter.exists(filePath)) {
			const existing = String(await adapter.read(filePath)).trim();
			if (existing.length >= 16) {
				return existing;
			}
		}
	} catch {
		// 文件不存在或不可读，下面创建
	}

	const id = crypto.randomUUID();
	try {
		await adapter.write(filePath, id);
		return id;
	} catch {
		return "";
	}
}

/**
 * 读取或创建跨插件共享的设备 ID（明文 UUID，仅用于本库 configDir 内）。
 */
export async function getOrCreateCrossPluginDeviceId(app: App): Promise<string> {
	if (cachedDeviceId) {
		return cachedDeviceId;
	}

	if (!deviceIdLoadPromise) {
		deviceIdLoadPromise = loadOrCreateCrossPluginDeviceId(app).then((id) => {
			if (id) {
				cachedDeviceId = id;
			}
			return id;
		});
	}

	return deviceIdLoadPromise;
}

/** @internal test-only */
export function resetCrossPluginDeviceIdCacheForTests(): void {
	cachedDeviceId = null;
	deviceIdLoadPromise = null;
}
