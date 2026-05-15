import type { App } from "obsidian";
import type {
	CardManagementViewPreferences,
	StudyInterfaceViewPreferences,
} from "../../components/settings/types/settings-types";
import { getPluginPaths } from "../../config/paths";
import type {
	AIProvider,
	GeneratedCard,
	GenerationConfig,
	PromptTemplate,
} from "../../types/ai-types";
import type { IRCalendarSidebarSettings } from "../../types/plugin-settings.d";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import type { EpubBookshelfSettings } from "../epub/EpubStorageService";
import { getEpubRuntime } from "../epub/epub-runtime";

interface PersistedStudySessionState {
	persistedStudySession?: unknown;
	savedAt?: string;
}

function normalizeStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const normalized = Array.from(
		new Set(
			value
				.map((item) => (typeof item === "string" ? item.trim() : ""))
				.filter(Boolean)
		)
	);

	return normalized.length > 0 ? normalized : [];
}

function normalizeSavedGenerationConfig(value: unknown): AIAssistantSavedGenerationConfig | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const normalized: AIAssistantSavedGenerationConfig = {};
	if (typeof value.cardCount === "number") {
		normalized.cardCount = value.cardCount;
	}
	if (
		value.difficulty === "easy" ||
		value.difficulty === "medium" ||
		value.difficulty === "hard" ||
		value.difficulty === "mixed"
	) {
		normalized.difficulty = value.difficulty;
	}
	if (isRecord(value.typeDistribution)) {
		const { qa, cloze, choice } = value.typeDistribution;
		if (typeof qa === "number" && typeof cloze === "number" && typeof choice === "number") {
			normalized.typeDistribution = { qa, cloze, choice };
		}
	}
	if (typeof value.enableHints === "boolean") {
		normalized.enableHints = value.enableHints;
	}
	if (typeof value.temperature === "number") {
		normalized.temperature = value.temperature;
	}
	if (typeof value.maxTokens === "number") {
		normalized.maxTokens = value.maxTokens;
	}
	if (typeof value.maxGenerationLimit === "number") {
		normalized.maxGenerationLimit = value.maxGenerationLimit;
	}
	if (typeof value.prioritizePromptRequirements === "boolean") {
		normalized.prioritizePromptRequirements = value.prioritizePromptRequirements;
	}

	return Object.keys(normalized).length > 0 ? normalized : {};
}

export interface AIAssistantSavedGenerationConfig {
	cardCount?: number;
	difficulty?: "easy" | "medium" | "hard" | "mixed";
	typeDistribution?: {
		qa: number;
		cloze: number;
		choice: number;
	};
	enableHints?: boolean;
	temperature?: number;
	maxTokens?: number;
	maxGenerationLimit?: number;
	prioritizePromptRequirements?: boolean;
}

export type AIAssistantSubView = "generate" | "parse-preview";

export interface AIAssistantLocalPreferences {
	lastUsedProvider?: AIProvider | string;
	lastUsedModel?: string;
	savedGenerationConfig?: AIAssistantSavedGenerationConfig;
	importAutoTags?: string[];
	subView?: AIAssistantSubView;
	lastSelectedSourceFilePath?: string;
	lastSelectedPromptFilePath?: string;
	lastSelectedParsePresetId?: string;
}

export interface AIGenerationHistoryEntry {
	id: string;
	createdAt: string;
	sourceFile: {
		path: string;
		name: string;
		size: number;
		extension: string;
	} | null;
	promptFile?: {
		path: string;
		name: string;
	} | null;
	sourceContent: string;
	cards: GeneratedCard[];
	config: GenerationConfig;
	selectedPrompt: PromptTemplate | null;
	customPrompt: string;
}

export interface CreateCardPreferencesState {
	lastSelectedDeckId?: string;
	lastSelectedDeckNames?: string[];
}

export interface EditorModalSizeState {
	preset: "small" | "medium" | "large" | "extra-large" | "custom";
	customWidth?: number;
	customHeight?: number;
}

