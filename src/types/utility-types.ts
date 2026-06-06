/**
 * 类型守卫和工具类型
 * 提供运行时类型检查和常用工具类型
 */

import type {
	AnkiConnectError,
	CardError,
	DeckError,
	EditorError,
	FSRSError,
	FileSystemError,
	StorageError,
	TemplateError,
	WeaveError,
} from "./error-types";
import { ErrorCode } from "./error-types";

/**
 * 类型守卫：检查是否为 Error 对象
 */
export function isError(value: unknown): value is Error {
	return value instanceof Error;
}

/**
 * 类型守卫：检查是否包含 message 属性的错误
 */
export function isErrorWithMessage(error: unknown): error is { message: string } {
	return (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof (error as Record<string, unknown>).message === "string"
	);
}

/**
 * 类型守卫：检查是否包含 stack 属性的错误
 */
export function isErrorWithStack(error: unknown): error is { stack: string; message: string } {
	return (
		isErrorWithMessage(error) &&
		"stack" in error &&
		typeof (error as Record<string, unknown>).stack === "string"
	);
}

/**
 * 类型守卫：检查是否为 WeaveError
 */
export function isWeaveError(error: unknown): error is WeaveError {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		"message" in error &&
		"severity" in error
	);
}

/**
 * 类型守卫：检查是否为文件系统错误
 */
export function isFileSystemError(error: unknown): error is FileSystemError {
	if (!isWeaveError(error)) return false;

	const code = (error).code;
	return (
		code === ErrorCode.FILE_NOT_FOUND ||
		code === ErrorCode.FILE_ALREADY_EXISTS ||
		code === ErrorCode.FILE_READ_ERROR ||
		code === ErrorCode.FILE_WRITE_ERROR ||
		code === ErrorCode.FILE_DELETE_ERROR ||
		code === ErrorCode.FOLDER_CREATE_ERROR ||
		code === ErrorCode.FOLDER_NOT_FOUND
	);
}

/**
 * 类型守卫：检查是否为存储错误
 */
export function isStorageError(error: unknown): error is StorageError {
	if (!isWeaveError(error)) return false;

	const code = (error).code;
	return (
		code === ErrorCode.STORAGE_INIT_ERROR ||
		code === ErrorCode.STORAGE_READ_ERROR ||
		code === ErrorCode.STORAGE_WRITE_ERROR ||
		code === ErrorCode.STORAGE_PARSE_ERROR ||
		code === ErrorCode.STORAGE_BACKUP_ERROR
	);
}

/**
 * 类型守卫：检查是否为卡片错误
 */
export function isCardError(error: unknown): error is CardError {
	if (!isWeaveError(error)) return false;

	const code = (error).code;
	return (
		code === ErrorCode.CARD_NOT_FOUND ||
		code === ErrorCode.CARD_CREATE_ERROR ||
		code === ErrorCode.CARD_UPDATE_ERROR ||
		code === ErrorCode.CARD_DELETE_ERROR ||
		code === ErrorCode.CARD_PARSE_ERROR
	);
}

/**
 * 类型守卫：检查是否为牌组错误
 */
export function isDeckError(error: unknown): error is DeckError {
	if (!isWeaveError(error)) return false;

	const code = (error).code;
	return (
		code === ErrorCode.DECK_NOT_FOUND ||
		code === ErrorCode.DECK_CREATE_ERROR ||
		code === ErrorCode.DECK_UPDATE_ERROR ||
		code === ErrorCode.DECK_DELETE_ERROR
	);
}

/**
 * 类型守卫：检查是否为 AnkiConnect 错误
 */
export function isAnkiConnectError(error: unknown): error is AnkiConnectError {
	if (!isWeaveError(error)) return false;

	const code = (error).code;
	return (
		code === ErrorCode.ANKICONNECT_CONNECTION_ERROR ||
		code === ErrorCode.ANKICONNECT_API_ERROR ||
		code === ErrorCode.ANKICONNECT_SYNC_ERROR
	);
}

/**
 * 类型守卫：检查是否为编辑器错误
 */
export function isEditorError(error: unknown): error is EditorError {
	if (!isWeaveError(error)) return false;

	const code = (error).code;
	return (
		code === ErrorCode.EDITOR_INIT_ERROR ||
		code === ErrorCode.EDITOR_OPEN_ERROR ||
		code === ErrorCode.EDITOR_SAVE_ERROR ||
		code === ErrorCode.EDITOR_CLOSE_ERROR
	);
}

/**
 * 类型守卫：检查是否为模板错误
 */
