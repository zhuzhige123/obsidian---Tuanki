/**
 * 跨插件（Weave 主插件 + EPUB 阅读器等）共用的安装级设备标识。
 * 写入 Obsidian userData 目录，避免各插件指纹采集细节不一致导致云端多占设备位。
 */

const DEVICE_ID_FILE_NAME = "weave-install-device-id";

function getObsidianUserDataPath(): string {
	try {
		const req = (window as unknown as { require?: (id: string) => unknown }).require;
		const electron = req?.("electron") as
			| { app?: { getPath?: (name: string) => string } }
			| undefined;
		const userData = electron?.app?.getPath?.("userData");
		return userData ? String(userData) : "";
	} catch {
		return "";
	}
}

/**
 * 读取或创建跨插件共享的设备 ID（明文 UUID，仅用于本机 Obsidian 安装目录内）。
 */
export function getOrCreateCrossPluginDeviceId(): string {
	const userData = getObsidianUserDataPath();
	if (!userData) {
		return "";
	}

	try {
		const fs = (window as unknown as { require?: (id: string) => typeof import("fs") }).require?.(
			"fs"
		);
		const path = (window as unknown as { require?: (id: string) => typeof import("path") }).require?.(
			"path"
		);
		if (!fs || !path) {
			return "";
		}

		const filePath = path.join(userData, DEVICE_ID_FILE_NAME);
		try {
			const existing = String(fs.readFileSync(filePath, "utf8") || "").trim();
			if (existing.length >= 16) {
				return existing;
			}
		} catch {
			// 文件不存在，创建
		}

		const id = crypto.randomUUID();
		fs.writeFileSync(filePath, id, { encoding: "utf8" });
		return id;
	} catch {
		return "";
	}
}
