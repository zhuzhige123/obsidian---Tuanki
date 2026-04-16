import { normalizePath, TFile, type App } from "obsidian";
import type { IRChunkFileData, IRTagGroup } from "../../types/ir-types";
import { createYAMLFrontmatterManager } from "../../utils/yaml-frontmatter-utils";
import { IREpubBookmarkTaskService, type IREpubBookmarkTask } from "./IREpubBookmarkTaskService";
import { IRPdfBookmarkTaskService, type IRPdfBookmarkTask } from "./IRPdfBookmarkTaskService";
import { IRStorageService } from "./IRStorageService";
import { IRTagGroupService, matchTagGroupByTags } from "./IRTagGroupService";

export const READING_POINT_TAGS_YAML_KEY = "weave_tags";

export function normalizeReadingPointTags(tags: string[]): string[] {
	const ordered = new Map<string, string>();
	for (const rawTag of Array.isArray(tags) ? tags : []) {
		const label = String(rawTag || "").trim();
		const key = label.toLowerCase();
		if (!key || ordered.has(key)) continue;
		ordered.set(key, label);
	}
	return Array.from(ordered.values());
}

function readFrontmatterTags(frontmatter: Record<string, unknown> | null | undefined): string[] {
	if (!frontmatter) return [];
	const rawValue = frontmatter[READING_POINT_TAGS_YAML_KEY];
	if (Array.isArray(rawValue)) {
		return normalizeReadingPointTags(rawValue.map((tag) => String(tag)));
	}
	if (typeof rawValue === "string") {
		return normalizeReadingPointTags(
			rawValue
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean)
		);
	}
	return [];
}

export class IRPointTagService {
	private readonly storage: IRStorageService;
	private readonly pdfService: IRPdfBookmarkTaskService;
	private readonly epubService: IREpubBookmarkTaskService;
	private readonly tagGroupService: IRTagGroupService;
	private readonly yamlManager: ReturnType<typeof createYAMLFrontmatterManager>;

	constructor(private readonly app: App) {
		this.storage = new IRStorageService(app);
		this.pdfService = new IRPdfBookmarkTaskService(app);
		this.epubService = new IREpubBookmarkTaskService(app);
		this.tagGroupService = new IRTagGroupService(app);
		this.yamlManager = createYAMLFrontmatterManager(app);
	}

	async initialize(): Promise<void> {
		await Promise.all([
			this.storage.initialize(),
			this.pdfService.initialize(),
			this.epubService.initialize(),
			this.tagGroupService.initialize(),
		]);
	}

