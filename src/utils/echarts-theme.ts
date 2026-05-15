import { logger } from "../utils/logger";
/**
 * ECharts主题配置工具
 * 提供统一的主题颜色获取和图表基础配置
 */

export interface ThemeColors {
	text: string;
	textMuted: string;
	accent: string;
	background: string;
	backgroundSecondary: string;
	border: string;
	success: string;
	warning: string;
	error: string;
	textColor: string;
	subTextColor: string;
	axisLineColor: string;
	splitLineColor: string;
	tooltipBg: string;
	tooltipBorder: string;
	bgColor: string;
	borderColor: string;
	accentColor: string;
	seriesPalette: string[];
	loadStatusColors: {
		low: string;
		normal: string;
		high: string;
		overload: string;
	};
	heatmapLevels: string[];
	heatmapEmpty: string;
}

const FALLBACK_ACCENT = "#7c3aed";
const FALLBACK_SERIES_PALETTE = [
	"#3b82f6",
	"#10b981",
	"#f59e0b",
	"#ef4444",
	"#8b5cf6",
	"#14b8a6",
];
const DEFAULT_GRADIENT_COLOR = { r: 124, g: 58, b: 237 };
const parsedColorCache = new Map<string, { r: number; g: number; b: number }>();

function resolveCssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
	return style.getPropertyValue(name).trim() || fallback;
}

function detectDarkTheme(): boolean {
	return document.body.classList.contains("theme-dark");
}

/**
 * 获取Obsidian主题颜色
 */
export function getThemeColors(): ThemeColors {
	const style = getComputedStyle(document.body);
	const isDark = detectDarkTheme();
	const text = resolveCssVar(style, "--text-normal", isDark ? "#e5e7eb" : "#1f2937");
	const textMuted = resolveCssVar(style, "--text-muted", isDark ? "#9ca3af" : "#6b7280");
	const accent = resolveCssVar(style, "--interactive-accent", FALLBACK_ACCENT);
	const background = resolveCssVar(
		style,
		"--background-primary",
		isDark ? "#111827" : "#ffffff"
	);
	const backgroundSecondary = resolveCssVar(
		style,
		"--background-secondary",
		isDark ? "#1f2937" : "#f8fafc"
	);
	const border = resolveCssVar(
		style,
		"--background-modifier-border",
		isDark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.12)"
	);
	const success = resolveCssVar(style, "--text-success", "#22c55e");
	const warning = resolveCssVar(style, "--text-warning", "#f59e0b");
	const error = resolveCssVar(style, "--text-error", "#ef4444");
	const axisLineColor = resolveCssVar(
		style,
		"--background-modifier-border",
		isDark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.12)"
	);
	const splitLineColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";

	return {
		text,
		textMuted,
		accent,
		background,
		backgroundSecondary,
		border,
		success,
		warning,
		error,
		textColor: text,
		subTextColor: textMuted,
		axisLineColor,
		splitLineColor,
		tooltipBg: background,
		tooltipBorder: border,
		bgColor: background,
		borderColor: border,
		accentColor: accent,
		seriesPalette: [...FALLBACK_SERIES_PALETTE],
		loadStatusColors: {
			low: success,
			normal: "#4dabf7",
			high: warning,
			overload: error,
		},
		heatmapLevels: isDark
			? ["#0e4429", "#006d32", "#26a641", "#39d353"]
			: ["#9be9a8", "#40c463", "#30a14e", "#216e39"],
		heatmapEmpty: border,
	};
}

/**
 * 生成ECharts通用配置
 */
export function getBaseChartOption(colors: ThemeColors): any {
	return {
		backgroundColor: "transparent",
		textStyle: {
			color: colors.text,
			fontFamily: "var(--font-text)",
		},
		tooltip: {
			backgroundColor: colors.background,
			borderColor: colors.border,
			borderWidth: 1,
			textStyle: {
				color: colors.text,
			},
			padding: [8, 12],
			extraCssText: "box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 6px;",
		},
		grid: {
			left: "3%",
			right: "4%",
			bottom: "3%",
			top: "10%",
			containLabel: true,
		},
		xAxis: {
			axisLine: {
				lineStyle: {
					color: colors.border,
				},
			},
			axisLabel: {
				color: colors.textMuted,
				fontSize: 12,
			},
			splitLine: {
				show: false,
			},
		},
		yAxis: {
			axisLine: {
				lineStyle: {
					color: colors.border,
				},
			},
			axisLabel: {
				color: colors.textMuted,
				fontSize: 12,
			},
			splitLine: {
				lineStyle: {
					color: colors.border,
					type: "dashed",
					opacity: 0.3,
				},
			},
		},
	};
}

/**
 * 生成渐变色配置（支持多种颜色格式）
 */
