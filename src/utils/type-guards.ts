/**
 * 类型守卫工具函数
 * 提供类型安全的检查和过滤功能
 */

/**
 * 过滤字段 - 基础实现
 * @param fields 字段数组
 * @returns 过滤后的字段
 */
export function filterFields(fields: unknown[]): unknown[] {
	if (!Array.isArray(fields)) {
		return [];
	}

	// 基础过滤逻辑：移除空值和undefined
	return fields.filter((_field) => _field != null);
}

/**
 * 检查是否为有效的字段对象
 * @param field 待检查的字段
 * @returns 是否为有效字段
 */
export function isValidField(field: unknown): field is Record<string, unknown> {
	return typeof field === "object" && field !== null;
}

/**
 * 检查是否为字符串
 * @param value 待检查的值
 * @returns 是否为字符串
 */
export function isString(value: unknown): value is string {
	return typeof value === "string";
}

/**
 * 检查是否为数组
 * @param value 待检查的值
 * @returns 是否为数组
 */
export function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}
