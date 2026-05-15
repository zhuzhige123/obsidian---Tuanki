import type { App } from "obsidian";
import type { LicenseInfo } from "../../types/license";
import { getEpubRuntime } from "./epub-runtime";

export interface EpubHostCreateCardInput {
	initialContent: string;
}

export interface EpubHostReadingPointInput {
	filePath: string;
	selectedText: string;
	sourceLink?: string;
	successNotice?: string;
	initialTitle?: string;
}

export interface EpubHostScheduleChapterInput {
	filePath: string;
	title: string;
	tocHref: string;
	tocLevel: number;
	deckId?: string;
}

export interface EpubHostIncrementalReadingTopicOption {
	id: string;
	name: string;
}

export interface EpubHostMarkdownAsset {
	placeholder: string;
	suggestedName: string;
	data: Uint8Array;
	mimeType: string;
	originalHref?: string;
}

export interface EpubHostExportChapterInput {
	filePath: string;
	title: string;
	body: string;
	markdown?: string;
	assets?: EpubHostMarkdownAsset[];
	sourceLink?: string;
	bookTitle?: string;
	author?: string;
}

export interface EpubHostExportBookNotesInput {
	filePath: string;
	markdown: string;
	bookTitle?: string;
	sourceLink?: string;
}

export interface EpubHostSelectedTextAISplitMenuOptions {
	event: MouseEvent | KeyboardEvent;
	selectedText: string;
	onSelectAction: (actionId: string) => void;
}

export interface EpubHostResumePointInput {
	filePath: string;
	cfi: string;
	chapterHref?: string;
	chapterTitle?: string;
	deckId?: string;
}

export interface EpubHostSelectedTextAIPanelInput {
	filePath: string;
	selectedText: string;
	actionId: string;
	sourceLink?: string;
}

export interface EpubHostReaderCapabilities {
	openEpubReader?: (filePath: string) => Promise<void>;
	hasEpubPremiumAccess?: () => boolean;
	openEpubPremiumSettings?: () => void;
	getEpubInheritedLicenses?: () => LicenseInfo[];
}

export interface EpubHostIRCapabilities {
	openIRReadingPointFromExternalSelection?: (
		input: EpubHostReadingPointInput
	) => Promise<void>;
	getAvailableEpubIncrementalReadingTopics?: () => Promise<EpubHostIncrementalReadingTopicOption[]>;
	scheduleEpubChapterForIncrementalReading?: (
		input: EpubHostScheduleChapterInput
	) => Promise<void>;
	markEpubResumePointFromReader?: (input: EpubHostResumePointInput) => Promise<void>;
}

export interface EpubHostCardCapabilities {
	openCreateCardModal?: (input: EpubHostCreateCardInput) => Promise<void>;
	exportEpubChapterToMarkdown?: (input: EpubHostExportChapterInput) => Promise<void>;
	exportEpubBookNotesToMarkdown?: (input: EpubHostExportBookNotesInput) => Promise<void>;
	openSelectedTextAISplitMenu?: (options: EpubHostSelectedTextAISplitMenuOptions) => void;
	openSelectedTextAIPanelFromEpub?: (input: EpubHostSelectedTextAIPanelInput) => Promise<void>;
	closeSelectedTextAIPanelFromEpub?: (filePath: string) => Promise<void>;
	openCardBacklinkFromEpub?: (cardUuid: string) => Promise<void>;
}

export interface EpubHostCapabilities
	extends EpubHostReaderCapabilities,
		EpubHostIRCapabilities,
		EpubHostCardCapabilities {}

const registeredEpubHosts = new WeakMap<App, EpubHostCapabilities>();

export function registerEpubHost(app: App, host: EpubHostCapabilities): void {
	registeredEpubHosts.set(app, host);
}

export function unregisterEpubHost(app: App): void {
	registeredEpubHosts.delete(app);
}

function hasHostCapability(host: EpubHostCapabilities | null | undefined, key: PropertyKey): boolean {
	if (!host || (typeof key !== "string" && typeof key !== "symbol")) {
		return false;
	}
	return key in host && (host as Record<PropertyKey, unknown>)[key] !== undefined;
}

function resolveHostCapabilityValue(
	host: EpubHostCapabilities,
	key: PropertyKey
): unknown {
	const value = (host as Record<PropertyKey, unknown>)[key];
	return typeof value === "function" ? value.bind(host) : value;
}

function mergeEpubHosts(hosts: EpubHostCapabilities[]): EpubHostCapabilities {
	return new Proxy({} as EpubHostCapabilities, {
		get(_target, key) {
			for (let index = hosts.length - 1; index >= 0; index -= 1) {
				const host = hosts[index];
				if (hasHostCapability(host, key)) {
					return resolveHostCapabilityValue(host, key);
				}
			}
			return undefined;
		},
		has(_target, key) {
			return hosts.some((host) => hasHostCapability(host, key));
		},
		ownKeys() {
			const keys = new Set<string | symbol>();
			for (const host of hosts) {
				for (const key of Reflect.ownKeys(host)) {
					if (typeof key !== "string" && typeof key !== "symbol") {
						continue;
					}
					if (hasHostCapability(host, key)) {
						keys.add(key);
					}
				}
			}
			return Array.from(keys);
		},
		getOwnPropertyDescriptor(_target, key) {
			if (!hosts.some((host) => hasHostCapability(host, key))) {
				return undefined;
			}
			return {
				configurable: true,
				enumerable: true,
				writable: false,
				value: undefined,
			};
		},
	});
}

function resolveCollaboratorHosts(app: App): EpubHostCapabilities[] {
	const runtime = getEpubRuntime();
	return runtime.collaboratorHostPluginIds
		.map((pluginId) => (app as any)?.plugins?.getPlugin?.(pluginId))
		.filter((plugin): plugin is EpubHostCapabilities => Boolean(plugin && typeof plugin === "object"));
}

function resolveTypedEpubHost<TCapability extends object>(app: App): TCapability | null {
	const host = resolveEpubHost(app);
	return host as TCapability | null;
}

export function resolveEpubHost(app: App): EpubHostCapabilities | null {
	const localHost = registeredEpubHosts.get(app) ?? null;
	const collaboratorHosts = resolveCollaboratorHosts(app);
	const collaboratorHost = collaboratorHosts.length > 0 ? mergeEpubHosts(collaboratorHosts) : null;

	if (!localHost && !collaboratorHost) {
		const runtime = getEpubRuntime();
		const plugin = (app as any)?.plugins?.getPlugin?.(runtime.pluginId);
		if (!plugin || typeof plugin !== "object") {
			return null;
		}

		return plugin as EpubHostCapabilities;
	}

	if (localHost && collaboratorHost) {
		return mergeEpubHosts([collaboratorHost, localHost]);
	}

	return localHost ?? collaboratorHost;
}

export function resolveEpubReaderHost(app: App): EpubHostReaderCapabilities | null {
	return resolveTypedEpubHost<EpubHostReaderCapabilities>(app);
}

export function resolveEpubIRHost(app: App): EpubHostIRCapabilities | null {
	return resolveTypedEpubHost<EpubHostIRCapabilities>(app);
}

export function resolveEpubCardHost(app: App): EpubHostCardCapabilities | null {
	return resolveTypedEpubHost<EpubHostCardCapabilities>(app);
}
