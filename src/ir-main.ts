import {
	App,
	MarkdownView,
	Notice,
	Plugin,
	TFile,
	WorkspaceLeaf,
	normalizePath,
} from "obsidian";
import { resolveIRImportFolder } from "./config/paths";
import { SelectionToIRModal, type SelectionToIRSubmitPayload } from "./modals/SelectionToIRModal";
import { registerExtensionsSafely } from "./services/epub/epub-plugin-support";
import {
	registerEpubHost,
	unregisterEpubHost,
	type EpubHostIRCapabilities,
	type EpubHostIncrementalReadingTopicOption,
	type EpubHostReaderCapabilities,
} from "./services/epub/epub-host";
import {
	IRHostSharedService,
	type IREnsureExternalDocumentChunkScheduledOptions,
} from "./services/incremental-reading/IRHostSharedService";
import { IR_RUNTIME } from "./services/incremental-reading/ir-runtime";
import { revealLeaf } from "./utils/workspace-navigation";
import {
	generateUniqueVaultFilePath,
	resolveIRReadableMarkdownTargetFolder,
} from "./services/incremental-reading/IRReadableMarkdownPathResolver";
import { recomputeAndBroadcastIRData } from "./services/incremental-reading/IRScheduleRefreshService";
import { IRStorageService } from "./services/incremental-reading/IRStorageService";
import { replaceSelectionInMarkdownContent } from "./services/incremental-reading/SelectionQuickCreateSourceTransform";
import { PremiumFeatureGuard, PREMIUM_FEATURES } from "./services/premium/PremiumFeatureGuard";
import { createDefaultIRDeck } from "./types/ir-types";
import type {
	IncrementalReadingFolderSubscriptionSettings,
	IncrementalReadingSettings,
	IRCalendarSidebarSettings,
} from "./types/plugin-settings.d";
import { markServiceReady } from "./utils/service-ready-event";
import { initI18n, syncI18nWithObsidianLanguage } from "./utils/i18n";
import { logger } from "./utils/logger";
import { createContentWithMetadata } from "./utils/yaml-utils";
import { IRCalendarView, VIEW_TYPE_IR_CALENDAR } from "./views/IRCalendarView";
import { IRDeckView, VIEW_TYPE_IRDECK } from "./views/IRDeckView";
import { IRFocusView, VIEW_TYPE_IR_FOCUS } from "./views/IRFocusView";
import { StandaloneIRSettingsTab } from "./components/settings/StandaloneIRSettingsTab";
import {
	buildDefaultIncrementalReadingSettings,
	DEFAULT_IR_CALENDAR_SIDEBAR_SETTINGS,
	normalizeIRCalendarSidebarSettings,
	normalizeIncrementalReadingSettings,
} from "./services/incremental-reading/ir-settings";

type StandaloneIRSettings = {
	weaveParentFolder: string;
	incrementalReading: IncrementalReadingSettings;
};

type IRQuickCreateSelectionRange = {
	from: { line: number; ch: number };
	to: { line: number; ch: number };
};

type IRQuickCreateContext = {
	file: TFile;
	editor: MarkdownView["editor"] | null;
	selectedText: string;
	selectionRange: IRQuickCreateSelectionRange | null;
	sourceLink?: string;
	replaceSourceSelection?: boolean;
	successNotice?: string;
	initialTitle?: string;
};

const DEFAULT_INCREMENTAL_READING_SETTINGS: IncrementalReadingSettings =
	buildDefaultIncrementalReadingSettings("");

const DEFAULT_STANDALONE_IR_SETTINGS: StandaloneIRSettings = {
	weaveParentFolder: "",
	incrementalReading: DEFAULT_INCREMENTAL_READING_SETTINGS,
};

const DEFAULT_DECK_NAME = "默认专题";

