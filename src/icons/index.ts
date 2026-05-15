// Anki Plugin Icons - 兼容层
// 保留历史常量与别名，底层统一解析为 Obsidian 原生图标名称

import {
	isKnownIconAlias,
	isKnownObsidianIconName,
	resolveObsidianIconName,
} from "./obsidian-icon-resolver";

// FontAwesome 图标名称映射 - 必须在getIcon函数之前定义！
const ICON_MAPPING: Record<string, string> = {
	// === 主要功能 ===（优化后的图标映射）
	deckStudy: "graduation-cap", // 学习 - 使用毕业帽更直观
	weaveCardManagement: "id-card", // 卡片管理 - 使用身份卡图标
	cardManagement: "id-card", // 卡片管理 - 使用身份卡图标
	aiAssistant: "robot", // AI助手 - 使用机器人图标表示AI功能

	// === 基础操作 ===
	plus: "plus",
	trash: "trash",
	delete: "trash",
	edit: "edit",
	settings: "settings",
	cog: "settings",
	close: "times",
	times: "times",
	check: "check",
	copy: "copy",
	refresh: "refresh",
	sync: "refresh",

	// === 导航 ===
	"chevron-down": "chevron-down",
	"chevron-up": "chevron-up",
	"chevron-left": "chevron-left",
	"chevron-right": "chevron-right",
	"arrow-left": "chevron-left",
	"arrow-right": "chevron-right",

	// === 交互 ===（优化后的图标映射）
	eye: "eye",
	"eye-off": "eye-off", // 隐藏眼睛图标
	search: "search",
	filter: "filter", // 过滤 - 使用专门的过滤图标
	"info-circle": "info",
	info: "info",
	"question-circle": "question-circle", // 帮助 - 使用问号圆圈图标
	help: "question-circle",
	bell: "bell", // 通知 - 使用铃铛图标
	star: "star",
	bookmark: "bookmark", // 书签图标
	thumbtack: "thumbtack", // 图钉图标
	pin: "thumbtack", // 固定图钉（别名）
	sliders: "sliders", // 滑块设置图标
	lightbulb: "lightbulb", // 灯泡 - 保持原有映射

	// === 媒体 ===（修正后的图标映射）
	play: "play", // 播放 - 使用标准播放图标
	"volume-up": "volume-up", // 音量增大 - 使用正确的音量图标
	"volume-down": "volume-down", // 音量减小 - 新增
	"volume-mute": "volume-mute", // 静音 - 使用正确的静音图标
	pause: "pause", // 暂停 - 新增
	stop: "stop", // 停止 - 新增

	// === 文件 ===（优化后的图标映射）
	file: "file",
	"file-text": "file-text", // 文本文件图标 - 用于文档链接
	upload: "upload", // 上传 - 使用专门的上传图标
	download: "download",
	database: "database", // 数据库 - 保持原有映射

	// === 开发 ===
	code: "code",
	microchip: "microchip", // 微芯片 - 使用正确的微芯片图标

	// === 分析 ===（优化后的图标映射）
	"chart-bar": "chart-bar",
	"chart-line": "chart-line", // 折线图 - 使用正确的折线图图标
	bullseye: "bullseye", // 靶心 - 使用正确的靶心图标

	// === 联系方式 ===
	envelope: "envelope",
	mail: "envelope",

	// === 时间 ===
	clock: "clock",
	history: "history",
	"calendar-alt": "calendar",
	calendar: "calendar",

	// === 状态 ===
	alert: "warning",
	warning: "warning",
	"check-circle": "check-circle", // 检查圆圈 - 使用正确的图标

	// === 学习 ===（优化后的图标映射）
	brain: "brain",
	"graduation-cap": "graduation-cap", // 毕业帽 - 使用正确的毕业帽图标

	// === 编辑器 ===（优化后的图标映射）
	bold: "bold",
	italic: "italic",
	underline: "underline",
	heading: "heading",
	"list-ul": "list-ul", // 无序列表 - 使用正确的列表图标
	"list-ol": "list-ol", // 有序列表 - 新增
	link: "link",
	image: "image",
	markdown: "markdown", // Markdown - 使用专门的Markdown图标
	"list-alt": "list",
	"clipboard-list": "clipboard-list", // 剪贴板列表 - 使用正确的图标
	"layer-group": "layer-group", // 图层组 - 使用正确的图标

	// === 其他 ===（优化后的图标映射）
	tag: "tag",
	hash: "hash",
	bolt: "bolt", // 闪电 - 使用正确的闪电图标
	magic: "magic", // 魔法 - 使用正确的魔法图标
	layers: "layers",
	columns: "columns",
	book: "book-open", // 书 - 映射到打开的书图标
	"book-open": "book-open", // 打开的书 - 使用正确的图标

	// === 新增的图标映射 ===
	robot: "robot", // 机器人 - AI相关
	"id-card": "id-card", // 身份卡 - 卡片管理
	"id-card-alt": "id-card-alt", // 身份卡替代 - 卡片管理变体

	// === 修复直接使用的图标 ===
	"trash-2": "trash",
	x: "times",
	"alert-circle": "info",
	"alert-triangle": "exclamation-triangle",
	"tag-x": "times",
	"tag-plus": "plus",
	chevronDown: "chevron-down",
	checkCircle: "check",
	xCircle: "times-circle",
	loader: "spinner",
	"th-list": "list",
	"th-large": "th-large",
	"more-horizontal": "ellipsis-h", // 横向省略号 - 更多操作菜单
	"layout-template": "th-large", // 瀑布流布局图标
	"arrow-up": "chevron-up",
	"arrow-down": "chevron-down",
	"trending-up": "chart-bar",
	starFilled: "star",
	trendingUp: "chart-bar",
	award: "star",
	package: "file",
	"upload-cloud": "chevron-up",
	"file-plus": "plus",
	"git-merge": "chevron-right",
	activity: "chart-bar",
	shield: "star",
	"credit-card": "file",
	tool: "settings",
	target: "star",
	"bar-chart": "chart-bar",
	cpu: "settings",
	sparkles: "star",
	"file-x": "times",
	"sidebar-open": "bars",
	"sidebar-close": "chevron-right",

	// === 面板切换图标 ===
	"panel-left-open": "bars",
	"panel-left-close": "chevron-left",
	"panel-left": "panel-left", // 左侧面板图标
	"panel-right": "panel-right", // 右侧面板图标

	// === 列布局图标 ===
	"columns-3": "columns-3",

	// === 媒体图标 ===
	film: "film",

	// === 驼峰命名别名 (新增) ===
	fileText: "file-text",
	chevronRight: "chevron-right",
	chevronLeft: "chevron-left",
	chevronUp: "chevron-up",

	// === 新增缺少的图标映射 ===
	obsidian: "cube",
	folder: "folder",
	document: "file",
	square: "square",
	"check-square": "check-square",
	loading: "spinner",
	wrench: "wrench",
	compress: "compress", // 紧凑布局 - 压缩图标
	expand: "expand", // 宽敞布局 - 展开图标
	list: "list", // 列表视图
	"ellipsis-h": "ellipsis-h", // 横向省略号（已映射，确保可用）

	// === 视图切换图标映射 ===
	grid: "grid", // 卡片视图 - 使用方格图标
	"bar-chart-2": "chart-bar", // 仪表盘视图 - 使用柱状图图标
	table: "list", // 表格视图/基础信息模式 - 使用列表图标

	// === 排序图标映射 ===
	sort: "sort", // 未排序状态
	"sort-up": "sort-up", // 升序排列
	"sort-down": "sort-down", // 降序排列

	// === 质量收件箱图标映射 ===
	inbox: "file", // 收件箱 - 使用文件图标
	"external-link": "link", // 外部链接 - 使用链接图标
	"git-compare": "copy", // Git比较 - 使用复制图标
	"git-branch": "code", // Git分支 - 使用代码图标
	scissors: "edit", // 剪刀 - 使用编辑图标
	users: "star", // 用户组 - 使用星标图标
	"minimize-2": "compress", // 最小化 - 使用压缩图标
	"maximize-2": "expand", // 最大化 - 使用展开图标
	"help-circle": "question-circle", // 帮助圆圈 - 使用问号图标
	"message-circle": "info", // 消息圆圈 - 使用信息图标
	"trending-down": "chart-bar", // 下降趋势 - 使用图表图标
	unlink: "link", // 取消链接 - 使用链接图标
	"alert-octagon": "warning", // 警告八角 - 使用警告图标
	"file-minus": "file", // 文件减 - 使用文件图标
	split: "git-branch", // 拆分 - 使用分支图标
};

