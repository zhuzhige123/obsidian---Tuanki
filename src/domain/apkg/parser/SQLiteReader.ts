/**
 * SQLite 数据库读取器
 * 
 * 负责从Anki SQLite数据库中读取模型、牌组、笔记等数据
 * 
 * @module domain/apkg/parser
 */

import initSqlJs, { type Database as SqlDatabase } from 'sql.js';
import type {
  AnkiModel,
  AnkiDeck,
  AnkiNote,
  APKGFormat,
  APKGMetadata
} from '../types';
import { APKGLogger } from '../../../infrastructure/logger/APKGLogger';

/**
 * SQLite读取结果
 */
interface SQLiteReadResult {
  models: AnkiModel[];
  decks: AnkiDeck[];
  notes: AnkiNote[];
  metadata: APKGMetadata;
}

/**
 * SQLite 数据库读取器
 */
export class SQLiteReader {
  private logger: APKGLogger;
  private wasmUrl: string;

  constructor(wasmUrl?: string) {
    this.logger = new APKGLogger({ prefix: '[SQLiteReader]' });
    // 默认WASM路径
    this.wasmUrl = wasmUrl || 'https://sql.js.org/dist/sql-wasm.wasm';
  }

  /**
   * 读取SQLite数据库
   * 
   * @param dbData - 数据库二进制数据
   * @param format - APKG格式信息
   * @returns 读取结果
   */
  async read(dbData: Uint8Array, format: APKGFormat): Promise<SQLiteReadResult> {
    this.logger.info(`开始读取SQLite数据库 (格式: ${format.version})`);
    
    try {
      // 初始化sql.js
      const SQL = await initSqlJs({ locateFile: () => this.wasmUrl });
      const db: SqlDatabase = new SQL.Database(dbData);
      
      try {
        // 读取各类数据
        const models = this.readModels(db);
        const decks = this.readDecks(db);
        const notes = this.readNotes(db);
        const metadata = this.readMetadata(db, notes.length);
        
        this.logger.info(`数据读取完成: ${models.length} 个模型, ${decks.length} 个牌组, ${notes.length} 个笔记`);
        
        return { models, decks, notes, metadata };
      } finally {
        db.close();
      }
    } catch (error) {
      this.logger.error('SQLite读取失败', error);
      throw error;
    }
  }

  /**
   * 读取模型数据
   */
  private readModels(db: SqlDatabase): AnkiModel[] {
    const results = db.exec('SELECT models FROM col');
    if (!results.length || !results[0].values.length) {
      throw new Error('数据库格式错误：col表为空');
    }
    
    const modelsJson = results[0].values[0][0] as string;
    const modelsObj: Record<string, any> = JSON.parse(modelsJson);
    
    const models: AnkiModel[] = Object.values(modelsObj).map((model: any) => ({
      id: model.id,
      name: model.name,
      type: model.type || 0,
      flds: model.flds || [],
      tmpls: model.tmpls || [],
      css: model.css || '',
      sortf: model.sortf,
      latexPre: model.latexPre,
      latexPost: model.latexPost
    }));
    
    this.logger.debug(`读取到 ${models.length} 个模型`);
    return models;
  }

  /**
   * 读取牌组数据
   */
  private readDecks(db: SqlDatabase): AnkiDeck[] {
    const results = db.exec('SELECT decks FROM col');
    if (!results.length || !results[0].values.length) {
      throw new Error('数据库格式错误：无法读取牌组');
    }
    
    const decksJson = results[0].values[0][0] as string;
    const decksObj: Record<string, any> = JSON.parse(decksJson);
    
    const decks: AnkiDeck[] = Object.values(decksObj)
      .filter((deck: any) => deck.id !== 1)  // 排除默认牌组
      .map((deck: any) => ({
        id: deck.id,
        name: deck.name,
        desc: deck.desc || '',
        conf: deck.conf,
        dyn: deck.dyn
      }));
    
    this.logger.debug(`读取到 ${decks.length} 个牌组`);
    return decks;
  }

  /**
   * 读取笔记数据
   */
  private readNotes(db: SqlDatabase): AnkiNote[] {
    const results = db.exec('SELECT id, mid, flds, tags, mod, guid, sfld FROM notes');
    if (!results.length) {
      this.logger.warn('未找到笔记数据');
      return [];
    }
    
    const notes: AnkiNote[] = results[0].values.map((row: any[]) => ({
      id: row[0] as number,
      mid: row[1] as number,
      flds: row[2] as string,
      tags: row[3] as string,
      mod: row[4] as number,
      guid: row[5] as string,
      sfld: row[6] as string
    }));
    
    this.logger.debug(`读取到 ${notes.length} 个笔记`);
    return notes;
  }

  /**
   * 读取元数据
   */
  private readMetadata(db: SqlDatabase, totalNotes: number): APKGMetadata {
    try {
      const results = db.exec('SELECT crt, mod, ver FROM col');
      if (results.length && results[0].values.length) {
        const row = results[0].values[0];
        return {
          created: (row[0] as number) * 1000,  // 转换为毫秒
          modified: (row[1] as number) * 1000,
          ankiVersion: String(row[2] || 'unknown'),
          totalCards: 0,  // 暂不统计
          totalNotes
        };
      }
    } catch (error) {
      this.logger.warn('读取元数据失败', error);
    }
    
    // 返回默认元数据
    return {
      created: Date.now(),
      modified: Date.now(),
      totalCards: 0,
      totalNotes
    };
  }
}




