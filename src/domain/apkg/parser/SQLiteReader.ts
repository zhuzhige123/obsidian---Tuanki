/**
 * SQLite 数据库读取器
 *
 * 负责从Anki SQLite数据库中读取模型、牌组、笔记等数据
 *
 * @module domain/apkg/parser
 */

import initSqlJs, { type Database as SqlDatabase } from "sql.js";
import { APKGLogger } from "../../../infrastructure/logger/APKGLogger";
import { throwIfImportAborted, yieldImportTask } from "../ImportTaskControl";
import type { APKGFormat, APKGMetadata, AnkiDeck, AnkiModel, AnkiNote } from "../types";

/**
 * SQLite读取结果
 */
interface SQLiteReadResult {
	models: AnkiModel[];
	decks: AnkiDeck[];
	notes: AnkiNote[];
	metadata: APKGMetadata;
}

interface RawAnkiModel {
	id: number;
	name: string;
	type?: number;
	flds?: AnkiModel["flds"];
	tmpls?: AnkiModel["tmpls"];
	css?: string;
	sortf?: number;
	latexPre?: string;
	latexPost?: string;
}

interface RawAnkiDeck {
	id: number;
	name: string;
	desc?: string;
	conf?: number;
	dyn?: number;
}

type NoteRow = [number, number, string, string, number | null, string | null, string | null];

/**
 * SQLite 数据库读取器
 */
export class SQLiteReader {
	private logger: APKGLogger;
	private wasmUrl: string;
	private readonly sqlInitTimeoutMs: number;

	constructor(wasmUrl?: string, sqlInitTimeoutMs = 15000) {
		this.logger = new APKGLogger({ prefix: "[SQLiteReader]" });
		this.wasmUrl = String(wasmUrl || "sql-wasm.wasm");
		this.sqlInitTimeoutMs = sqlInitTimeoutMs;
	}

	private async initializeSqlJs(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
		let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

		try {
			return await Promise.race([
				initSqlJs({
					locateFile: (file) => (file.endsWith(".wasm") ? this.wasmUrl : file),
				}),
				new Promise<never>((_, reject) => {
					timeoutHandle = setTimeout(() => {
						reject(
							new Error(
								`加载 SQLite 解析器超时（>${this.sqlInitTimeoutMs}ms），资源路径: ${this.wasmUrl}`
							)
						);
					}, this.sqlInitTimeoutMs);
				}),
			]);
		} finally {
			if (timeoutHandle !== null) {
				clearTimeout(timeoutHandle);
			}
		}
	}

	/**
	 * 读取SQLite数据库
	 *
	 * @param dbData - 数据库二进制数据
	 * @param format - APKG格式信息
	 * @param options - 读取选项
	 * @returns 读取结果
	 */
	async read(
		dbData: Uint8Array,
		format: APKGFormat,
		options?: {
			signal?: AbortSignal;
			onProgress?: (progress: {
				progress: number;
				message: string;
				totalItems?: number;
				completedItems?: number;
			}) => void;
		}
	): Promise<SQLiteReadResult> {
		this.logger.info(`开始读取SQLite数据库 (格式: ${format.version})`);

		try {
			throwIfImportAborted(options?.signal);
			options?.onProgress?.({ progress: 10, message: "正在初始化 SQLite 解析器..." });
			const SQL = await this.initializeSqlJs();
			throwIfImportAborted(options?.signal);
			options?.onProgress?.({ progress: 20, message: "正在打开 SQLite 数据库..." });
			const db: SqlDatabase = new SQL.Database(dbData);

			try {
				options?.onProgress?.({ progress: 35, message: "正在读取模型信息..." });
				const models = this.readModels(db);
				await yieldImportTask(options?.signal);
				options?.onProgress?.({ progress: 45, message: "正在读取牌组信息..." });
				const decks = this.readDecks(db);
				await yieldImportTask(options?.signal);
				const noteCount = this.readNoteCount(db);
				options?.onProgress?.({
					progress: 55,
					message: "正在读取笔记数据...",
					totalItems: noteCount,
					completedItems: 0,
				});
				const notes = await this.readNotes(db, options);
				await yieldImportTask(options?.signal);
				options?.onProgress?.({ progress: 95, message: "正在整理数据库元信息..." });
				const metadata = this.readMetadata(db, notes.length);

				this.logger.info(
					`数据读取完成: ${models.length} 个模型, ${decks.length} 个牌组, ${notes.length} 个笔记`
				);

				options?.onProgress?.({
					progress: 100,
					message: `数据库读取完成: ${notes.length} 个笔记`,
					totalItems: notes.length,
					completedItems: notes.length,
				});

				return { models, decks, notes, metadata };
			} finally {
				db.close();
			}
		} catch (error) {
			this.logger.error("SQLite读取失败", error);
			throw error;
		}
	}

