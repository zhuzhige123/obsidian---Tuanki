/**
 * 打包 collection.anki21 + media 为 .apkg（zip）。
 */

import { packZipArchive } from "../zip/minimal-zip";
import type { ExportMediaEntry } from "./NoteExportBuilder";

export async function packApkgArchive(params: {
	databaseBytes: Uint8Array;
	media: ExportMediaEntry[];
	/** 使用 anki21 以匹配本仓库导入侧支持的格式 */
	dbFileName?: "collection.anki21" | "collection.anki2";
}): Promise<Uint8Array> {
	const dbFileName = params.dbFileName ?? "collection.anki21";
	const files: Record<string, Uint8Array | string> = {
		[dbFileName]: params.databaseBytes,
	};

	const mediaMap: Record<string, string> = {};
	params.media.forEach((entry, index) => {
		const key = String(index);
		mediaMap[key] = entry.filename;
		files[key] = entry.data;
	});

	files.media = JSON.stringify(mediaMap);

	return packZipArchive(files);
}
