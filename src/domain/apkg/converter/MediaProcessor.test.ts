import { describe, expect, it, vi } from "vitest";

import { MediaProcessor } from "./MediaProcessor";

describe("MediaProcessor", () => {
	it("reports per-file progress while processing media files", async () => {
		const storage = {
			createDeckMediaFolder: vi.fn(async () => "weave/media/导入牌组"),
			saveMediaFile: vi.fn(async (filename: string, _data: Uint8Array, basePath: string) => `${basePath}/${filename}`),
			mediaFileExists: vi.fn(async () => false),
			deleteMediaFile: vi.fn(async () => undefined),
			saveManifest: vi.fn(async () => undefined),
			loadManifest: vi.fn(async () => null),
			generateObsidianPath: vi.fn((filename: string, basePath: string) => `${basePath}/${filename}`),
			calculateHash: vi.fn(async () => "hash"),
		};
		const processor = new MediaProcessor(storage as any);
		const onProgress = vi.fn();

		await processor.process(
			new Map([
				["sound.mp3", new Uint8Array([1])],
				["image.png", new Uint8Array([2])],
			]),
			"导入牌组",
			onProgress
		);

		expect(onProgress).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "正在保存媒体文件...",
				totalItems: 2,
				completedItems: 1,
				currentItem: "sound.mp3",
			})
		);
		expect(onProgress).toHaveBeenCalledWith(
			expect.objectContaining({
				progress: 100,
				message: "媒体文件处理完成",
			})
		);
	});
});
