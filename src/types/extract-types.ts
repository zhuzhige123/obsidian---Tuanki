/**
 * 摘录卡片类型定义
 *
 * @module types/extract-types
 * @version 1.1.0
 */

// ===== 摘录类型枚举 =====

/**
 * 内置摘录类型
 */
export type BuiltinExtractType = "note" | "important" | "todo" | "idea" | "capsule";

/**
 * 摘录类型（内置 + 自定义）
 */
export type ExtractType = BuiltinExtractType | (string & {});

// ===== 自定义笔记类型配置 =====

/**
 * 单个笔记类型定义
 */
export interface NoteTypeDefinition {
	/** 类型ID（唯一标识） */
	id: string;
	/** 类型名称（显示名） */
	name: string;
	/** 类型颜色 */
	color: string;
	/** 是否为内置类型 */
	isBuiltin: boolean;
}

/**
 * 笔记类型组定义
 */
export interface NoteTypeGroup {
	/** 组ID */
	id: string;
	/** 组名称 */
	name: string;
	/** 组内类型ID列表 */
	typeIds: string[];
	/** 是否选中（选中的组显示在摘录界面） */
	selected: boolean;
	/** 是否为默认组（不可删除） */
	isDefault: boolean;
}

/**
 * 笔记类型配置（存储在设置中）
 */
export interface NoteTypeConfig {
	/** 所有笔记类型 */
	types: NoteTypeDefinition[];
	/** 笔记类型组 */
	groups: NoteTypeGroup[];
}

// ===== 摘录卡片接口 =====

/**
 * 摘录卡片
 */
export interface ExtractCard {
	/** 唯一标识符 */
	id: string;
	/** 摘录类型 */
	type: ExtractType;
	/** 摘录内容 */
	content: string;
	/** 来源文件路径 */
	sourceFile: string;
	/** 来源块ID */
	sourceBlock?: string;
	/** 来源锚点 */
	sourceAnchor?: string;
	/** 创建时间 */
	createdAt: Date;
	/** 更新时间 */
	updatedAt: Date;
	/** 是否已完成 */
	completed: boolean;
	/** 是否置顶 */
	pinned: boolean;
	/** 标签 */
	tags: string[];
	/** 关联牌组ID */
	deckId: string;
}

// ===== 类型颜色映射 =====

/**
 * 类型颜色配置
 */
export interface TypeColorConfig {
	light: string;
	dark: string;
	bg: string;
	bgDark: string;
}

/**
 * 类型颜色映射
 */
export const TYPE_COLORS: Record<BuiltinExtractType, TypeColorConfig> = {
	note: {
		light: "#4299e1",
		dark: "#63b3ed",
		bg: "rgba(66, 153, 225, 0.15)",
		bgDark: "rgba(99, 179, 237, 0.2)",
	},
	important: {
		light: "#f56565",
		dark: "#fc8181",
		bg: "rgba(245, 101, 101, 0.15)",
		bgDark: "rgba(252, 129, 129, 0.2)",
	},
	todo: {
		light: "#ecc94b",
		dark: "#f6e05e",
		bg: "rgba(236, 201, 75, 0.15)",
		bgDark: "rgba(246, 224, 94, 0.2)",
	},
	idea: {
		light: "#9f7aea",
		dark: "#b794f4",
		bg: "rgba(159, 122, 234, 0.15)",
		bgDark: "rgba(183, 148, 244, 0.2)",
	},
	capsule: {
		light: "#48bb78",
		dark: "#68d391",
		bg: "rgba(72, 187, 120, 0.15)",
		bgDark: "rgba(104, 211, 145, 0.2)",
	},
};

// ===== 类型配置 =====

/**
 * 类型筛选配置
 */
export interface ExtractTypeConfig {
	key: BuiltinExtractType | "all";
	label: string;
	icon: string; // Obsidian 图标名称（lucide 图标库）
	color: string;
	bgColor: string;
}

/**
 * 类型筛选选项
 * icon 使用 Obsidian/Lucide 图标名称
 */