interface LegacyPluginRuntimeData {
	persistedStudySession?: unknown;
	deckView?: unknown;
	cardManagementViewPreferences?: unknown;
	studyInterfaceViewPreferences?: unknown;
	createCardPreferences?: unknown;
	epubBookshelf?: unknown;
	editorModalSize?: {
		preset?: unknown;
		customWidth?: unknown;
		customHeight?: unknown;
		rememberLastSize?: unknown;
		enableResize?: unknown;
		[key: string]: unknown;
	};
	aiConfig?: {
		lastUsedProvider?: unknown;
		lastUsedModel?: unknown;
		savedGenerationConfig?: unknown;
		generationHistory?: unknown;
		[key: string]: unknown;
	};
	incrementalReading?: {
		calendarSidebar?: unknown;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

interface LegacyPluginRuntimeHost {
	app: App;
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

const DECK_VIEW_STORAGE_KEY = "weave-deck-view";
const CARD_MANAGEMENT_VIEW_PREFERENCES_KEY = "weave-card-management-view-preferences";
const STUDY_INTERFACE_VIEW_PREFERENCES_KEY = "weave-study-interface-view-preferences";
const IR_CALENDAR_SIDEBAR_SETTINGS_KEY = "weave-ir-calendar-sidebar-settings";
const AI_ASSISTANT_PREFERENCES_KEY = "weave-ai-assistant-preferences";
const CREATE_CARD_PREFERENCES_KEY = "weave-create-card-preferences";
const EPUB_BOOKSHELF_SETTINGS_KEY = `${getEpubRuntime().pluginId}-epub-bookshelf-settings`;
const EDITOR_MODAL_SIZE_STATE_KEY = "weave-editor-modal-size-state";
const PLUGIN_DATA_RECOVERY_DIR_NAME = "config-recovery";
const LAST_GOOD_PLUGIN_DATA_FILE_NAME = "plugin-data-last-good.json";

type PluginDataRecoveryAction = "none" | "restored-backup" | "reset-defaults";

let pendingPluginDataRecoveryAction: PluginDataRecoveryAction = "none";
let pluginDataWriteChain: Promise<void> = Promise.resolve();
const pluginStateWriteChains = new Map<string, Promise<void>>();

function getPluginDataPath(app: App): string {
	return `${getPluginPaths(app).root}/data.json`;
}

function getAIGenerationHistoryPath(app: App): string {
	return `${getPluginPaths(app).state.root}/ai-generation-history.json`;
}

function getPluginDataRecoveryDir(app: App): string {
	return `${getPluginPaths(app).backups}/${PLUGIN_DATA_RECOVERY_DIR_NAME}`;
}

function getLastGoodPluginDataBackupPath(app: App): string {
	return `${getPluginDataRecoveryDir(app)}/${LAST_GOOD_PLUGIN_DATA_FILE_NAME}`;
}

function getCorruptPluginDataBackupPath(app: App): string {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	return `${getPluginDataRecoveryDir(app)}/plugin-data-corrupt-${timestamp}.json`;
}

function markPluginDataRecovery(action: PluginDataRecoveryAction): void {
	if (action === "none") {
		return;
	}

	if (pendingPluginDataRecoveryAction === "reset-defaults" && action === "restored-backup") {
		return;
	}

	pendingPluginDataRecoveryAction = action;
}

function isJsonParseFailure(error: unknown): boolean {
	if (error instanceof SyntaxError) {
		return true;
	}

	const message = error instanceof Error ? error.message : String(error);
	return /Unexpected end of JSON input|JSON\.parse|failed to read JSON|invalid json/i.test(message);
}

async function writeTextFile(app: App, path: string, content: string): Promise<void> {
	const adapter = app.vault.adapter;
	await DirectoryUtils.ensureDirForFile(adapter, path);
	await adapter.write(path, content);
}

async function writeTextFileAtomically(app: App, path: string, content: string): Promise<void> {
	const adapter = app.vault.adapter;
	await DirectoryUtils.ensureDirForFile(adapter, path);

	if (await adapter.exists(path)) {
		await adapter.process(path, () => content);
		return;
	}

	await adapter.write(path, content);
}

function normalizeStatePath(path: string): string {
	return path.replace(/\\/g, "/");
}

function serializePluginStateWrite<T>(path: string, task: () => Promise<T>): Promise<T> {
	const key = normalizeStatePath(path);
	const run = (pluginStateWriteChains.get(key) ?? Promise.resolve())
		.catch(() => undefined)
		.then(task);
	pluginStateWriteChains.set(
		key,
		run.then(
			() => undefined,
			() => undefined
		)
	);
	return run;
}

function serializePluginDataWrite<T>(task: () => Promise<T>): Promise<T> {
	const run = pluginDataWriteChain.catch(() => undefined).then(task);
	pluginDataWriteChain = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}

export function consumePendingPluginDataRecoveryAction(): PluginDataRecoveryAction {
	const action = pendingPluginDataRecoveryAction;
	pendingPluginDataRecoveryAction = "none";
	return action;
}

export async function loadPluginDataWithRecovery(
	host: LegacyPluginRuntimeHost
): Promise<Record<string, unknown>> {
	try {
		const loadedData = await host.loadData();
		if (!isRecord(loadedData)) {
			return {};
		}
		return loadedData;
	} catch (error) {
		if (!isJsonParseFailure(error)) {
			throw error;
		}

		const app = host.app;
		const adapter = app.vault.adapter;
		const dataPath = getPluginDataPath(app);
		logger.error("[PluginLocalState] data.json 读取失败，开始自动恢复", error);

		try {
			if (await adapter.exists(dataPath)) {
				const corruptedRaw = await adapter.read(dataPath);
				const corruptedBackupPath = getCorruptPluginDataBackupPath(app);
				await writeTextFile(app, corruptedBackupPath, corruptedRaw);
				logger.warn(`[PluginLocalState] 已备份损坏的 data.json: ${corruptedBackupPath}`);
			}
		} catch (backupCorruptedError) {
			logger.warn("[PluginLocalState] 备份损坏的 data.json 失败", backupCorruptedError);
		}

		const lastGoodBackupPath = getLastGoodPluginDataBackupPath(app);
		try {
			if (await adapter.exists(lastGoodBackupPath)) {
				const backupRaw = await adapter.read(lastGoodBackupPath);
				const backupData = JSON.parse(backupRaw) as unknown;
				if (isRecord(backupData)) {
					try {
						await writeTextFileAtomically(app, dataPath, backupRaw);
					} catch (restoreWriteError) {
						logger.warn(
							"[PluginLocalState] 回写最近一次有效 data.json 备份失败，但插件将继续使用恢复数据",
							restoreWriteError
						);
					}

					markPluginDataRecovery("restored-backup");
					logger.warn("[PluginLocalState] 已从最近一次有效备份恢复 data.json");
					return backupData;
				}
			}
		} catch (backupRestoreError) {
			logger.warn("[PluginLocalState] 从最近一次有效备份恢复 data.json 失败", backupRestoreError);
		}

		const emptyData: Record<string, unknown> = {};
		try {
			await writeTextFileAtomically(app, dataPath, JSON.stringify(emptyData, null, 2));
		} catch (resetWriteError) {
			logger.warn(
				"[PluginLocalState] 重置 data.json 为默认空配置失败，插件将继续以内存默认值运行",
				resetWriteError
			);
		}

		markPluginDataRecovery("reset-defaults");
		logger.warn("[PluginLocalState] 未找到可用的 data.json 备份，已重置为空配置");
		return emptyData;
	}
}

export async function savePluginDataWithBackup(
	host: LegacyPluginRuntimeHost,
	data: unknown
): Promise<void> {
	const serialized = JSON.stringify(data, null, 2);
	const dataPath = getPluginDataPath(host.app);
	const backupPath = getLastGoodPluginDataBackupPath(host.app);

	await serializePluginDataWrite(async () => {
		await writeTextFileAtomically(host.app, dataPath, serialized);

		try {
			await writeTextFileAtomically(host.app, backupPath, serialized);
		} catch (backupError) {
			logger.warn("[PluginLocalState] 备份最近一次有效 data.json 失败", backupError);
		}
	});
}

export class PluginLocalStateService {
	constructor(private app: App) {}

	async loadPersistedStudySession<T = unknown>(): Promise<T | null> {
		const data = await this.readStateFile<PersistedStudySessionState>(
			getPluginPaths(this.app).state.studySession
		);
		return (data?.persistedStudySession as T | undefined) ?? null;
	}

	async savePersistedStudySession(session: unknown): Promise<void> {
		await this.writeStateFile(getPluginPaths(this.app).state.studySession, {
			persistedStudySession: session,
			savedAt: new Date().toISOString(),
		});
	}

	async clearPersistedStudySession(): Promise<void> {
		await this.removeStateFile(getPluginPaths(this.app).state.studySession);
	}

	async loadDeckViewPreference(): Promise<string | null> {
		const entries = await this.loadManagedLocalStorageEntries();
		return entries[DECK_VIEW_STORAGE_KEY] ?? null;
	}

	async saveDeckViewPreference(deckView: string): Promise<void> {
		await this.setManagedLocalStorageEntry(DECK_VIEW_STORAGE_KEY, deckView);
	}

	async loadManagedLocalStorageEntries(): Promise<Record<string, string>> {
		const data = await this.readStateFile<unknown>(getPluginPaths(this.app).state.localStorage);
		return this.normalizeStringMap(data);
	}

	async replaceManagedLocalStorageEntries(entries: Record<string, string>): Promise<void> {
		await this.writeStateFile(
			getPluginPaths(this.app).state.localStorage,
			this.normalizeStringMap(entries)
		);
	}

	async setManagedLocalStorageEntry(key: string, value: string | null): Promise<void> {
		await this.updateManagedLocalStorageEntries((entries) => {
			if (value == null) {
				delete entries[key];
			} else {
				entries[key] = value;
			}
		});
	}

	async loadManagedJsonEntry<T>(key: string): Promise<T | null> {
		const entries = await this.loadManagedLocalStorageEntries();
		const raw = entries[key];
		if (!raw) {
			return null;
		}

		try {
			return JSON.parse(raw) as T;
		} catch (error) {
			logger.warn(`[PluginLocalState] JSON 本地状态解析失败: ${key}`, error);
			return null;
		}
	}

	async saveManagedJsonEntry(key: string, value: unknown): Promise<void> {
		await this.setManagedLocalStorageEntry(key, JSON.stringify(value));
	}

	async loadCardManagementViewPreferences(): Promise<CardManagementViewPreferences | null> {
		return await this.loadManagedJsonEntry<CardManagementViewPreferences>(
			CARD_MANAGEMENT_VIEW_PREFERENCES_KEY
		);
	}

	async saveCardManagementViewPreferences(
		preferences: CardManagementViewPreferences
	): Promise<void> {
		await this.saveManagedJsonEntry(CARD_MANAGEMENT_VIEW_PREFERENCES_KEY, preferences);
	}

	async loadStudyInterfaceViewPreferences(): Promise<StudyInterfaceViewPreferences | null> {
		return await this.loadManagedJsonEntry<StudyInterfaceViewPreferences>(
			STUDY_INTERFACE_VIEW_PREFERENCES_KEY
		);
	}

	async saveStudyInterfaceViewPreferences(
		preferences: StudyInterfaceViewPreferences
	): Promise<void> {
		await this.saveManagedJsonEntry(STUDY_INTERFACE_VIEW_PREFERENCES_KEY, preferences);
	}

	async loadIRCalendarSidebarSettings(): Promise<IRCalendarSidebarSettings | null> {
		return await this.loadManagedJsonEntry<IRCalendarSidebarSettings>(
			IR_CALENDAR_SIDEBAR_SETTINGS_KEY
		);
	}

	async saveIRCalendarSidebarSettings(settings: IRCalendarSidebarSettings): Promise<void> {
		await this.saveManagedJsonEntry(IR_CALENDAR_SIDEBAR_SETTINGS_KEY, settings);
	}

	async loadAIAssistantPreferences(): Promise<AIAssistantLocalPreferences | null> {
		const preferences = await this.loadManagedJsonEntry<unknown>(AI_ASSISTANT_PREFERENCES_KEY);
		if (preferences == null) {
			return null;
		}
		return this.normalizeAIAssistantPreferences(preferences);
	}

	async saveAIAssistantPreferences(preferences: AIAssistantLocalPreferences): Promise<void> {
		await this.saveManagedJsonEntry(
			AI_ASSISTANT_PREFERENCES_KEY,
			this.normalizeAIAssistantPreferences(preferences)
		);
	}

	async loadCreateCardPreferences(): Promise<CreateCardPreferencesState | null> {
		const preferences = await this.loadManagedJsonEntry<unknown>(CREATE_CARD_PREFERENCES_KEY);
		if (preferences == null) {
			return null;
		}
		return this.normalizeCreateCardPreferences(preferences);
	}

	async saveCreateCardPreferences(preferences: CreateCardPreferencesState): Promise<void> {
		await this.saveManagedJsonEntry(
			CREATE_CARD_PREFERENCES_KEY,
			this.normalizeCreateCardPreferences(preferences)
		);
	}

	async loadEpubBookshelfSettings(): Promise<EpubBookshelfSettings | null> {
		const settings = await this.loadManagedJsonEntry<unknown>(EPUB_BOOKSHELF_SETTINGS_KEY);
		if (settings == null) {
			return null;
		}
		return this.normalizeEpubBookshelfSettings(settings);
	}

	async saveEpubBookshelfSettings(settings: EpubBookshelfSettings): Promise<void> {
		await this.saveManagedJsonEntry(
			EPUB_BOOKSHELF_SETTINGS_KEY,
			this.normalizeEpubBookshelfSettings(settings)
		);
	}

	async loadEditorModalSizeState(): Promise<EditorModalSizeState | null> {
		const state = await this.loadManagedJsonEntry<unknown>(EDITOR_MODAL_SIZE_STATE_KEY);
		if (state == null) {
			return null;
		}
		return this.normalizeEditorModalSizeState(state);
	}

	async saveEditorModalSizeState(state: EditorModalSizeState): Promise<void> {
		await this.saveManagedJsonEntry(
			EDITOR_MODAL_SIZE_STATE_KEY,
			this.normalizeEditorModalSizeState(state)
		);
	}

	async loadAIGenerationHistory(): Promise<AIGenerationHistoryEntry[] | null> {
		const history = await this.readStateFile<unknown>(getAIGenerationHistoryPath(this.app));
		return Array.isArray(history) ? (history as AIGenerationHistoryEntry[]) : null;
	}

	async saveAIGenerationHistory(history: AIGenerationHistoryEntry[]): Promise<void> {
		await this.writeStateFile(getAIGenerationHistoryPath(this.app), history);
	}

	private async readStateFile<T>(path: string): Promise<T | null> {
		const adapter = this.app.vault.adapter;
		try {
			if (!(await adapter.exists(path))) {
				return null;
			}
			return JSON.parse(await adapter.read(path)) as T;
		} catch (error) {
			logger.warn(`[PluginLocalState] 读取失败: ${path}`, error);
			return null;
		}
	}

	private async writeStateFile(path: string, data: unknown): Promise<void> {
		await serializePluginStateWrite(path, async () => {
			await this.writeStateFileUnchecked(path, data);
		});
	}

	private async removeStateFile(path: string): Promise<void> {
		await serializePluginStateWrite(path, async () => {
			const adapter = this.app.vault.adapter;
			if (await adapter.exists(path)) {
				await adapter.remove(path);
			}
		});
	}

	private async writeStateFileUnchecked(path: string, data: unknown): Promise<void> {
		await writeTextFileAtomically(this.app, path, JSON.stringify(data, null, 2));
	}

	private async updateManagedLocalStorageEntries(
		mutator: (entries: Record<string, string>) => void
	): Promise<void> {
		const path = getPluginPaths(this.app).state.localStorage;
		await serializePluginStateWrite(path, async () => {
			const entries = this.normalizeStringMap(
				await this.readStateFile<Record<string, string>>(path)
			);
			mutator(entries);
			await this.writeStateFileUnchecked(path, entries);
		});
	}

	private normalizeStringMap(value: unknown): Record<string, string> {
		if (!isRecord(value)) {
			return {};
		}

		const normalized: Record<string, string> = {};
		for (const [key, entry] of Object.entries(value)) {
			if (typeof entry === "string") {
				normalized[key] = entry;
			}
		}
		return normalized;
	}

	private normalizeAIAssistantPreferences(value: unknown): AIAssistantLocalPreferences {
		if (!isRecord(value)) {
			return {};
		}

		const normalized: AIAssistantLocalPreferences = {};
		if (typeof value.lastUsedProvider === "string") {
			normalized.lastUsedProvider = value.lastUsedProvider;
		}
		if (typeof value.lastUsedModel === "string") {
			normalized.lastUsedModel = value.lastUsedModel;
		}
		const savedGenerationConfig = normalizeSavedGenerationConfig(value.savedGenerationConfig);
		if (savedGenerationConfig) {
			normalized.savedGenerationConfig = savedGenerationConfig;
		}
		const importAutoTags = normalizeStringArray(value.importAutoTags)
			?? (isRecord(value.savedGenerationConfig)
				? normalizeStringArray(value.savedGenerationConfig.autoTags)
				: undefined);
		if (Array.isArray(importAutoTags)) {
			normalized.importAutoTags = importAutoTags;
		}
		if (value.subView === "generate" || value.subView === "parse-preview") {
			normalized.subView = value.subView;
		}
		if (typeof value.lastSelectedSourceFilePath === "string") {
			normalized.lastSelectedSourceFilePath = value.lastSelectedSourceFilePath;
		}
		if (typeof value.lastSelectedPromptFilePath === "string") {
			normalized.lastSelectedPromptFilePath = value.lastSelectedPromptFilePath;
		}
		if (typeof value.lastSelectedParsePresetId === "string") {
			normalized.lastSelectedParsePresetId = value.lastSelectedParsePresetId;
		}
		return normalized;
	}

	private normalizeCreateCardPreferences(value: unknown): CreateCardPreferencesState {
		if (!isRecord(value)) {
			return {
				lastSelectedDeckId: "",
				lastSelectedDeckNames: [],
			};
		}

		return {
			lastSelectedDeckId:
				typeof value.lastSelectedDeckId === "string" ? value.lastSelectedDeckId : "",
			lastSelectedDeckNames: Array.isArray(value.lastSelectedDeckNames)
				? value.lastSelectedDeckNames.filter(
						(name): name is string => typeof name === "string" && name.length > 0
				  )
				: [],
		};
	}

	private normalizeEpubBookshelfSettings(value: unknown): EpubBookshelfSettings {
		if (!isRecord(value)) {
			return {
				lastScanAt: 0,
			};
		}

		return {
			lastScanAt: typeof value.lastScanAt === "number" ? value.lastScanAt : 0,
		};
	}

	private normalizeEditorModalSizeState(value: unknown): EditorModalSizeState {
		if (!isRecord(value)) {
			return {
				preset: "large",
				customWidth: 800,
				customHeight: 600,
			};
		}

		const preset = value.preset;
		const normalized: EditorModalSizeState = {
			preset:
				preset === "small" ||
				preset === "medium" ||
				preset === "large" ||
				preset === "extra-large" ||
				preset === "custom"
					? preset
					: "large",
		};

		if (
			typeof value.customWidth === "number" &&
			Number.isFinite(value.customWidth) &&
			value.customWidth > 0
		) {
			normalized.customWidth = value.customWidth;
		}
		if (
			typeof value.customHeight === "number" &&
			Number.isFinite(value.customHeight) &&
			value.customHeight > 0
		) {
			normalized.customHeight = value.customHeight;
		}

		return normalized;
	}
}

export async function migrateLegacyPluginRuntimeState(
	host: LegacyPluginRuntimeHost
): Promise<void> {
	const legacyData = await loadPluginDataWithRecovery(host);
	const stateService = new PluginLocalStateService(host.app);
	let shouldSaveCleanedData = false;

	if (Object.prototype.hasOwnProperty.call(legacyData, "persistedStudySession")) {
		const currentSession = await stateService.loadPersistedStudySession();
		if (currentSession == null && legacyData.persistedStudySession != null) {
			await stateService.savePersistedStudySession(legacyData.persistedStudySession);
		}
		legacyData.persistedStudySession = undefined;
		shouldSaveCleanedData = true;
	}

	if (Object.prototype.hasOwnProperty.call(legacyData, "deckView")) {
		const currentDeckView = await stateService.loadDeckViewPreference();
		if (!currentDeckView && typeof legacyData.deckView === "string") {
			await stateService.saveDeckViewPreference(legacyData.deckView);
		}
		legacyData.deckView = undefined;
		shouldSaveCleanedData = true;
	}

	if (Object.prototype.hasOwnProperty.call(legacyData, "cardManagementViewPreferences")) {
		const currentPreferences = await stateService.loadCardManagementViewPreferences();
		if (currentPreferences == null && isRecord(legacyData.cardManagementViewPreferences)) {
			await stateService.saveCardManagementViewPreferences(
				legacyData.cardManagementViewPreferences as unknown as CardManagementViewPreferences
			);
		}
		legacyData.cardManagementViewPreferences = undefined;
		shouldSaveCleanedData = true;
	}

	if (Object.prototype.hasOwnProperty.call(legacyData, "studyInterfaceViewPreferences")) {
		const currentPreferences = await stateService.loadStudyInterfaceViewPreferences();
		if (currentPreferences == null && isRecord(legacyData.studyInterfaceViewPreferences)) {
			await stateService.saveStudyInterfaceViewPreferences(
				legacyData.studyInterfaceViewPreferences as unknown as StudyInterfaceViewPreferences
			);
		}
		legacyData.studyInterfaceViewPreferences = undefined;
		shouldSaveCleanedData = true;
	}

	if (Object.prototype.hasOwnProperty.call(legacyData, "createCardPreferences")) {
		const currentPreferences = await stateService.loadCreateCardPreferences();
		if (currentPreferences == null && isRecord(legacyData.createCardPreferences)) {
			await stateService.saveCreateCardPreferences(
				legacyData.createCardPreferences as unknown as CreateCardPreferencesState
			);
		}
		legacyData.createCardPreferences = undefined;
		shouldSaveCleanedData = true;
	}

	if (Object.prototype.hasOwnProperty.call(legacyData, "epubBookshelf")) {
		const currentSettings = await stateService.loadEpubBookshelfSettings();
		if (currentSettings == null && isRecord(legacyData.epubBookshelf)) {
			await stateService.saveEpubBookshelfSettings(
				legacyData.epubBookshelf as unknown as EpubBookshelfSettings
			);
		}
		legacyData.epubBookshelf = undefined;
		shouldSaveCleanedData = true;
	}

	if (isRecord(legacyData.editorModalSize)) {
		const currentState = await stateService.loadEditorModalSizeState();
		if (currentState == null) {
			await stateService.saveEditorModalSizeState(
				legacyData.editorModalSize as unknown as EditorModalSizeState
			);
		}

		let editorModalSizeCleaned = false;
		for (const field of ["preset", "customWidth", "customHeight"] as const) {
			if (Object.prototype.hasOwnProperty.call(legacyData.editorModalSize, field)) {
				delete legacyData.editorModalSize[field];
				editorModalSizeCleaned = true;
			}
		}

		if (Object.keys(legacyData.editorModalSize).length === 0) {
			legacyData.editorModalSize = undefined;
			editorModalSizeCleaned = true;
		}
		if (editorModalSizeCleaned) {
			shouldSaveCleanedData = true;
		}
	}

	if (isRecord(legacyData.aiConfig)) {
		const currentPreferences = await stateService.loadAIAssistantPreferences();
		const nextPreferences: AIAssistantLocalPreferences = {
			...(currentPreferences || {}),
		};
		let shouldSavePreferences = false;
		let aiConfigCleaned = false;

		if (
			!nextPreferences.lastUsedProvider &&
			typeof legacyData.aiConfig.lastUsedProvider === "string"
		) {
			nextPreferences.lastUsedProvider = legacyData.aiConfig.lastUsedProvider;
			shouldSavePreferences = true;
		}
		if (!nextPreferences.lastUsedModel && typeof legacyData.aiConfig.lastUsedModel === "string") {
			nextPreferences.lastUsedModel = legacyData.aiConfig.lastUsedModel;
			shouldSavePreferences = true;
		}
		if (
			nextPreferences.savedGenerationConfig == null &&
			isRecord(legacyData.aiConfig.savedGenerationConfig)
		) {
			nextPreferences.savedGenerationConfig = legacyData.aiConfig
				.savedGenerationConfig as unknown as AIAssistantSavedGenerationConfig;
			shouldSavePreferences = true;
		}
		if (shouldSavePreferences) {
			await stateService.saveAIAssistantPreferences(nextPreferences);
		}

		const currentHistory = await stateService.loadAIGenerationHistory();
		if (currentHistory == null && Array.isArray(legacyData.aiConfig.generationHistory)) {
			await stateService.saveAIGenerationHistory(
				legacyData.aiConfig.generationHistory as AIGenerationHistoryEntry[]
			);
		}

		for (const field of [
			"lastUsedProvider",
			"lastUsedModel",
			"savedGenerationConfig",
			"generationHistory",
		] as const) {
			if (Object.prototype.hasOwnProperty.call(legacyData.aiConfig, field)) {
				delete legacyData.aiConfig[field];
				aiConfigCleaned = true;
			}
		}

		if (Object.keys(legacyData.aiConfig).length === 0) {
			legacyData.aiConfig = undefined;
			aiConfigCleaned = true;
		}
		if (aiConfigCleaned) {
			shouldSaveCleanedData = true;
		}
	}

	if (
		isRecord(legacyData.incrementalReading) &&
		Object.prototype.hasOwnProperty.call(legacyData.incrementalReading, "calendarSidebar")
	) {
		const currentSettings = await stateService.loadIRCalendarSidebarSettings();
		if (currentSettings == null && isRecord(legacyData.incrementalReading.calendarSidebar)) {
			await stateService.saveIRCalendarSidebarSettings(
				legacyData.incrementalReading.calendarSidebar as unknown as IRCalendarSidebarSettings
			);
		}

		legacyData.incrementalReading.calendarSidebar = undefined;
		if (Object.keys(legacyData.incrementalReading).length === 0) {
			legacyData.incrementalReading = undefined;
		}
		shouldSaveCleanedData = true;
	}

	if (shouldSaveCleanedData) {
		await savePluginDataWithBackup(host, legacyData);
		logger.info("[PluginLocalState] 已将旧 data.json 运行态字段迁移到 state/");
	}
}
