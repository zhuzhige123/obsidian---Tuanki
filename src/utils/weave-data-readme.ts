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
		"这个文档是 `weave/` 数据根目录的总说明。",
		"",
		"下面先用目录树快速说明结构，再用表格补充关键约定。",
		"",
		"## 目录结构",
		"",
		"```text",
		"weave/",
		"├─ README.md                         # 本说明文档",
		"├─ schema-version.json               # 当前数据结构版本标记",
		"├─ _migration_conflicts/             # 迁移冲突保留区，仅在迁移异常时出现",
		"├─ ai-assistant/                     # AI 助手相关 vault 数据",
		"│  └─ user-prompts/                  # 用户自定义提示词目录",
		"│     └─ *.md                        # 用户提示词 Markdown 文件",
		"├─ decks/                            # 旧版牌组目录，兼容迁移残留时可能出现",
		"├─ memory/                           # 记忆系统主数据",
		"│  ├─ decks.json                     # 记忆牌组定义、设置、统计入口",
		"│  ├─ formal-deck-bindings.json      # 正式牌组观察绑定 / 沉淀状态",
		"│  ├─ cards/                         # 旧卡片 JSON 分片目录，仅兼容旧数据时出现",
		"│  ├─ deck-cards/                    # 牌组成员 UUID 文件 / 兼容辅助数据",
		"│  ├─ deck-files/                    # 正式牌组 .wdeck 分卷目录",
		"│  │  └─ *.wdeck                     # 正式牌组分卷文件",
		"│  ├─ deck-graphs/                   # 牌组知识图谱 / 分析输出",
		"│  ├─ learning/                      # 学习历史数据",
		"│  │  └─ sessions/",
		"│  │     └─ YYYY-MM.json             # 按月分片的学习会话历史",
		"│  └─ media/                         # 记忆卡媒体资源与导入清单",
		"├─ incremental-reading/              # 增量阅读数据与输出",
		"│  ├─ topics.json                    # 主题数据",
		"│  ├─ decks.json                     # IR 专题 / 牌组定义",
		"│  ├─ blocks.json                    # 块级状态",
		"│  ├─ materials/                     # 导入材料索引与材料会话",
		"│  └─ IR/                            # 人类可读 Markdown 输出",
		"└─ question-bank/                    # 题库与测试数据",
		"   ├─ banks.json                     # 题库定义",
		"   ├─ banks/                         # 按题库拆分的问题文件",
		"   ├─ test-history.json              # 测试历史",
		"   ├─ in-progress.json               # 进行中的测试状态",
		"   ├─ session-archives.json          # 历史归档",
		"   └─ error-book.json                # 错题相关数据",
		"└─ temp/                             # 旧版编辑器临时文件目录，兼容路径可能保留",
		"```",
		"",
		"## 关键目录表",
		"",
		"| 路径 | 作用 | 是否随 vault 同步 | 备注 |",
		"| --- | --- | --- | --- |",
		"| `ai-assistant/user-prompts/` | 用户自定义提示词 Markdown 文件 | 是 | AI 助手会在这里读写自定义提示词 |",
		"| `decks/` | 旧版牌组目录 | 可能 | 兼容迁移或旧版本残留时可能出现 |",
		"| `memory/formal-deck-bindings.json` | 正式牌组观察绑定 / 沉淀状态 | 是 | 供涌现牌组与正式牌组观察绑定使用 |",
		"| `memory/cards/` | 旧卡片 JSON 分片目录 | 可能 | 仅旧数据兼容链路仍存在时会使用 |",
		"| `memory/deck-cards/` | 牌组成员 UUID 文件 | 可能 | 用于兼容链路或成员文件修复流程 |",
		"| `memory/deck-files/` | 记忆正式牌组的 `.wdeck` 文件目录 | 是 | 同一张记忆卡不应跨多个正式 `.wdeck` 持久复用 |",
		"| `memory/deck-graphs/` | 牌组知识图谱 / 分析输出 | 是 | 牌组分析功能可能在这里产出文件 |",
		"| `memory/learning/sessions/` | 学习历史与统计输入 | 是 | 这里是历史记录，不是断点续学状态 |",
		"| `memory/media/` | 图片、音频、遮罩、导入清单 | 是 | 不建议手动删 `manifest.json` 或批量改名 |",
		"| `incremental-reading/IR/` | 增量阅读的人类可读 Markdown 输出 | 是 | 可阅读，但改名前最好先确认没有破坏引用 |",
		"| `question-bank/banks/` | 题库按库拆分的问题文件 | 是 | 可能持续增长，优先通过插件迁移或清理 |",
		"| `_migration_conflicts/` | 自动迁移时无法直接覆盖的冲突副本 | 是 | 仅在迁移异常时出现，复核后可再决定如何处理 |",
		"| `temp/` | 旧版编辑器临时文件目录 | 可能 | 兼容旧路径时可能残留，后续可逐步收口 |",
		"",
		"## 重要边界",
		"",
		"| 项目 | 在哪里 | 说明 |",
		"| --- | --- | --- |",
		"| 记忆卡正式归属数据 | `memory/deck-files/*.wdeck` | 正式牌组数据以 `.wdeck` 为主 |",
		"| 学习历史 | `memory/learning/sessions/YYYY-MM.json` | 用于统计、热力图、FSRS 分析输入 |",
		"| 断点续学状态 | `当前配置目录/plugins/weave/state/study-session.json` | 不在 `weave/` 内，不随 vault 数据目录一起展示 |",
		"| 插件本地缓存 / 索引 / 临时状态 | `当前配置目录/plugins/weave/` | 属于插件本地状态，不是 vault 主数据 |",
		"",
		"## 使用约定",
		"",
		"- 这里的 JSON、`.wdeck` 和媒体清单由插件维护，不建议手动改名、批量移动或跨目录复制。",
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