export function createGradient(color: string, opacity1 = 0.25, opacity2 = 0.05): any {
	const safeOpacity1 = Math.max(0, Math.min(1, opacity1));
	const safeOpacity2 = Math.max(0, Math.min(1, opacity2));

	return {
		type: "linear",
		x: 0,
		y: 0,
		x2: 0,
		y2: 1,
		colorStops: [
			{
				offset: 0,
				color: applyAlphaToColor(color, safeOpacity1),
			},
			{
				offset: 1,
				color: applyAlphaToColor(color, safeOpacity2),
			},
		],
	};
}

function parseHexColor(colorStr: string): { r: number; g: number; b: number } | null {
	const normalized = colorStr.trim().replace(/^#/, "");
	if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(normalized)) {
		return null;
	}

	const hex =
		normalized.length === 3
			? normalized
					.split("")
					.map((part) => `${part}${part}`)
					.join("")
			: normalized;

	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	if ([r, g, b].some((value) => Number.isNaN(value))) {
		return null;
	}

	return { r, g, b };
}

function parseRgbColor(colorStr: string): { r: number; g: number; b: number } | null {
	const normalized = colorStr.trim();
	if (!/^rgba?\(/i.test(normalized)) {
		return null;
	}

	const channelValues = normalized.match(/[\d.]+/g);
	if (!channelValues || channelValues.length < 3) {
		return null;
	}

	const [r, g, b] = channelValues.slice(0, 3).map((value) => Math.round(Number(value)));
	if ([r, g, b].some((value) => Number.isNaN(value))) {
		return null;
	}

	return { r, g, b };
}

function resolveColorWithDom(colorStr: string): { r: number; g: number; b: number } | null {
	if (typeof document === "undefined" || !document.body) {
		return null;
	}

	const probe = document.createElement("span");
	const sentinelColor = "rgb(1, 2, 3)";
	probe.hidden = true;
	probe.setAttribute("style", `color: ${sentinelColor}; color: ${colorStr};`);
	document.body.appendChild(probe);

	try {
		const resolvedColor = getComputedStyle(probe).color.trim();
		if (!resolvedColor || resolvedColor === sentinelColor) {
			return null;
		}
		return parseRgbColor(resolvedColor);
	} finally {
		probe.remove();
	}
}

function resolveGradientColor(colorStr: string): { r: number; g: number; b: number } {
	const normalized = String(colorStr || "").trim();
	if (!normalized) {
		return DEFAULT_GRADIENT_COLOR;
	}

	const cached = parsedColorCache.get(normalized);
	if (cached) {
		return cached;
	}

	try {
		const parsed =
			parseHexColor(normalized) ||
			parseRgbColor(normalized) ||
			resolveColorWithDom(normalized) ||
			DEFAULT_GRADIENT_COLOR;

		parsedColorCache.set(normalized, parsed);
		if (parsed === DEFAULT_GRADIENT_COLOR) {
			logger.warn(`[createGradient] 无法解析颜色: ${colorStr}, 使用默认颜色`);
		}
		return parsed;
	} catch (error) {
		logger.error(`[createGradient] 颜色解析错误: ${colorStr}`, error);
		return DEFAULT_GRADIENT_COLOR;
	}
}

export function applyAlphaToColor(color: string, opacity = 1): string {
	const safeOpacity = Math.max(0, Math.min(1, opacity));
	const { r, g, b } = resolveGradientColor(color);
	return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
}

/**
 * 数据验证和清理
 */
export function validateChartData<T extends Record<string, any>>(
	data: T[],
	requiredFields: string[]
): T[] {
	// 数据验证开始

	if (!Array.isArray(data)) {
		return [];
	}

	const result = data.filter((_item) => {
		if (!_item || typeof _item !== "object") {
			return false;
		}

		for (const field of requiredFields) {
			if (!(field in _item)) {
				return false;
			}

			// 数值验证
			if (typeof _item[field] === "number") {
				if (Number.isNaN(_item[field]) || !Number.isFinite(_item[field])) {
					return false;
				}
			}
		}

		return true;
	});

	// 数据验证完成

	return result;
}

/**
 * 格式化数值显示
 */
export function formatValue(
	value: number,
	type: "number" | "percentage" | "time" = "number"
): string {
	if (typeof value !== "number" || Number.isNaN(value)) return "0";

	switch (type) {
		case "percentage":
			return `${Math.round(value)}%`;
		case "time": {
			if (value < 60) return `${Math.round(value)}分钟`;
			const hours = Math.floor(value / 60);
			const minutes = Math.round(value % 60);
			return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
		}
		default:
			if (value >= 1000000) {
				return `${(value / 1000000).toFixed(1)}M`;
			} else if (value >= 1000) {
				return `${(value / 1000).toFixed(1)}K`;
			}
			return value.toString();
	}
}