	async readMarkdownReadingTags(filePath: string): Promise<string[]> {
		const normalizedPath = normalizePath(String(filePath || "").trim());
		if (!normalizedPath.toLowerCase().endsWith(".md")) {
			return [];
		}
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(file instanceof TFile)) {
			return [];
		}
		const cache = this.app.metadataCache.getFileCache(file);
		return readFrontmatterTags((cache?.frontmatter as Record<string, unknown> | undefined) || {});
	}

	async writeMarkdownReadingTags(filePath: string, tags: string[]): Promise<string[]> {
		const normalizedPath = normalizePath(String(filePath || "").trim());
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(file instanceof TFile)) {
			throw new Error(`Markdown file not found: ${normalizedPath}`);
		}

		const normalizedTags = normalizeReadingPointTags(tags);
		await this.yamlManager.updateReadingFields(file, {
			weave_tags: normalizedTags,
		});
		return normalizedTags;
	}

	async getChunkTags(chunk: IRChunkFileData): Promise<string[]> {
		const filePath = normalizePath(String(chunk?.filePath || "").trim());
		if (filePath.toLowerCase().endsWith(".md")) {
			const markdownTags = await this.readMarkdownReadingTags(filePath);
			if (markdownTags.length > 0) {
				return markdownTags;
			}
		}
		return normalizeReadingPointTags(((chunk as { tags?: string[] }).tags || []).map((tag) => String(tag)));
	}

	async saveChunkTags(chunkId: string, tags: string[]): Promise<IRChunkFileData | null> {
		await this.initialize();
		const chunk = await this.storage.getChunkData(chunkId);
		if (!chunk) return null;

		const normalizedTags = normalizeReadingPointTags(tags);
		const filePath = normalizePath(String(chunk.filePath || "").trim());
		if (filePath.toLowerCase().endsWith(".md")) {
			await this.writeMarkdownReadingTags(filePath, normalizedTags);
		}

		const nextGroupId = await this.matchGroupForTags(normalizedTags);
		const updatedChunk = {
			...chunk,
			tags: normalizedTags,
			meta: {
				...chunk.meta,
				tagGroup: nextGroupId,
			},
			updatedAt: Date.now(),
		};
		await this.storage.saveChunkData(updatedChunk as IRChunkFileData);
		return updatedChunk as IRChunkFileData & { tags?: string[] };
	}

	async savePdfTaskTags(taskId: string, tags: string[]): Promise<IRPdfBookmarkTask | null> {
		await this.initialize();
		const task = await this.pdfService.getTask(taskId);
		if (!task) return null;
		const normalizedTags = normalizeReadingPointTags(tags);
		const nextGroupId = await this.matchGroupForTags(normalizedTags);
		return await this.pdfService.updateTask(taskId, {
			tags: normalizedTags,
			meta: {
				...task.meta,
				tagGroup: nextGroupId,
			},
		});
	}

	async saveEpubTaskTags(taskId: string, tags: string[]): Promise<IREpubBookmarkTask | null> {
		await this.initialize();
		const task = await this.epubService.getTask(taskId);
		if (!task) return null;
		const normalizedTags = normalizeReadingPointTags(tags);
		const nextGroupId = await this.matchGroupForTags(normalizedTags);
		return await this.epubService.updateTask(taskId, {
			tags: normalizedTags,
			meta: {
				...task.meta,
				tagGroup: nextGroupId,
			},
		});
	}

	async matchGroupForTags(tags: string[]): Promise<string> {
		await this.tagGroupService.initialize();
		const allGroups = await this.tagGroupService.getAllGroups();
		return matchTagGroupByTags(allGroups, tags);
	}

	async getAllKnownTags(): Promise<string[]> {
		await this.initialize();
		const chunks = Object.values(await this.storage.getAllChunkData());
		const [pdfTasks, epubTasks, groups] = await Promise.all([
			this.pdfService.getAllTasks(),
			this.epubService.getAllTasks(),
			this.tagGroupService.getAllGroups(),
		]);

		const collected = new Set<string>();
		for (const chunk of chunks) {
			for (const tag of ((chunk as { tags?: string[] }).tags || [])) {
				const normalized = normalizeReadingPointTags([String(tag)]);
				if (normalized[0]) collected.add(normalized[0]);
			}
		}
		for (const task of [...pdfTasks, ...epubTasks]) {
			for (const tag of normalizeReadingPointTags(task.tags || [])) {
				collected.add(tag);
			}
		}
		for (const group of groups) {
			for (const tag of normalizeReadingPointTags(group.matchAnyTags || [])) {
				collected.add(tag);
			}
		}

		return Array.from(collected).sort((a, b) => a.localeCompare(b, "zh-CN"));
	}

	async syncMarkdownChunkTags(filePath: string): Promise<boolean> {
		await this.initialize();
		const normalizedPath = normalizePath(String(filePath || "").trim());
		if (!normalizedPath.toLowerCase().endsWith(".md")) {
			return false;
		}

		const allChunks = Object.values(await this.storage.getAllChunkData());
		const affectedChunks = allChunks.filter((chunk) => normalizePath(String(chunk.filePath || "").trim()) === normalizedPath);
		if (affectedChunks.length === 0) {
			return false;
		}

		const nextTags = await this.readMarkdownReadingTags(normalizedPath);
		const nextGroupId = await this.matchGroupForTags(nextTags);
		let changed = false;

		for (const chunk of affectedChunks) {
			const currentTags = normalizeReadingPointTags(((chunk as { tags?: string[] }).tags || []).map((tag) => String(tag)));
			const currentGroupId = String(chunk.meta?.tagGroup || "default");
			const tagsChanged =
				currentTags.length !== nextTags.length ||
				currentTags.some((tag, index) => tag !== nextTags[index]);
			if (!tagsChanged && currentGroupId === nextGroupId) {
				continue;
			}

			const updatedChunk = {
				...chunk,
				tags: nextTags,
				meta: {
					...chunk.meta,
					tagGroup: nextGroupId,
				},
				updatedAt: Date.now(),
			};
			await this.storage.saveChunkData(updatedChunk as IRChunkFileData);
			changed = true;
		}

		return changed;
	}

	async getTagGroups(): Promise<IRTagGroup[]> {
		await this.tagGroupService.initialize();
		return await this.tagGroupService.getAllGroups();
	}
}
