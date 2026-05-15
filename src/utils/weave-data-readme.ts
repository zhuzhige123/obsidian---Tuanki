import { getV2Paths, normalizeWeaveParentFolder } from "../config/paths";

export const WEAVE_DATA_README_NAME = "README.md";

const LEGACY_WEAVE_DATA_README_NAME = "_README.md";

type DataAdapterLike = {
	exists(path: string): Promise<boolean>;
	write(path: string, content: string): Promise<void>;
	remove?(path: string): Promise<void>;
};

type WeaveDataReadmeDescriptor = {
	dirPath: string;
	readmePath: string;
	content: string;
};

function normalizeVaultPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function buildRootReadme(): string {
	return [
		"# Weave 数据目录说明",
		"",
		"这个文档用于说明 `weave/` 在正常情况下应呈现出的标准数据结构。",
		"它只介绍 vault 内可见、会跟随仓库同步的正式数据，不混入旧兼容目录、迁移残留或异常文件。",
		"可重建缓存、索引、日志和本机状态不在这里，而是在当前配置目录的 `plugins/weave/` 下。",
		"",
		"下面先用目录树快速说明标准结构，再用表格补充关键约定。",
		"为便于理解，目录树只展示核心正常结构，不展开所有业务细节文件。",
		"",
		"## 标准目录结构",
		"",
		"```text",
		"weave/",
		"├─ README.md                          # 本说明文档",
		"├─ schema-version.json                # 当前数据结构版本标记",
		"├─ ai-assistant/                      # AI 助手相关 vault 数据",
		"│  └─ user-prompts/",
		"│     └─ *.md                         # 用户自定义提示词 Markdown 文件",
		"├─ editor/                            # 编辑器桥接临时文件（功能型 temp）",
		"│  └─ *.md                            # 仅编辑器桥接使用，不作为长期业务笔记目录",
		"├─ memory/                            # 记忆系统主数据",
		"│  ├─ decks.json",
		"│  ├─ deck-files/",
		"│  ├─ learning/",
		"│  │  └─ sessions/",
		"│  └─ media/",
		"├─ incremental-reading/               # 增量阅读标准结构",
		"│  ├─ topics/",
		"│  ├─ points/",
		"│  ├─ profiles/",
		"│  └─ relations/",
		"└─ question-bank/                     # 题库与测试数据",
		"   ├─ banks.json                      # 题库定义",
		"   ├─ question-stats.json             # 全局题目统计",
		"   ├─ test-history.json               # 测试历史",
		"   ├─ in-progress.json                # 进行中的测试状态",
		"   └─ banks/",
		"      └─ {bankId}/questions.json      # 按题库拆分的问题文件",
		"```",
		"",
		"## 关键目录表",
		"",
		"| 路径 | 作用 | 是否随 vault 同步 | 备注 |",
		"| --- | --- | --- | --- |",
		"| `ai-assistant/user-prompts/` | 用户自定义提示词 Markdown 文件 | 是 | AI 助手会在这里读写自定义提示词 |",
		"| `editor/` | 编辑器桥接临时文件 | 是 | 这是少数必须放在 vault 内的功能型 temp，不属于长期业务真源 |",
		"| `memory/formal-deck-bindings.json` | 正式牌组观察绑定 / 沉淀状态 | 是 | 供涌现牌组与正式牌组观察绑定使用 |",
		"| `memory/deck-files/` | 记忆正式牌组的 `.wdeck` 文件目录 | 是 | 正式牌组真源以这里的 `.wdeck` 为主 |",
		"| `memory/deck-graphs/` | 牌组知识图谱 / 分析输出 | 是 | 牌组分析功能可能在这里产出文件 |",
		"| `memory/learning/sessions/` | 学习历史与统计输入 | 是 | 这里是历史记录，不是断点续学状态 |",
		"| `memory/media/` | 图片、音频、遮罩、导入清单 | 是 | 不建议手动删 `manifest.json` 或批量改名 |",
		"| `incremental-reading/topics/` | IR 专题层真源 | 是 | 用于表达专题层结构，不直接承担正文副本存储 |",
		"| `incremental-reading/points/` | IR 阅读点与调度真源 | 是 | 阅读点应与正文文件分离，正文不长期内嵌在这里 |",
		"| `incremental-reading/profiles/` | 需同步的调度模板 | 是 | 用户可编辑的模板应与可重建索引分开 |",
		"| `incremental-reading/relations/` | 阅读关系与映射真源 | 是 | 用于表达专题、点、正文之间的关系 |",
		"| `question-bank/question-stats.json` | 全局题目统计 | 是 | 属于题库同步数据，而不是插件本机缓存 |",
		"| `question-bank/banks/` | 题库按库拆分的问题文件 | 是 | 可能持续增长，优先通过插件迁移或清理 |",
		"| `question-bank/session-archives.json` | 测试会话归档 | 是 | 历史归档属于题库正式同步数据 |",
		"| `question-bank/error-book.json` | 错题数据 | 是 | 题库错题状态需要随 vault 一起同步 |",
		"",
		"## 重要边界",
		"",
		"| 项目 | 在哪里 | 说明 |",
		"| --- | --- | --- |",
		"| 记忆卡正式归属数据 | `memory/deck-files/*.wdeck` | 正式牌组数据以 `.wdeck` 为主 |",
		"| 学习历史 | `memory/learning/sessions/YYYY-MM.json` | 用于统计、热力图、FSRS 分析输入 |",
		"| 增量阅读正文 Markdown | 上次手动选择目录 → Obsidian 默认新建笔记位置 → 库根目录 `/` | 正文文件不属于 `weave/` 标准树的一部分，应与阅读点调度文件分离 |",
		"| 编辑器桥接临时文件 | `weave/editor/` | 这是依赖 Obsidian `TFile` 能力的功能型 temp，属于受控例外 |",
		"| 断点续学状态 | `当前配置目录/plugins/weave/state/study-session.json` | 不在 `weave/` 内，不随 vault 数据目录一起展示 |",
		"| 插件本地缓存 / 索引 / 临时状态 | `当前配置目录/plugins/weave/` | 属于插件本地状态，不是 vault 主数据 |",
		"",
		"## 非标准目录怎么理解",
		"",
		"- 这份 README 只展示推荐正常结构，不列出旧兼容目录、迁移冲突目录或历史残留文件。",
		"- 如果你在 `weave/` 下看到这里未列出的旧目录或旧文件，通常表示迁移残留、兼容输入或异常外来文件，不应把它们理解为标准结构。",
		"- 这类对象应优先通过“卡片管理 -> 数据管理”检查与修复，而不是直接手动混删。",
		"",
		"## 使用约定",
		"",
		"- `weave/` 应优先只放真源文件和功能上必须放在 vault 内的例外文件；可重建缓存、索引、本机状态不应手动塞进这里。",
		"- 这里的 JSON、`.wdeck`、`.irdeck` 和媒体清单由插件维护，不建议手动改名、批量移动或跨目录复制。",
		"- `weave/editor/` 里的文件是编辑器桥接文件，不建议拿它当普通长期笔记目录使用。",
		"- 这个 `README.md` 只是说明文档，不参与插件数据读取。",
		"- 删除真实数据会影响跨设备同步、学习进度、历史统计或题库状态；删除这个 `README.md` 不会影响数据，插件会在需要时重新补齐。",
	].join("\n");
}