export const EXTRACT_TYPE_OPTIONS: ExtractTypeConfig[] = [
	{
		key: "all",
		label: "全部",
		icon: "list",
		color: "var(--text-muted)",
		bgColor: "var(--background-secondary)",
	},
	{
		key: "note",
		label: "记事",
		icon: "file-text",
		color: TYPE_COLORS.note.light,
		bgColor: TYPE_COLORS.note.bg,
	},
	{
		key: "important",
		label: "重要",
		icon: "alert-triangle",
		color: TYPE_COLORS.important.light,
		bgColor: TYPE_COLORS.important.bg,
	},
	{
		key: "todo",
		label: "待办",
		icon: "check-square",
		color: TYPE_COLORS.todo.light,
		bgColor: TYPE_COLORS.todo.bg,
	},
	{
		key: "idea",
		label: "灵感",
		icon: "lightbulb",
		color: TYPE_COLORS.idea.light,
		bgColor: TYPE_COLORS.idea.bg,
	},
	{
		key: "capsule",
		label: "时间胶囊",
		icon: "clock",
		color: TYPE_COLORS.capsule.light,
		bgColor: TYPE_COLORS.capsule.bg,
	},
];

// ===== 工具函数 =====

function getBuiltinTypeColors(type: ExtractType): TypeColorConfig | undefined {
	switch (type) {
		case "note":
			return TYPE_COLORS.note;
		case "important":
			return TYPE_COLORS.important;
		case "todo":
			return TYPE_COLORS.todo;
		case "idea":
			return TYPE_COLORS.idea;
		case "capsule":
			return TYPE_COLORS.capsule;
		default:
			return undefined;
	}
}

/**
 * 获取类型颜色
 */
export function getTypeColor(type: ExtractType, isDark = false): string {
	const colors = getBuiltinTypeColors(type);
	if (!colors) {
		return isDark ? "var(--text-muted)" : "var(--text-normal)";
	}
	return isDark ? colors.dark : colors.light;
}

/**
 * 获取类型背景色
 */
export function getTypeBgColor(type: ExtractType, isDark = false): string {
	const colors = getBuiltinTypeColors(type);
	if (!colors) {
		return "var(--background-secondary)";
	}
	return isDark ? colors.bgDark : colors.bg;
}

/**
 * 获取类型标签
 */
export function getTypeLabel(type: ExtractType): string {
	const config = EXTRACT_TYPE_OPTIONS.find((opt) => opt.key === type);
	return config?.label ?? type;
}

// ===== 默认笔记类型配置 =====

/**
 * 内置笔记类型
 */
export const BUILTIN_NOTE_TYPES: NoteTypeDefinition[] = [
	{ id: "note", name: "记事", color: "#4299e1", isBuiltin: true },
	{ id: "important", name: "重要", color: "#f56565", isBuiltin: true },
	{ id: "todo", name: "待办", color: "#ecc94b", isBuiltin: true },
	{ id: "idea", name: "灵感", color: "#9f7aea", isBuiltin: true },
	{ id: "capsule", name: "时间胶囊", color: "#48bb78", isBuiltin: true },
];

/**
 * 默认笔记类型配置
 */
export const DEFAULT_NOTE_TYPE_CONFIG: NoteTypeConfig = {
	types: [...BUILTIN_NOTE_TYPES],
	groups: [
		{
			id: "default",
			name: "默认组",
			typeIds: ["note", "todo", "idea", "important", "capsule"],
			selected: true,
			isDefault: true,
		},
	],
};

/**
 * 获取选中组的类型列表
 */
export function getSelectedGroupTypes(config: NoteTypeConfig): NoteTypeDefinition[] {
	const selectedGroup = config.groups.find((g) => g.selected);
	if (!selectedGroup) return [];

	return selectedGroup.typeIds
		.map((id) => config.types.find((t) => t.id === id))
		.filter((t): t is NoteTypeDefinition => t !== undefined);
}

/**
 * 根据类型ID获取类型定义
 */
export function getNoteTypeById(
	config: NoteTypeConfig,
	typeId: string
): NoteTypeDefinition | undefined {
	return config.types.find((t) => t.id === typeId);
}

/**
 * 生成类型ID（基于名称）
 */
export function generateTypeId(name: string): string {
	return `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now().toString(36)}`;
}
