import { Plugin, TFile } from "obsidian";
import { EpubSettingsTab } from "./components/settings/EpubSettingsTab";
import { isSupportedBookFile } from "./services/epub/book-format";
import { DEFAULT_EPUB_BOOKMARK_FOLDER, normalizeEpubBookmarkFolderPath } from "./services/epub";
import { PremiumFeatureGuard } from "./services/premium/PremiumFeatureGuard";
import {
	registerEpubHost,
	resolveEpubHost,
	unregisterEpubHost,
	type EpubHostCapabilities,
} from "./services/epub";
import {
	openEpubBookshelf,
	openEpubReader,
	registerEpubMarkdownPostProcessor,
	registerEpubProtocolHandler,
	registerEpubWorkspaceViews,
} from "./services/epub/epub-plugin-support";
import type { EffectiveLicenseState, LicenseInfo, LicenseStore, LicensedProduct } from "./types/license";
import { DEFAULT_LICENSE_INFO, DEFAULT_LICENSE_STORE } from "./types/license";
import { safeOpenSettings } from "./utils/obsidian-api-safe";
import { getLegacyPrimaryLicense, LICENSED_PRODUCTS, normalizeLicenseStore, resolveEffectiveLicenseState } from "./utils/license-state";

interface StandaloneEpubPluginSettings {
	license: LicenseInfo;
	licenseState: LicenseStore;
	bookmarkFolder: string;
}

const DEFAULT_STANDALONE_EPUB_SETTINGS: StandaloneEpubPluginSettings = {
	license: DEFAULT_LICENSE_INFO,
	licenseState: DEFAULT_LICENSE_STORE,
	bookmarkFolder: DEFAULT_EPUB_BOOKMARK_FOLDER,
};

export default class StandaloneEpubPlugin extends Plugin implements EpubHostCapabilities {
	private workspaceViewsRegistered = false;
	settings: StandaloneEpubPluginSettings = DEFAULT_STANDALONE_EPUB_SETTINGS;

	getLicensedProductId(): LicensedProduct {
		return LICENSED_PRODUCTS.EPUB;
	}

	getLocalLicenses(): LicenseInfo[] {
		return this.settings.licenseState?.localLicenses ?? [];
	}

	getInheritedLicenses(): LicenseInfo[] {
		return resolveEpubHost(this.app)?.getEpubInheritedLicenses?.() ?? [];
	}

	getEffectiveLicenseState(): EffectiveLicenseState {
		return resolveEffectiveLicenseState({
			product: this.getLicensedProductId(),
			localLicenses: this.getLocalLicenses(),
			inheritedLicenses: this.getInheritedLicenses(),
		});
	}

	hasEpubPremiumAccess(): boolean {
		return this.getEffectiveLicenseState().isPremiumActive;
	}

	openEpubPremiumSettings(): void {
		safeOpenSettings(this.app, this.manifest.id);
	}

	async refreshPremiumState(): Promise<void> {
		await PremiumFeatureGuard.getInstance().updateLicenseState({
			product: this.getLicensedProductId(),
			localLicenses: this.getLocalLicenses(),
			inheritedLicenses: this.getInheritedLicenses(),
		});
	}

	private syncLicenseSettings(): void {
		const normalizedStore = normalizeLicenseStore(this.settings.license, this.settings.licenseState);
		this.settings.licenseState = normalizedStore;
		this.settings.license = getLegacyPrimaryLicense(normalizedStore.localLicenses);
	}

	async loadSettings(): Promise<void> {
		const loadedData = await this.loadData();
		this.settings = {
			...DEFAULT_STANDALONE_EPUB_SETTINGS,
			...(loadedData ?? {}),
		};
		this.settings.bookmarkFolder =
			normalizeEpubBookmarkFolderPath(this.settings.bookmarkFolder) || DEFAULT_EPUB_BOOKMARK_FOLDER;
		this.syncLicenseSettings();
	}

	async saveSettings(): Promise<void> {
		this.syncLicenseSettings();
		this.settings.bookmarkFolder =
			normalizeEpubBookmarkFolderPath(this.settings.bookmarkFolder) || DEFAULT_EPUB_BOOKMARK_FOLDER;
		await this.saveData(this.settings);
		await this.refreshPremiumState();
	}

	private registerWorkspaceViews(): void {
		if (this.workspaceViewsRegistered) {
			return;
		}

		registerEpubWorkspaceViews(this, "[Standalone EPUB]", "独立 EPUB 插件");
		this.workspaceViewsRegistered = true;
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		registerEpubHost(this.app, this);
		this.addSettingTab(new EpubSettingsTab(this.app, this));
		await PremiumFeatureGuard.getInstance().initializeForProduct({
			product: this.getLicensedProductId(),
			localLicenses: this.getLocalLicenses(),
			inheritedLicenses: this.getInheritedLicenses(),
		});
		this.registerWorkspaceViews();
		registerEpubMarkdownPostProcessor(this, this.app);
		registerEpubProtocolHandler(this, this.app, "[Standalone EPUB Protocol]");
		this.addRibbonIcon("library", "打开 EPUB 书架", () => {
			void this.openEpubBookshelf();
		});

		this.addCommand({
			id: "open-epub-bookshelf",
			name: "打开书架",
			callback: () => {
				void this.openEpubBookshelf();
			},
		});
		this.addCommand({
			id: "open-active-epub-reader",
			name: "打开当前书籍",
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile();
				const canOpen = activeFile instanceof TFile && isSupportedBookFile(activeFile);
				if (!checking && canOpen) {
					void this.openEpubReader(activeFile.path);
				}
				return canOpen;
			},
		});
	}

	onunload(): void {
		unregisterEpubHost(this.app);
	}

	private async openEpubBookshelf(): Promise<void> {
		await openEpubBookshelf(this.app, "[Standalone EPUB]", "打开书架失败");
	}

	async openEpubReader(filePath: string): Promise<void> {
		await openEpubReader(
			this.app,
			filePath,
			"[Standalone EPUB]",
			"未找到对应的书籍文件",
			"打开书籍失败"
		);
	}
}