function getReadmeDescriptor(parentFolder?: string): WeaveDataReadmeDescriptor {
	const v2Paths = getV2Paths(normalizeWeaveParentFolder(parentFolder));
	const dirPath = normalizeVaultPath(v2Paths.root);

	return {
		dirPath,
		readmePath: `${dirPath}/${WEAVE_DATA_README_NAME}`,
		content: `${buildRootReadme().trim()}\n`,
	};
}

function getLegacyWeaveDataReadmePaths(parentFolder?: string): string[] {
	const v2Paths = getV2Paths(normalizeWeaveParentFolder(parentFolder));
	return [
		v2Paths.root,
		v2Paths.memory.root,
		`${v2Paths.memory.root}/deck-files`,
		v2Paths.memory.learning.root,
		v2Paths.memory.learning.sessions,
		v2Paths.memory.media,
		v2Paths.ir.root,
		v2Paths.ir.materials.root,
		`${v2Paths.ir.root}/IR`,
		v2Paths.questionBank.root,
		v2Paths.questionBank.banksDir,
	].map((dirPath) => `${normalizeVaultPath(dirPath)}/${LEGACY_WEAVE_DATA_README_NAME}`);
}

async function ensureReadme(
	adapter: DataAdapterLike,
	descriptor: WeaveDataReadmeDescriptor
): Promise<void> {
	if (!(await adapter.exists(descriptor.dirPath))) {
		return;
	}
	await adapter.write(descriptor.readmePath, descriptor.content);
}

async function cleanupLegacyReadmes(
	adapter: DataAdapterLike,
	parentFolder?: string
): Promise<void> {
	if (typeof adapter.remove !== "function") {
		return;
	}

	for (const legacyPath of getLegacyWeaveDataReadmePaths(parentFolder)) {
		if (await adapter.exists(legacyPath)) {
			await adapter.remove(legacyPath);
		}
	}
}

export function getWeaveDataReadmeDescriptors(parentFolder?: string): WeaveDataReadmeDescriptor[] {
	return [getReadmeDescriptor(parentFolder)];
}

export function getRelevantWeaveDataReadmeDescriptors(
	touchedPath: string,
	parentFolder?: string
): WeaveDataReadmeDescriptor[] {
	const descriptor = getReadmeDescriptor(parentFolder);
	const normalizedTouchedPath = normalizeVaultPath(touchedPath);

	if (
		normalizedTouchedPath === descriptor.dirPath ||
		normalizedTouchedPath.startsWith(`${descriptor.dirPath}/`)
	) {
		return [descriptor];
	}

	return [];
}

export async function ensureExistingWeaveDataReadmes(
	adapter: DataAdapterLike,
	parentFolder?: string
): Promise<void> {
	const descriptor = getReadmeDescriptor(parentFolder);
	await ensureReadme(adapter, descriptor);
	await cleanupLegacyReadmes(adapter, parentFolder);
}

export async function ensureWeaveDataReadmesForPath(
	adapter: DataAdapterLike,
	touchedPath: string,
	parentFolder?: string
): Promise<void> {
	if (getRelevantWeaveDataReadmeDescriptors(touchedPath, parentFolder).length === 0) {
		return;
	}

	await ensureExistingWeaveDataReadmes(adapter, parentFolder);
}
