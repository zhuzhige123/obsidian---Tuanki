import { extractErrorMessage } from "../../types/utility-types";
import { logger } from "../../utils/logger";

export type EpubErrorCode =
	| "file_not_found"
	| "load_timeout"
	| "invalid_archive"
	| "missing_container"
	| "missing_package_document"
	| "invalid_markup"
	| "invalid_cfi_target"
	| "render_failed"
	| "toc_load_failed"
	| "unknown";

export type EpubErrorOperation = "open" | "render" | "toc" | "navigate";

export class EpubError extends Error {
	readonly code: EpubErrorCode;
	readonly context?: Record<string, unknown>;

	constructor(code: EpubErrorCode, message: string, context?: Record<string, unknown>) {
		super(message);
		this.name = "EpubError";
		this.code = code;
		this.context = context;
	}
}

interface ClassifiedEpubError {
	code: EpubErrorCode;
	operation: EpubErrorOperation;
	userMessage: string;
	logMessage: string;
	context?: Record<string, unknown>;
}

function isEpubError(error: unknown): error is EpubError {
	return error instanceof EpubError;
}

export function classifyEpubError(
	error: unknown,
	operation: EpubErrorOperation = "open"
): ClassifiedEpubError {
	const message = extractErrorMessage(error);
	const code = resolveEpubErrorCode(error, message, operation);
	return {
		code,
		operation,
		userMessage: buildUserMessage(code, operation, message),
		logMessage: buildLogMessage(code, operation, message),
		context: isEpubError(error) ? error.context : undefined,
	};
}

export function reportEpubError(
	error: unknown,
	operation: EpubErrorOperation = "open"
): ClassifiedEpubError {
	const classified = classifyEpubError(error, operation);
	logger.error(classified.logMessage, {
		context: classified.context,
		error,
	});
	return classified;
}

function resolveEpubErrorCode(
	error: unknown,
	message: string,
	operation: EpubErrorOperation
): EpubErrorCode {
	if (isEpubError(error)) {
		return error.code;
	}

	const normalizedMessage = String(message || "").toLowerCase();
	if (normalizedMessage.includes("加载超时") || normalizedMessage.includes("timeout")) {
		return "load_timeout";
	}
	if (
		normalizedMessage.includes("corrupted zip") ||
		normalizedMessage.includes("end of data reached") ||
		normalizedMessage.includes("zip parse failed")
	) {
		return "invalid_archive";
	}
	if (normalizedMessage.includes("epub 文件不存在") || normalizedMessage.includes("file not found")) {
		return "file_not_found";
	}
	if (normalizedMessage.includes("meta-inf/container.xml")) {
		return "missing_container";
	}
	if (normalizedMessage.includes("package 文档路径") || normalizedMessage.includes("package document")) {
		return "missing_package_document";
	}
	if (normalizedMessage.includes("xml parse failed") || normalizedMessage.includes("parsererror")) {
		return "invalid_markup";
	}
	if (
		normalizedMessage.includes("invalid epub cfi target") ||
		normalizedMessage.includes("childnodes") ||
		normalizedMessage.includes("cfi")
	) {
		return operation === "render" ? "render_failed" : "invalid_cfi_target";
	}
	if (operation === "render") {
		return "render_failed";
	}
	if (operation === "toc") {
		return "toc_load_failed";
	}
	return "unknown";
}

function buildUserMessage(code: EpubErrorCode, operation: EpubErrorOperation, rawMessage: string): string {
	switch (code) {
		case "file_not_found":
			return "EPUB 文件不存在或已被移动，请确认源文件仍在库中";
		case "load_timeout":
			return "EPUB 加载超时，可能是该书结构复杂或内部资源异常，请稍后重试";
		case "invalid_archive":
			return "该 EPUB 压缩包已损坏，或当前读取到的文件数据不完整，暂时无法打开";
		case "missing_container":
			return "该 EPUB 缺少必要的容器索引，当前无法打开";
		case "missing_package_document":
			return "该 EPUB 缺少必要的 package 文档，当前无法打开";
		case "invalid_markup":
			return operation === "toc"
				? "该 EPUB 的目录或章节文档格式异常，当前无法读取目录"
				: "该 EPUB 的章节文档格式异常，当前无法正常打开";
		case "invalid_cfi_target":
			return operation === "navigate"
				? "该 EPUB 的内部定位信息异常，无法跳转到目标位置"
				: "该 EPUB 的内部导航结构异常，但已自动回退到可用阅读位置";
		case "render_failed":
			return "EPUB 阅读器渲染失败，请重试或切换阅读模式后再试";
		case "toc_load_failed":
			return "EPUB 目录加载失败，请稍后重试";
		default:
			return rawMessage && rawMessage !== "未知错误" ? `EPUB 处理失败：${rawMessage}` : "EPUB 处理失败";
	}
}

function buildLogMessage(code: EpubErrorCode, operation: EpubErrorOperation, message: string): string {
	return `[EPUB:${operation}:${code}] ${message}`;
}