	/**
	 * 读取模型数据
	 */
	private readModels(db: SqlDatabase): AnkiModel[] {
		const results = db.exec("SELECT models FROM col");
		if (!results.length || !results[0].values.length) {
			throw new Error("数据库格式错误：col表为空");
		}

		const modelsJson = results[0].values[0][0] as string;
		const modelsObj = JSON.parse(modelsJson) as Record<string, RawAnkiModel>;

		const models: AnkiModel[] = Object.values(modelsObj).map((model) => ({
			id: model.id,
			name: model.name,
			type: model.type || 0,
			flds: model.flds || [],
			tmpls: model.tmpls || [],
			css: model.css || "",
			sortf: model.sortf,
			latexPre: model.latexPre,
			latexPost: model.latexPost,
		}));

		this.logger.debug(`读取到 ${models.length} 个模型`);
		return models;
	}

	/**
	 * 读取牌组数据
	 */
	private readDecks(db: SqlDatabase): AnkiDeck[] {
		const results = db.exec("SELECT decks FROM col");
		if (!results.length || !results[0].values.length) {
			throw new Error("数据库格式错误：无法读取牌组");
		}

		const decksJson = results[0].values[0][0] as string;
		const decksObj = JSON.parse(decksJson) as Record<string, RawAnkiDeck>;

		const decks: AnkiDeck[] = Object.values(decksObj)
			.filter((deck) => deck.id !== 1) // 排除默认牌组
			.map((deck) => ({
				id: deck.id,
				name: deck.name,
				desc: deck.desc || "",
				conf: deck.conf,
				dyn: deck.dyn,
			}));

		this.logger.debug(`读取到 ${decks.length} 个牌组`);
		return decks;
	}

	/**
	 * 读取笔记数量
	 */
	private readNoteCount(db: SqlDatabase): number {
		const results = db.exec("SELECT COUNT(*) FROM notes");
		if (!results.length || !results[0].values.length) {
			return 0;
		}

		return Number(results[0].values[0][0] || 0);
	}

	/**
	 * 读取笔记数据
	 */
	private async readNotes(db: SqlDatabase, options?: {
		signal?: AbortSignal;
		onProgress?: (progress: {
			progress: number;
			message: string;
			totalItems?: number;
			completedItems?: number;
		}) => void;
	}): Promise<AnkiNote[]> {
		const notes: AnkiNote[] = [];
		const totalNotes = this.readNoteCount(db);
		const statement = db.prepare("SELECT id, mid, flds, tags, mod, guid, sfld FROM notes");

		try {
			while (statement.step()) {
				throwIfImportAborted(options?.signal);
				const [id, mid, flds, tags, mod, guid, sfld] = statement.get() as NoteRow;
				notes.push({
					id,
					mid,
					flds,
					tags,
					mod: mod ?? undefined,
					guid: guid ?? undefined,
					sfld: sfld ?? undefined,
				});

				if (
					notes.length % 100 === 0 &&
					notes.length < totalNotes
				) {
					options?.onProgress?.({
						progress: 55 + (Math.min(notes.length, totalNotes) / Math.max(1, totalNotes)) * 35,
						message: "正在读取笔记数据...",
						totalItems: totalNotes,
						completedItems: notes.length,
					});
					await yieldImportTask(options?.signal);
				}
			}
		} finally {
			statement.free();
		}

		this.logger.debug(`读取到 ${notes.length} 个笔记`);
		return notes;
	}

	/**
	 * 读取元数据
	 */
	private readMetadata(db: SqlDatabase, totalNotes: number): APKGMetadata {
		try {
			const results = db.exec("SELECT crt, mod, ver FROM col");
			if (results.length && results[0].values.length) {
				const row = results[0].values[0];
				return {
					created: (row[0] as number) * 1000, // 转换为毫秒
					modified: (row[1] as number) * 1000,
					ankiVersion: String(row[2] || "unknown"),
					totalCards: 0, // 暂不统计
					totalNotes,
				};
			}
		} catch (error) {
			this.logger.warn("读取元数据失败", error);
		}

		// 返回默认元数据
		return {
			created: Date.now(),
			modified: Date.now(),
			totalCards: 0,
			totalNotes,
		};
	}
}
