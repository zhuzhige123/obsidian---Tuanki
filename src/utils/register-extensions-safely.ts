import type { App, Plugin } from "obsidian";
import { isCallable, readUnknownProperty } from "./dynamic-access";
import { isRecord } from "./typed-json";
import { logger } from "./logger";

function getRegisteredViewTypeForExtension(app: App, extension: string): string | null {
	const normalizedExtension = extension.trim().toLowerCase();
	if (!normalizedExtension) {
		return null;
	}

	const viewRegistry = readUnknownProperty(app, "viewRegistry");
	const typeByExtension = readUnknownProperty(viewRegistry, "typeByExtension");
	if (!typeByExtension) {
		return null;
	}

	const getMethod = readUnknownProperty(typeByExtension, "get");
	if (isCallable(getMethod)) {
		const result = Reflect.apply(getMethod, typeByExtension, [normalizedExtension]);
		return typeof result === "string" ? result : null;
	}

	if (isRecord(typeByExtension)) {
		const bound = typeByExtension[normalizedExtension];
		return typeof bound === "string" ? bound : null;
	}

	return null;
}

export function registerExtensionsSafely(
	plugin: Plugin,
	app: App,
	extensions: string[],
	viewType: string,
	logPrefix: string,
	ownerName: string
): void {
	for (const extension of extensions) {
		const normalizedExtension = extension.trim().toLowerCase();
		if (!normalizedExtension) {
			continue;
		}

		const existingViewType = getRegisteredViewTypeForExtension(app, normalizedExtension);
		if (existingViewType === viewType) {
			logger.info(
				`${logPrefix} 扩展 .${normalizedExtension} 已绑定到 ${viewType}，跳过重复注册`
			);
			continue;
		}

		if (existingViewType && existingViewType !== viewType) {
			logger.warn(
				`${logPrefix} 扩展 .${normalizedExtension} 已绑定到 ${existingViewType}，${ownerName}将继续启动但不接管该扩展`
			);
			continue;
		}

		try {
			plugin.registerExtensions([normalizedExtension], viewType);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (/Attempting to register an existing file extension/i.test(message)) {
				const reboundViewType =
					getRegisteredViewTypeForExtension(app, normalizedExtension) ?? "unknown";
				logger.warn(
					`${logPrefix} 扩展 .${normalizedExtension} 注册时检测到宿主冲突（当前绑定: ${reboundViewType}），${ownerName}将继续启动`
				);
				continue;
			}

			throw error;
		}
	}
}
