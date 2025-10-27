/**
 * AnkiConnect API 客户端
 * 负责与 AnkiConnect 进行底层通信
 */

import {
  type AnkiConnectRequest,
  type AnkiConnectResponse,
  type AnkiDeckInfo,
  type AnkiModelInfo,
  type AnkiTemplateInfo,
  type AnkiNoteInfo,
  type AnkiNote,
  type AnkiMediaFile,
  AnkiConnectError,
  ConnectionErrorType
} from '../../types/ankiconnect-types';

export class AnkiConnectClient {
  private readonly endpoint: string;
  private readonly apiVersion: number = 6;
  private requestTimeout: number = 5000; // 5秒超时

  constructor(endpoint: string = 'http://localhost:8765') {
    this.endpoint = endpoint;
  }

  /**
   * 发送请求到 AnkiConnect
   */
  private async invoke<T = any>(
    action: string,
    params?: any
  ): Promise<T> {
    const request: AnkiConnectRequest = {
      action,
      version: this.apiVersion,
      params: params || {}
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new AnkiConnectError(
          `HTTP 错误: ${response.status} ${response.statusText}`,
          ConnectionErrorType.NETWORK,
          '请检查网络连接和 AnkiConnect 插件状态'
        );
      }

      const result: AnkiConnectResponse<T> = await response.json();

      if (result.error) {
        throw new AnkiConnectError(
          result.error,
          ConnectionErrorType.UNKNOWN,
          '请查看 Anki 错误日志获取详细信息'
        );
      }

      return result.result;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new AnkiConnectError(
          '请求超时',
          ConnectionErrorType.NETWORK,
          '请确保 Anki 正在运行且 AnkiConnect 插件已启用'
        );
      }

      if (error instanceof AnkiConnectError) {
        throw error;
      }

      if (error.message?.includes('fetch')) {
        throw new AnkiConnectError(
          'Anki 未运行或 AnkiConnect 插件未安装',
          ConnectionErrorType.NOT_RUNNING,
          '请启动 Anki 并确保已安装 AnkiConnect 插件'
        );
      }