export function isTemplateError(error: unknown): error is TemplateError {
	if (!isWeaveError(error)) return false;

	const code = (error).code;
	return (
		code === ErrorCode.TEMPLATE_NOT_FOUND ||
		code === ErrorCode.TEMPLATE_PARSE_ERROR ||
		code === ErrorCode.TEMPLATE_RENDER_ERROR
	);
}

/**
 * 类型守卫：检查是否为 FSRS 错误
 */
export function isFSRSError(error: unknown): error is FSRSError {
	if (!isWeaveError(error)) return false;

	const code = (error).code;
	return code === ErrorCode.FSRS_CALCULATION_ERROR || code === ErrorCode.FSRS_PARAMETER_ERROR;
}

/**
 * 从未知错误中提取错误消息
 */
export function extractErrorMessage(error: unknown): string {
	if (typeof error === "string") {
		return error;
	}

	if (isErrorWithMessage(error)) {
		return error.message;
	}

	if (isWeaveError(error)) {
		return error.message;
	}

	return "未知错误";
}

/**
 * 从未知错误中提取错误堆栈
 */
export function extractErrorStack(error: unknown): string | undefined {
	if (isErrorWithStack(error)) {
		return error.stack;
	}

	if (isWeaveError(error) && error.stack) {
		return error.stack;
	}

	return undefined;
}

/**
 * 工具类型：使所有属性可选且可为 null
 */
export type Nullable<T> = {
	[P in keyof T]?: T[P] | null;
};

/**
 * 工具类型：深度只读
 */
export type DeepReadonly<T> = {
	readonly [P in keyof T]: T[P] extends Record<string, unknown> ? DeepReadonly<T[P]> : T[P];
};

/**
 * 工具类型：深度部分
 */
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends Record<string, unknown> ? DeepPartial<T[P]> : T[P];
};

/**
 * 工具类型：提取 Promise 的返回类型
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * 工具类型：提取数组的元素类型
 */
export type ArrayElement<T> = T extends (infer U)[] ? U : never;

/**
 * 工具类型：必需属性
 */
export type RequiredKeys<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * 工具类型：可选属性
 */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * 工具类型：提取函数参数类型
 */
export type FunctionParameters<T extends (...args: unknown[]) => unknown> = T extends (
	...args: infer P
) => unknown
	? P
	: never;

/**
 * 工具类型：提取函数返回类型
 */
export type FunctionReturn<T extends (...args: unknown[]) => unknown> = T extends (
	...args: unknown[]
) => infer R
	? R
	: never;

/**
 * 类型守卫：检查值是否为 null 或 undefined
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
	return value === null || value === undefined;
}

/**
 * 类型守卫：检查值是否不为 null 或 undefined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}

/**
 * 类型守卫：检查是否为字符串
 */
export function isString(value: unknown): value is string {
	return typeof value === "string";
}

/**
 * 类型守卫：检查是否为数字
 */
export function isNumber(value: unknown): value is number {
	return typeof value === "number" && !Number.isNaN(value);
}

/**
 * 类型守卫：检查是否为布尔值
 */
export function isBoolean(value: unknown): value is boolean {
	return typeof value === "boolean";
}

/**
 * 类型守卫：检查是否为对象
 */
export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 类型守卫：检查是否为数组
 */
export function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

/**
 * 类型守卫：检查是否为函数
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
	return typeof value === "function";
}

/**
 * 安全的 JSON 解析
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
	try {
		return JSON.parse(json) as T;
	} catch {
		return defaultValue;
	}
}

/**
 * 安全的 JSON 字符串化
 */
export function safeJsonStringify(value: unknown, indent?: number): string {
	try {
		return JSON.stringify(value, null, indent);
	} catch {
		return "";
	}
}

/**
 * 类型断言辅助函数
 */
export function assertDefined<T>(
	value: T | null | undefined,
	message?: string
): asserts value is T {
	if (isNullOrUndefined(value)) {
		throw new Error(message || "值不能为 null 或 undefined");
	}
}

/**
 * 类型断言：检查是否为字符串
 */
export function assertString(value: unknown, message?: string): asserts value is string {
	if (!isString(value)) {
		throw new Error(message || "值必须为字符串类型");
	}
}

/**
 * 类型断言：检查是否为数字
 */
export function assertNumber(value: unknown, message?: string): asserts value is number {
	if (!isNumber(value)) {
		throw new Error(message || "值必须为数字类型");
	}
}

/**
 * 类型断言：检查是否为对象
 */
export function assertObject(
	value: unknown,
	message?: string
): asserts value is Record<string, unknown> {
	if (!isObject(value)) {
		throw new Error(message || "值必须为对象类型");
	}
}