// 用于插件系统的图标获取函数
export function getIcon(name: string): string {
	const mappedName = ICON_MAPPING[name] ?? name;
	return resolveObsidianIconName(mappedName);
}

// 获取所有可用的图标名称
export function getAvailableIcons(): string[] {
	return Object.keys(ICON_MAPPING);
}

// 检查图标是否存在
export function hasIcon(name: string): boolean {
	if (!name || !name.trim()) {
		return false;
	}
	const normalized = name.trim();
	return (
		Boolean(ICON_MAPPING[normalized]) ||
		isKnownIconAlias(normalized) ||
		isKnownObsidianIconName(normalized)
	);
}

// 导出图标名称类型 - 支持所有 Obsidian 原生图标名称和语义化别名
export type IconName = string;

// 导出常用图标名称常量，提供更好的开发体验
export const ICON_NAMES = {
	// === 主要功能 ===（优化后的图标常量）
	DECK_STUDY: "deckStudy" as const, // 牌组学习 - 现在映射到graduation-cap
	CARD_MANAGEMENT: "weaveCardManagement" as const, // 卡片管理 - 现在映射到id-card
	AI_ASSISTANT: "aiAssistant" as const, // AI助手 - 现在映射到robot

	// === 基础操作 ===
	ADD: "plus" as const,
	DELETE: "trash" as const,
	EDIT: "edit" as const,
	SETTINGS: "cog" as const,
	CLOSE: "times" as const,
	TIMES: "times" as const,
	CHECK: "check" as const,
	COPY: "copy" as const,
	REFRESH: "sync" as const,
	SYNC: "sync" as const,

	// === 导航 ===
	CHEVRON_DOWN: "chevron-down" as const,
	CHEVRON_UP: "chevron-up" as const,
	CHEVRON_LEFT: "chevron-left" as const,
	CHEVRON_RIGHT: "chevron-right" as const,
	ARROW_LEFT: "arrow-left" as const,
	ARROW_RIGHT: "arrow-right" as const,

	// === 交互 ===（优化后的图标常量）
	EYE: "eye" as const,
	SEARCH: "search" as const,
	FILTER: "filter" as const, // 过滤 - 现在映射到filter
	INFO: "info-circle" as const,
	HELP: "question-circle" as const, // 帮助 - 现在映射到question-circle
	BELL: "bell" as const, // 通知 - 现在映射到bell
	STAR: "star" as const,
	LIGHTBULB: "lightbulb" as const,

	// === 媒体 ===（优化后的图标常量）
	PLAY: "play" as const, // 播放 - 现在映射到play
	PAUSE: "pause" as const, // 暂停 - 新增
	STOP: "stop" as const, // 停止 - 新增
	VOLUME_UP: "volume-up" as const, // 音量增大 - 现在映射到volume-up
	VOLUME_DOWN: "volume-down" as const, // 音量减小 - 新增
	VOLUME_MUTE: "volume-mute" as const, // 静音 - 现在映射到volume-mute

	// === 文件 ===（优化后的图标常量）
	FILE: "file" as const,
	FILE_TEXT: "file-text" as const, // 文本文件 - 用于文档链接
	UPLOAD: "upload" as const, // 上传 - 现在映射到upload
	DOWNLOAD: "download" as const,
	DATABASE: "database" as const,

	// === 开发 ===
	CODE: "code" as const,
	MICROCHIP: "microchip" as const, // 微芯片 - 现在映射到microchip

	// === 分析 ===（优化后的图标常量）
	CHART_BAR: "chart-bar" as const,
	CHART_LINE: "chart-line" as const, // 折线图 - 现在映射到chart-line
	BULLSEYE: "bullseye" as const, // 靶心 - 现在映射到bullseye

	// === 时间 ===
	CLOCK: "clock" as const,
	HISTORY: "history" as const,
	CALENDAR: "calendar-alt" as const,

	// === 状态 ===
	WARNING: "warning" as const,
	CHECK_CIRCLE: "check-circle" as const, // 检查圆圈 - 现在映射到check-circle

	// === 学习 ===（优化后的图标常量）
	BRAIN: "brain" as const,
	GRADUATION_CAP: "graduation-cap" as const, // 毕业帽 - 现在映射到graduation-cap
	BOOK_OPEN: "book-open" as const, // 打开的书 - 新增

	// === 编辑器 ===（优化后的图标常量）
	BOLD: "bold" as const,
	ITALIC: "italic" as const,
	UNDERLINE: "underline" as const,
	HEADING: "heading" as const,
	LIST_UL: "list-ul" as const, // 无序列表 - 现在映射到list-ul
	LIST_OL: "list-ol" as const, // 有序列表 - 新增
	LINK: "link" as const,
	IMAGE: "image" as const,
	MARKDOWN: "markdown" as const, // Markdown - 现在映射到markdown
	LIST_ALT: "list-alt" as const,
	CLIPBOARD_LIST: "clipboard-list" as const, // 剪贴板列表 - 现在映射到clipboard-list
	LAYER_GROUP: "layer-group" as const, // 图层组 - 现在映射到layer-group

	// === 其他 ===（优化后的图标常量）
	TAG: "tag" as const,
	HASH: "hash" as const,
	BOLT: "bolt" as const, // 闪电 - 现在映射到bolt
	MAGIC: "magic" as const, // 魔法 - 现在映射到magic
	LAYERS: "layers" as const,
	COLUMNS: "columns" as const,

	// === 新增的图标常量 ===
	ROBOT: "robot" as const, // 机器人 - AI相关
	ID_CARD: "id-card" as const, // 身份卡 - 卡片管理
	ID_CARD_ALT: "id-card-alt" as const, // 身份卡替代 - 卡片管理变体

	// === 补充缺少的图标常量 ===
	OBSIDIAN: "obsidian" as const, // Obsidian
	FOLDER: "folder" as const, // 文件夹
	DOCUMENT: "document" as const, // 文档
	PLUS: "plus" as const, // 加号
	X: "x" as const, // X
	SQUARE: "square" as const, // 方形
	CHECK_SQUARE: "check-square" as const, // 选中方形
	LOADING: "loading" as const, // 加载中
	WRENCH: "wrench" as const, // 扳手

	// === 排序图标常量 ===
	SORT: "sort" as const, // 未排序状态
	SORT_UP: "sort-up" as const, // 升序排列
	SORT_DOWN: "sort-down" as const, // 降序排列
} as const;
