// SQL.js 加载器
// 用于加载和初始化 sql.js 库，支持旧版 APKG 导入

import initSqlJs from "sql.js";

// SQL.js 数据库接口
export interface SqlDatabase {
  exec(sql: string): Array<{
    columns: string[];
    values: any[][];
  }>;
  close(): void;
}

// SQL.js 构造函数接口
export interface SqlJs {
  Database: new (data?: Uint8Array) => SqlDatabase;
}

/**
 * 加载 SQL.js 库
 * @param wasmUrl WASM 文件的 URL
 * @returns SQL.js 实例
 */
export async function loadSqlJs(wasmUrl?: string): Promise<SqlJs> {
  try {
    console.log("🔧 正在加载 SQL.js 库...");
    
    // 配置 SQL.js
    const config: any = {};
    
    if (wasmUrl) {
      config.locateFile = (file: string) => {
        if (file.endsWith('.wasm')) {
          return wasmUrl;
        }
        return file;
      };
    }
    
    const SQL = await initSqlJs(config);
    console.log("✅ SQL.js 库加载成功");
    
    return SQL;
  } catch (error) {
    console.error("❌ SQL.js 库加载失败:", error);
    throw new Error(`无法加载SQLite解析器: ${error instanceof Error ? error.message : "未知错误"}`);
  }
}

/**
 * 检查 SQL.js 是否可用
 * @returns 是否可用
 */
export function isSqlJsAvailable(): boolean {
  try {
    // 尝试导入 sql.js
    return typeof initSqlJs === 'function';
  } catch {
    return false;
  }
}