export default class StandaloneIncrementalReadingPlugin
	extends Plugin
	implements EpubHostIRCapabilities, EpubHostReaderCapabilities
{
	settings: StandaloneIRSettings = { ...DEFAULT_STANDALONE_IR_SETTINGS };
	dataStorage: Record<string, never> | null = null;

	private workspaceViewsRegistered = false;
	private irCalendarSidebarSettingsCache: IRCalendarSidebarSettings | null = null;
	private irHostSharedService: IRHostSharedService | null = null;

	async onload(): Promise<void> {
		initI18n();
		this.registerInterval(
			window.setInterval(() => {
				try {
					syncI18nWithObsidianLanguage();
				} catch {}
			}, 1000)
		);

		await this.loadSettings();
		this.dataStorage = {};
		markServiceReady("dataStorage");
		markServiceReady("allCoreServices");

		registerEpubHost(this.app, this);
		await PremiumFeatureGuard.getInstance().initializeForProduct({
			product: "weave",
		});
		this.addSettingTab(new StandaloneIRSettingsTab(this.app, this));
		this.registerWorkspaceViews();
		await this.ensureDefaultIRDeckExists();

		this.addRibbonIcon("calendar", "打开增量阅读日历", () => {
			void this.activateIRCalendarView();
		});

		this.addCommand({
			id: "open-ir-calendar",
			name: "打开增量阅读日历",
			callback: () => {
				void this.activateIRCalendarView();
			},
		});

		this.addCommand({
			id: "open-active-irdeck",
			name: "打开当前 IRDeck",
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile();
				const canOpen = activeFile instanceof TFile && activeFile.extension === "irdeck";
				if (!checking && canOpen) {
					void this.openIRDeckCalendar(activeFile.path);
				}
				return canOpen;
			},
		});

		this.addCommand({
			id: "create-ir-reading-point-from-selection",
			name: "从当前选区创建增量阅读点",
			callback: () => {
				void this.runSelectionToIRQuickCreate(this.getSelectionContextForIRQuickCreate());
			},
		});
	}

	onunload(): void {
		unregisterEpubHost(this.app);
	}

	private registerWorkspaceViews(): void {
		if (this.workspaceViewsRegistered) {
			return;
		}

		this.registerView(VIEW_TYPE_IR_CALENDAR, (leaf) => new IRCalendarView(leaf, this as any));
		this.registerView(VIEW_TYPE_IRDECK, (leaf) => new IRDeckView(leaf, this as any));
		this.registerView(VIEW_TYPE_IR_FOCUS, (leaf) => new IRFocusView(leaf, this as any));
		registerExtensionsSafely(
			this,
			this.app,
			["irdeck"],
			VIEW_TYPE_IRDECK,
			"[Standalone IR]",
			"Weave Incremental Reading "
		);
		this.workspaceViewsRegistered = true;
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<StandaloneIRSettings> | null;
		this.settings = this.normalizeSettings({
			...DEFAULT_STANDALONE_IR_SETTINGS,
			...(loaded ?? {}),
		});
		this.irCalendarSidebarSettingsCache = this.normalizeIRCalendarSidebarSettings(
			this.settings.incrementalReading.calendarSidebar
		);
	}

	async saveSettings(): Promise<void> {
		this.settings = this.normalizeSettings(this.settings);
		this.irCalendarSidebarSettingsCache = this.normalizeIRCalendarSidebarSettings(
			this.settings.incrementalReading.calendarSidebar
		);
		await this.saveData(this.settings);
	}

	getIncrementalReadingSettings(): IncrementalReadingSettings {
		this.settings = this.normalizeSettings(this.settings);
		return this.settings.incrementalReading;
	}

	async saveIncrementalReadingSettings(
		settings: IncrementalReadingSettings
	): Promise<IncrementalReadingSettings> {
		this.settings.incrementalReading = normalizeIncrementalReadingSettings(
			settings,
			this.settings.weaveParentFolder
		);
		await this.saveSettings();
		return this.settings.incrementalReading;
	}

	getIRCalendarSidebarSettings(): IRCalendarSidebarSettings {
		if (!this.irCalendarSidebarSettingsCache) {
			this.irCalendarSidebarSettingsCache = this.normalizeIRCalendarSidebarSettings(
				this.settings.incrementalReading.calendarSidebar
			);
		}

		return {
			...this.irCalendarSidebarSettingsCache,
			backgroundWall: {
				...this.irCalendarSidebarSettingsCache.backgroundWall,
			},
		};
	}

	async saveIRCalendarSidebarSettings(settings: Partial<IRCalendarSidebarSettings>): Promise<void> {
		const current = this.getIRCalendarSidebarSettings();
		const next = this.normalizeIRCalendarSidebarSettings({
			...current,
			...settings,
			backgroundWall: {
				...(current.backgroundWall ?? {}),
				...(settings.backgroundWall ?? {}),
			},
		});
		this.irCalendarSidebarSettingsCache = next;
		this.settings.incrementalReading.calendarSidebar = next;
		await this.saveSettings();
	}

	async activateIRCalendarView(options: {
		preferredLeaf?: WorkspaceLeaf;
		state?: Record<string, unknown>;
	} = {}): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_IR_CALENDAR)[0] || null;
		if (!leaf) {
			leaf = workspace.getLeftLeaf(false) ?? workspace.getLeftLeaf(true);
		}
		if (!leaf) {
			throw new Error("ir-calendar-leaf-unavailable");
		}

		await leaf.setViewState({
			type: VIEW_TYPE_IR_CALENDAR,
			active: true,
			...(options.state ? { state: options.state } : {}),
		});
		if (options.preferredLeaf && options.preferredLeaf !== leaf) {
			options.preferredLeaf.detach();
		}

		try {
			const workspaceAny = workspace as any;
			if (typeof workspaceAny.setActiveLeaf === "function") {
				try {
					workspaceAny.setActiveLeaf(leaf, { focus: true });
				} catch {
					workspaceAny.setActiveLeaf(leaf, true);
				}
			}
		} catch {}

		revealLeaf(this.app, leaf);
	}

	async openIRDeckCalendar(filePath: string, preferredLeaf?: WorkspaceLeaf): Promise<void> {
		const normalizedPath = normalizePath(String(filePath || "").trim());
		if (!normalizedPath) {
			throw new Error("irdeck-path-empty");
		}

		let focusDeckId = "";
		let focusDeckName = normalizedPath.split("/").pop()?.replace(/\.irdeck$/i, "") || "";
		try {
			const pointReadService = await import("./services/incremental-reading/IRPointDataReadService");
			const entry = await new pointReadService.IRPointDataReadService(this.app).getPointFileEntryByPath(
				normalizedPath
			);
			focusDeckId = String(entry?.topicId || "").trim();
			focusDeckName = String(entry?.topicName || "").trim() || focusDeckName;
		} catch (error) {
			logger.warn("[Standalone IR] 解析 IRDeck 失败，将回退到通用日历:", error);
		}

		await this.activateIRCalendarView({
			preferredLeaf,
			state: {
				filePath: normalizedPath,
				focusDeckId,
				focusDeckName,
			},
		});
	}

	async redirectIncrementalReadingToSidebar(options?: {
		deckPath?: string;
		deckName?: string;
		closeLegacyFocusLeaves?: boolean;
	}): Promise<void> {
		await this.activateIRCalendarView();
		if (options?.closeLegacyFocusLeaves) {
			this.app.workspace.detachLeavesOfType(VIEW_TYPE_IR_FOCUS);
		}
	}

	async openEpubReader(filePath: string): Promise<void> {
		const host = this.getExternalEpubHost();
		if (!host?.openEpubReader) {
			new Notice("未找到可协作的 EPUB 阅读器插件", 3000);
			return;
		}
		await host.openEpubReader(filePath);
	}

	async getAvailableEpubIncrementalReadingTopics(): Promise<EpubHostIncrementalReadingTopicOption[]> {
		return await this.getIRHostSharedService().getAvailableEpubIncrementalReadingTopics();
	}

	async scheduleEpubChapterForIncrementalReading(options: {
		filePath: string;
		title: string;
		tocHref: string;
		tocLevel: number;
		deckId?: string;
	}): Promise<void> {
		await this.getIRHostSharedService().scheduleEpubChapterForIncrementalReading(
			options,
			this.resolveIRDeckById.bind(this),
			this.pickIRDeck.bind(this)
		);
	}

	async markEpubResumePointFromReader(options: {
		filePath: string;
		cfi: string;
		chapterHref?: string;
		chapterTitle?: string;
		deckId?: string;
	}): Promise<void> {
		await this.getIRHostSharedService().markEpubResumePointFromReader(
			options,
			this.resolveIRDeckById.bind(this)
		);
	}

	async openIRReadingPointFromExternalSelection(options: {
		filePath: string;
		selectedText: string;
		sourceLink?: string;
		successNotice?: string;
		initialTitle?: string;
	}): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(String(options.filePath || "").trim());
		if (!(file instanceof TFile)) {
			new Notice("未找到对应的源文件，无法创建阅读点", 3000);
			return;
		}

		const selectedText = String(options.selectedText || "").trim();
		if (!selectedText) {
			new Notice("请先选中文本后再创建阅读点", 3000);
			return;
		}

		await this.runSelectionToIRQuickCreate({
			file,
			editor: null,
			selectedText,
			selectionRange: null,
			sourceLink: String(options.sourceLink || "").trim() || undefined,
			replaceSourceSelection: false,
			successNotice: options.successNotice,
			initialTitle: String(options.initialTitle || "").trim() || undefined,
		});
	}

	normalizeSelectionQuickCreateFolderPath(folderPath: string): string {
		const raw = String(folderPath || "").trim();
		if (!raw || raw === "/" || raw === ".") {
			return "";
		}
		return normalizePath(raw);
	}

	normalizeImportFolder(folderPath?: string | null): string {
		return resolveIRImportFolder(String(folderPath || "").trim(), this.settings.weaveParentFolder);
	}

	private getIRHostSharedService(): IRHostSharedService {
		if (!this.irHostSharedService) {
			this.irHostSharedService = new IRHostSharedService(this.app);
		}
		return this.irHostSharedService;
	}

	private normalizeSettings(
		input: Partial<StandaloneIRSettings> | StandaloneIRSettings
	): StandaloneIRSettings {
		const weaveParentFolder = String(input.weaveParentFolder || "").trim();
		return {
			weaveParentFolder,
			incrementalReading: normalizeIncrementalReadingSettings(
				input.incrementalReading ?? DEFAULT_INCREMENTAL_READING_SETTINGS,
				weaveParentFolder
			),
		};
	}

	private normalizeIRCalendarSidebarSettings(
		settings?: Partial<IRCalendarSidebarSettings> | null
	): IRCalendarSidebarSettings {
		return normalizeIRCalendarSidebarSettings(settings);
	}

	private async ensureDefaultIRDeckExists(): Promise<void> {
		const storage = new IRStorageService(this.app);
		await storage.initialize();
		const decks = Object.values(await storage.getAllDecks()).filter((deck) => !deck.archivedAt);
		if (decks.length > 0) {
			return;
		}

		const deck = createDefaultIRDeck(DEFAULT_DECK_NAME);
		deck.path = deck.id;
		await storage.saveDeck(deck);
		logger.info("[Standalone IR] 已创建默认专题", { deckId: deck.id, name: deck.name });
	}

	private getExternalEpubHost(): EpubHostReaderCapabilities | null {
		const plugins = (this.app as any)?.plugins;
		for (const pluginId of IR_RUNTIME.collaboratorHostPluginIds) {
			const plugin = plugins?.getPlugin?.(pluginId);
			if (plugin && plugin !== this && typeof plugin.openEpubReader === "function") {
				return plugin as EpubHostReaderCapabilities;
			}
		}
		return null;
	}

	private async resolveIRDeckById(deckId: string): Promise<{ id: string; name: string } | null> {
		return await this.getIRHostSharedService().resolveIRDeckById(deckId);
	}

	private async getIRDeckIdentifiers(deck: { id: string; path?: string }): Promise<string[]> {
		return await this.getIRHostSharedService().getIRDeckIdentifiers(deck);
	}

	private normalizeEpubBookmarkHref(href: string): string {
		return this.getIRHostSharedService().normalizeEpubBookmarkHref(href);
	}

	private async pickIRDeck(): Promise<{ id: string; name: string } | null> {
		return await this.getIRHostSharedService().pickIRDeck();
	}

	private getSelectionContextForIRQuickCreate(): IRQuickCreateContext | null {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const activeFile = activeView?.file ?? this.app.workspace.getActiveFile();
		if (!(activeFile instanceof TFile) || activeFile.extension !== "md") {
			return null;
		}

		const editor = activeView?.editor ?? null;
		let selectedText = editor?.getSelection() ?? "";
		let selectionRange: IRQuickCreateSelectionRange | null = null;

		if (editor && selectedText.trim()) {
			selectionRange = {
				from: editor.getCursor("from"),
				to: editor.getCursor("to"),
			};
		}

		if ((!selectedText || !selectedText.trim()) && editor) {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			if (line?.trim()) {
				selectedText = line.trim();
				selectionRange = {
					from: { line: cursor.line, ch: 0 },
					to: { line: cursor.line, ch: line.length },
				};
				editor.setSelection(selectionRange.from, selectionRange.to);
			}
		}

		if (!selectedText || !selectedText.trim()) {
			const windowSelection = window.getSelection()?.toString()?.trim() || "";
			if (!windowSelection) {
				return null;
			}
			selectedText = windowSelection;
			selectionRange = null;
		}

		return {
			file: activeFile,
			editor,
			selectedText: selectedText.trim(),
			selectionRange,
			replaceSourceSelection: true,
		};
	}

	private async runSelectionToIRQuickCreate(context: IRQuickCreateContext | null): Promise<void> {
		if (!context) {
			new Notice("请先在 Markdown 文档中选中文本，或将光标放在有内容的行", 3000);
			return;
		}

		try {
			const preferredTitle = this.cleanIRReadingPointTitle(String(context.initialTitle || ""));
			const draft = preferredTitle
				? { title: preferredTitle, titleDetected: true }
				: this.deriveIRReadingPointDraftFromSelection(context.selectedText);
			const folderConfig = this.getSelectionQuickCreateFolderConfig(context.file.path);
			const storage = new IRStorageService(this.app);
			await storage.initialize();
			const deckOptions = Object.values(await storage.getAllDecks())
				.filter((deck) => !deck.archivedAt)
				.sort((left, right) => left.name.localeCompare(right.name))
				.map((deck) => ({ id: deck.id, name: deck.name }));
			if (deckOptions.length === 0) {
				new Notice("暂无可用增量阅读专题", 3000);
				return;
			}
			const preferredDeck = await this.resolvePreferredIRDeckForSelectionSource(context.file);

			new SelectionToIRModal(this.app, {
				deckOptions,
				initialDeckId: preferredDeck?.id,
				initialTitle: draft.title,
				initialFolder: folderConfig.initialFolder,
				titleDetected: draft.titleDetected,
				onPreferenceChange: async (update) => {
					await this.saveSelectionQuickCreatePreferences(update);
				},
				onSubmit: async (payload) => {
					await this.createIRReadingPointFromSelection(context, payload);
				},
			}).open();
		} catch (error) {
			logger.error("[Standalone IR] 打开阅读点创建窗口失败:", error);
			new Notice("打开阅读点创建窗口失败，请重试", 3000);
		}
	}

	private cleanIRReadingPointTitle(rawTitle: string): string {
		return this.getIRHostSharedService().cleanIRReadingPointTitle(rawTitle);
	}

	private deriveIRReadingPointDraftFromSelection(selectedText: string): {
		title: string;
		titleDetected: boolean;
	} {
		return this.getIRHostSharedService().deriveIRReadingPointDraftFromSelection(selectedText);
	}

	private getSelectionQuickCreateFolderConfig(contextPath?: string): { initialFolder: string } {
		return this.getIRHostSharedService().getSelectionQuickCreateFolderConfig(
			this.getIncrementalReadingSettings(),
			contextPath
		);
	}

	private async saveSelectionQuickCreatePreferences(update: {
		folderPath?: string;
	}): Promise<void> {
		this.settings.incrementalReading = {
			...this.settings.incrementalReading,
			...this.getIRHostSharedService().getUpdatedSelectionQuickCreatePreferences(
				this.settings.incrementalReading,
				update
			),
		};
		await this.saveSettings();
	}

	private buildIRReadingPointContent(title: string, body: string, options?: { sourceLink?: string }): string {
		const safeTitle = this.cleanIRReadingPointTitle(title) || "未命名阅读点";
		const normalizedBody = String(body || "").replace(/\r\n?/g, "\n").trim();
		const markdownBody = normalizedBody ? `# ${safeTitle}\n\n${normalizedBody}\n` : `# ${safeTitle}\n`;
		const sourceLink = String(options?.sourceLink || "").trim();
		return sourceLink ? createContentWithMetadata({ we_source: sourceLink }, markdownBody) : markdownBody;
	}

	private async ensureSelectionQuickCreateFolderExists(folderPath: string): Promise<void> {
		const normalizedFolder = this.normalizeSelectionQuickCreateFolderPath(folderPath) || "/";
		if (normalizedFolder === "/") {
			return;
		}
		const segments = normalizedFolder.split("/").filter(Boolean);
		let currentPath = "";
		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			if (!this.app.vault.getAbstractFileByPath(currentPath)) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}

	private sanitizeIRReadingPointFileName(title: string): string {
		const cleaned = this.cleanIRReadingPointTitle(title)
			.replace(/[\\/:*?"<>|]/g, "_")
			.replace(/\.+$/g, "")
			.trim();
		const truncated = cleaned.length > 120 ? cleaned.slice(0, 120).trim() : cleaned;
		return truncated || `阅读点-${Date.now()}`;
	}

	private async generateUniqueIRReadingPointPath(folderPath: string, title: string): Promise<string> {
		const normalizedFolder = this.normalizeSelectionQuickCreateFolderPath(folderPath) || "/";
		const baseName = this.sanitizeIRReadingPointFileName(title);
		return await generateUniqueVaultFilePath(this.app, normalizedFolder, `${baseName}.md`);
	}

	private async resolvePreferredIRDeckForSelectionSource(
		file: TFile
	): Promise<{ id: string; name: string } | null> {
		const frontmatter =
			(this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined) ?? {};
		const yamlTopicId =
			typeof frontmatter["weave-reading-topic-id"] === "string"
				? String(frontmatter["weave-reading-topic-id"]).trim()
				: "";
		const yamlLegacyDeckId =
			typeof frontmatter["weave-reading-ir-deck-id"] === "string"
				? String(frontmatter["weave-reading-ir-deck-id"]).trim()
				: "";
		const deckId = yamlTopicId || yamlLegacyDeckId;
		if (!deckId) {
			return null;
		}
		return await this.resolveIRDeckById(deckId);
	}

	private getIRReadingPointWikiLinkTarget(file: TFile): string {
		return file.path.replace(/\.md$/i, "");
	}

	private async updateSourceDocumentAfterIRQuickCreate(
		file: TFile,
		link: string,
		selectionRange: IRQuickCreateSelectionRange | null,
		editor: MarkdownView["editor"] | null
	): Promise<boolean> {
		if (!selectionRange) {
			return false;
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (editor && activeView?.editor === editor && activeView.file?.path === file.path) {
			editor.replaceRange(link, selectionRange.from, selectionRange.to);
			return true;
		}

		const currentContent = await this.app.vault.cachedRead(file);
		const updatedContent = replaceSelectionInMarkdownContent(currentContent, selectionRange, link);
		if (updatedContent !== currentContent) {
			await this.app.vault.modify(file, updatedContent);
		}
		return true;
	}

	private async createIRReadingPointFromSelection(
		context: IRQuickCreateContext,
		payload: SelectionToIRSubmitPayload
	): Promise<void> {
		const title = this.cleanIRReadingPointTitle(payload.title);
		if (!title) {
			new Notice("请输入阅读点标题", 3000);
			throw new Error("selection-ir-missing-title");
		}

		const deckId = String(payload.deckId || "").trim();
		if (!deckId) {
			new Notice("请选择增量阅读专题", 3000);
			throw new Error("selection-ir-missing-deck");
		}

		const storage = new IRStorageService(this.app);
		await storage.initialize();
		const rawDeck = await storage.getDeck(deckId);
		if (!rawDeck || rawDeck.archivedAt) {
			new Notice("所选专题不存在或已归档", 3000);
			throw new Error("selection-ir-deck-missing");
		}

		const deck = {
			id: deckId,
			name: String(rawDeck.name || "").trim() || "增量阅读",
		};
		const folderPath =
			this.normalizeSelectionQuickCreateFolderPath(
				payload.folderPath ||
					resolveIRReadableMarkdownTargetFolder(this.app, {
						lastSelectedFolder: this.getIncrementalReadingSettings().selectionQuickCreateLastFolder,
						contextPath: context.file.path,
						allowActiveFileFallback: true,
					})
			) || "/";
		const body = String(context.selectedText || "").replace(/\r\n?/g, "\n").trim();
		const fileContent = this.buildIRReadingPointContent(title, body, {
			sourceLink: context.sourceLink,
		});
		let createdFile: TFile | null = null;

		try {
			await this.ensureSelectionQuickCreateFolderExists(folderPath);
			const targetPath = await this.generateUniqueIRReadingPointPath(folderPath, title);
			createdFile = await this.app.vault.create(targetPath, fileContent);

			await this.ensureExternalDocumentChunkScheduled(createdFile, deck.id, deck.name);

			const shouldReplaceSourceSelection = context.replaceSourceSelection !== false;
			const createdLink = `[[${this.getIRReadingPointWikiLinkTarget(createdFile)}]]`;
			const sourceUpdated = shouldReplaceSourceSelection
				? await this.updateSourceDocumentAfterIRQuickCreate(
						context.file,
						createdLink,
						context.selectionRange,
						context.editor
				  )
				: false;

			await recomputeAndBroadcastIRData(this.app, "import_materials", {
				deckIds: [deck.id],
			});

			const successNotice = String(context.successNotice || "").trim();
			if (successNotice) {
				new Notice(successNotice, 3500);
			} else if (shouldReplaceSourceSelection) {
				new Notice(
					sourceUpdated ? "阅读点已创建，并已替换源文档选区" : "阅读点已创建，但未能自动替换源文档选区",
					3500
				);
			} else {
				new Notice("阅读点已创建", 2500);
			}
		} catch (error) {
			logger.error("[Standalone IR] 创建阅读点失败:", error);
			if (createdFile) {
				new Notice("阅读点文件已创建，但加入增量阅读失败，请检查控制台日志", 4500);
				return;
			}
			new Notice("创建阅读点失败，请重试", 3000);
			throw error;
		}
	}

	private getIncrementalReadingTodayStart(): Date {
		return this.getIRHostSharedService().getIncrementalReadingTodayStart();
	}

	private getIncrementalReadingDateKey(date: Date): string {
		return this.getIRHostSharedService().getIncrementalReadingDateKey(date);
	}

	private async ensureExternalDocumentChunkScheduled(
		file: TFile,
		deckId: string,
		deckName: string,
		options?: IREnsureExternalDocumentChunkScheduledOptions
	): Promise<boolean> {
		return await this.getIRHostSharedService().ensureExternalDocumentChunkScheduled(
			file,
			deckId,
			deckName,
			options
		);
	}
}
