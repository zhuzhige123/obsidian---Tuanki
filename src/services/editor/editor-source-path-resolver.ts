import { normalizePath } from "obsidian";
import type { IRActiveBlockContext } from "../../stores/ir-active-block-context-store";
import { logger } from "../../utils/logger";
import { isEditorBridgeTempFilePath } from "./editor-temp-file-policy";

export interface ResolveEditorSourcePathOptions {
	sourcePath?: string | null;
	preferBlockContext?: boolean;
	resolveMissingSourcePath?: boolean;
	logScope?: string;
}

export interface EditorSourcePathResolution {
	sourcePath?: string;
	blockContext: IRActiveBlockContext | null;
	resolvedFrom: "original" | "block-context" | "active-document" | "unresolved";
}

export interface CardTraceMetadataInput {
	sourceFile?: string | null;
	sourceBlock?: string | null;
}

export interface SanitizedCardTraceMetadata {
	sourceFile?: string;
	sourceBlock?: string;
}

function normalizeSourcePath(path?: string | null): string | undefined {
	if (typeof path !== "string") {
		return undefined;
	}

	const trimmedPath = path.trim();
	if (!trimmedPath) {
		return undefined;
	}

	return normalizePath(trimmedPath);
}

function stripNonTraceableSourcePath(sourcePath?: string): string | undefined {
	if (!sourcePath || isEditorBridgeTempFilePath(sourcePath)) {
		return undefined;
	}

	return sourcePath;
}

function logSourceResolutionWarning(
	logScope: string | undefined,
	message: string,
	error: unknown
): void {
	if (!logScope) {
		return;
	}

	logger.warn(`${logScope} ${message}:`, error);
}

export function sanitizeCardTraceMetadata(
	metadata?: CardTraceMetadataInput | null
): SanitizedCardTraceMetadata {
	const sourceFile = stripNonTraceableSourcePath(normalizeSourcePath(metadata?.sourceFile));
	if (!sourceFile) {
		return {};
	}

	const sourceBlock = String(metadata?.sourceBlock || "").trim();
	return {
		sourceFile,
		sourceBlock: sourceBlock || undefined,
	};
}

export function buildWeSourceLinkFromPath(
	sourceFile?: string | null,
	sourceBlock?: string | null
): string | undefined {
	const traceablePath = stripNonTraceableSourcePath(normalizeSourcePath(sourceFile));
	if (!traceablePath) {
		return undefined;
	}

	const docName = traceablePath.replace(/\.md$/i, "");
	const blockId = String(sourceBlock || "").replace(/^\^/, "").trim();
	if (blockId) {
		return `![[${docName}#^${blockId}]]`;
	}

	return `[[${docName}]]`;
}

export async function resolveEditorSourcePathFromIR(
	options: ResolveEditorSourcePathOptions = {}
): Promise<EditorSourcePathResolution> {
	const resolveMissingSourcePath = options.resolveMissingSourcePath ?? true;
	let sourcePath = normalizeSourcePath(options.sourcePath);
	let blockContext: IRActiveBlockContext | null = null;
	let resolvedFrom: EditorSourcePathResolution["resolvedFrom"] = sourcePath
		? "original"
		: "unresolved";

	const shouldCheckBlockContext =
		options.preferBlockContext ||
		isEditorBridgeTempFilePath(sourcePath) ||
		(!sourcePath && resolveMissingSourcePath);

	if (shouldCheckBlockContext) {
		try {
			const { irActiveBlockContextStore } = await import(
				"../../stores/ir-active-block-context-store"
			);
			blockContext = irActiveBlockContextStore.getActiveContext();

			const blockSourcePath = stripNonTraceableSourcePath(
				normalizeSourcePath(blockContext?.sourcePath)
			);
			if (blockSourcePath) {
				sourcePath = blockSourcePath;
				resolvedFrom = "block-context";
			}
		} catch (error) {
			logSourceResolutionWarning(options.logScope, "无法读取 IR 块上下文信息", error);
		}
	}

	const shouldCheckActiveDocument =
		isEditorBridgeTempFilePath(sourcePath) || (!sourcePath && resolveMissingSourcePath);

	if (shouldCheckActiveDocument) {
		try {
			const { irActiveDocumentStore } = await import("../../stores/ir-active-document-store");
			const activeDocumentPath = stripNonTraceableSourcePath(
				normalizeSourcePath(irActiveDocumentStore.getActiveDocument())
			);
			if (activeDocumentPath) {
				sourcePath = activeDocumentPath;
				resolvedFrom = "active-document";
			}
		} catch (error) {
			logSourceResolutionWarning(options.logScope, "无法读取 IR 活动文档信息", error);
		}
	}

	sourcePath = stripNonTraceableSourcePath(sourcePath);
	if (!sourcePath) {
		resolvedFrom = "unresolved";
	}

	return {
		sourcePath,
		blockContext,
		resolvedFrom,
	};
}