      throw new AnkiConnectError(
        error.message || '未知错误',
        ConnectionErrorType.UNKNOWN
      );
    }
  }

  /**
   * 测试连接状态
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.invoke('version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取 AnkiConnect 版本
   */
  async getVersion(): Promise<number> {
    return await this.invoke<number>('version');
  }

  /**
   * 获取所有牌组名称
   */
  async getDeckNames(): Promise<string[]> {
    return await this.invoke<string[]>('deckNames');
  }

  /**
   * 获取所有模型（笔记类型）名称
   */
  async getModelNames(): Promise<string[]> {
    return await this.invoke<string[]>('modelNames');
  }

  /**
   * 获取模型字段列表
   */
  async getModelFieldNames(modelName: string): Promise<string[]> {
    return await this.invoke<string[]>('modelFieldNames', { modelName });
  }

  /**
   * 获取完整的模型信息
   * 
   * AnkiConnect API 组合：
   * 1. modelNamesAndIds - 验证模型存在并获取ID
   * 2. modelFieldNames - 获取字段列表
   * 3. modelTemplates - 获取卡片模板（如果支持）
   * 4. modelStyling - 获取CSS样式（如果支持）
   */
  async getModelInfo(modelName: string): Promise<AnkiModelInfo> {
    try {
      // 步骤1: 验证模型存在并获取ID
      const modelNamesAndIds = await this.invoke<Record<string, number>>('modelNamesAndIds');
      const modelId = modelNamesAndIds[modelName];
      
      if (modelId === undefined) {
        throw new AnkiConnectError(
          `模型 "${modelName}" 不存在`,
          ConnectionErrorType.UNKNOWN,
          '请在 Anki 中确认该模型是否存在'
        );
      }
      
      // 步骤2: 获取字段列表
      const fields = await this.invoke<string[]>('modelFieldNames', { modelName });
      
      // 步骤3: 尝试获取模板（某些 AnkiConnect 版本可能不支持）
      let templates: AnkiTemplateInfo[] = [];
      try {
        // ✅ modelTemplates 返回的是对象，不是数组
        const templateData = await this.invoke<Record<string, any>>('modelTemplates', { modelName });
        
        // 将对象转换为数组
        if (templateData && typeof templateData === 'object') {
          templates = Object.entries(templateData).map(([name, tmpl]) => ({
            Name: name,
            Front: tmpl.qfmt || tmpl.Front || '', // qfmt是实际的字段
            Back: tmpl.afmt || tmpl.Back || ''     // afmt是实际的字段
          }));
        }
        
        console.log(`✓ 成功获取模型 "${modelName}" 的 ${templates.length} 个模板`);
      } catch (error) {
        // 如果API不存在，使用空数组
        console.warn(`获取模型 "${modelName}" 的模板列表失败，可能API不支持:`, error);
      }
      
      // 步骤4: 尝试获取CSS
      let css = '';
      try {
        const styling = await this.invoke<{ css: string }>('modelStyling', { modelName });
        css = styling.css || '';
      } catch (error) {
        console.debug(`获取模型 "${modelName}" 的样式失败，可能API不支持:`, error);
      }
      
      // 组装完整信息
      return {
        id: modelId,
        name: modelName,
        fields: fields,
        templates: templates,
        css: css
      };
    } catch (error: any) {
      if (error instanceof AnkiConnectError) {
        throw error;
      }
      throw new AnkiConnectError(
        `获取模型 "${modelName}" 信息失败: ${error.message}`,
        ConnectionErrorType.UNKNOWN
      );
    }
  }

  /**
   * 获取牌组统计信息
   */
  async getDeckStats(deckName: string): Promise<AnkiDeckInfo> {
    const stats = await this.invoke<any>('getDeck', { deck: deckName });
    
    return {
      id: stats.deck_id,
      name: deckName,
      cardCount: stats.total_in_deck || 0,
      newCount: stats.new_count || 0,
      learnCount: stats.learn_count || 0,
      reviewCount: stats.review_count || 0
    };
  }

  /**
   * 添加笔记
   */
  async addNote(note: AnkiNote): Promise<number> {
    return await this.invoke<number>('addNote', { note });
  }

  /**
   * 更新笔记字段
   */
  async updateNoteFields(noteId: number, fields: Record<string, string>): Promise<void> {
    await this.invoke('updateNoteFields', {
      note: {
        id: noteId,
        fields
      }
    });
  }

  /**
   * 更新笔记标签
   */
  async updateNoteTags(noteId: number, tags: string[]): Promise<void> {
    // 先清除所有标签
    await this.invoke('clearUnusedTags');
    
    // 设置新标签
    await this.invoke('updateNoteTags', {
      note: noteId,
      tags: tags.join(' ')
    });
  }

  /**
   * 获取笔记信息
   */
  async getNotesInfo(noteIds: number[]): Promise<AnkiNoteInfo[]> {
    return await this.invoke<AnkiNoteInfo[]>('notesInfo', { notes: noteIds });
  }

  /**
   * 查找笔记
   */
  async findNotes(query: string): Promise<number[]> {
    return await this.invoke<number[]>('findNotes', { query });
  }

  /**
   * 根据牌组获取笔记
   */
  async findNotesByDeck(deckName: string): Promise<number[]> {
    return await this.findNotes(`deck:"${deckName}"`);
  }

  /**
   * 删除笔记
   */
  async deleteNotes(noteIds: number[]): Promise<void> {
    await this.invoke('deleteNotes', { notes: noteIds });
  }

  /**
   * 存储媒体文件到 Anki
   */
  async storeMediaFile(filename: string, data: string): Promise<void> {
    await this.invoke('storeMediaFile', { filename, data });
  }

  /**
   * 从 Anki 检索媒体文件
   */
  async retrieveMediaFile(filename: string): Promise<string> {
    return await this.invoke<string>('retrieveMediaFile', { filename });
  }

  /**
   * 获取媒体文件列表
   */
  async getMediaFilesNames(pattern: string = '*'): Promise<string[]> {
    return await this.invoke<string[]>('getMediaFilesNames', { pattern });
  }

  /**
   * 删除媒体文件
   */
  async deleteMediaFile(filename: string): Promise<void> {
    await this.invoke('deleteMediaFile', { filename });
  }

  /**
   * 批量操作（使用 AnkiConnect 的 multi 命令）
   */
  async multi<T = any>(actions: Array<{ action: string; params?: any }>): Promise<T[]> {
    return await this.invoke<T[]>('multi', { actions });
  }

  /**
   * 同步 Anki 集合
   */
  async sync(): Promise<void> {
    await this.invoke('sync');
  }

  /**
   * 创建新牌组
   */
  async createDeck(deckName: string): Promise<number> {
    return await this.invoke<number>('createDeck', { deck: deckName });
  }

  /**
   * 更改牌组
   */
  async changeDeck(cardIds: number[], deckName: string): Promise<void> {
    await this.invoke('changeDeck', { cards: cardIds, deck: deckName });
  }

  /**
   * 获取牌组配置
   */
  async getDeckConfig(deckName: string): Promise<any> {
    return await this.invoke('getDeckConfig', { deck: deckName });
  }

  /**
   * 设置超时时间
   */
  setRequestTimeout(timeout: number): void {
    this.requestTimeout = timeout;
  }
}

