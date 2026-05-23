import { Platform, type App } from "obsidian";
import { getOrCreateCrossPluginDeviceId } from "./weave-install-device-id";

/** 指纹算法版本；v4 起使用跨插件共享安装级 device id */
export const DEVICE_FINGERPRINT_VERSION = 4;

function getRuntimePlatformLabel(): string {
	if (Platform.isWin) return "win32";
	if (Platform.isMacOS) return "darwin";
	if (Platform.isLinux) return "linux";
	if (Platform.isAndroidApp) return "android";
	if (Platform.isIosApp) return "ios";
	if (Platform.isDesktop || Platform.isDesktopApp) return "desktop";
	if (Platform.isMobile || Platform.isMobileApp) return "mobile";
	return "unknown-platform";
}

/**
 * 仅收集跨库、跨插件稳定的特征。禁止 app.appId、vault 路径。
 */
export function collectStableDeviceComponents(_app: App): string[] {
	const components: string[] = [];

	const crossPluginId = getOrCreateCrossPluginDeviceId();
	if (crossPluginId) {
		components.push(`weave-install:${crossPluginId}`);
	}

	components.push(getRuntimePlatformLabel());
	components.push(Platform.isMobile ? "mobile-ui" : "desktop-ui");
	components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown");
	components.push(String(navigator.hardwareConcurrency || 0));
	components.push(String(navigator.maxTouchPoints || 0));

	try {
		const os = (window as unknown as { require?: (id: string) => unknown }).require?.("os") as
			| { platform?: () => string; arch?: () => string; hostname?: () => string }
			| undefined;
		if (os) {
			components.push(os.platform?.() || "unknown");
			components.push(os.arch?.() || "unknown");
			components.push(os.hostname?.() || "unknown");
		}
	} catch {
		components.push("no-os-info");
	}

	return components.filter((value) => value && value !== "undefined");
}

export async function sha256Hex(message: string): Promise<string> {
	const msgBuffer = new TextEncoder().encode(message);
	const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateStableDeviceFingerprint(app: App): Promise<string> {
	const fingerprint = collectStableDeviceComponents(app).join("|");
	return sha256Hex(fingerprint);
}
