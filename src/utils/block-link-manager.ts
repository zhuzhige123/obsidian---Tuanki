import { App, TFile, Editor, MarkdownView } from 'obsidian';
import { generateBlockId } from './helpers';

export interface BlockLinkInfo {
  blockId: string;
  blockLink: string;
  sourceFile: string;
  sourceDocument: string;
  lineNumber?: number;
  uniqueIdentifier: string;
  content: string;
}

export interface BlockLinkCreationResult {
  success: boolean;
  blockLinkInfo?: BlockLinkInfo;
  error?: string;
}

/**
 * 块链接管理器 - 处理Obsidian块链接的创建和管理
 */
export class BlockLinkManager {
  constructor(private app: App) {}

  /**
   * 为选中的内容创建块链接和唯一标识符
   * @param selectedText 选中的文本内容
   * @param sourceFileHint 可选的源文件提示
   * @returns 块链接创建结果
   */
  async createBlockLinkForSelection(
    selectedText: string,
    sourceFileHint?: string
  ): Promise<BlockLinkCreationResult> {
    try {
      console.log('🔗 [BlockLinkManager] 开始创建块链接');

      // 1. 智能获取源文件
      let targetFile = this.app.workspace.getActiveFile();

      // 如果有源文件提示，尝试使用提示的文件
      if (sourceFileHint && (!targetFile || targetFile.basename !== sourceFileHint)) {
        const files = this.app.vault.getMarkdownFiles();
        const hintedFile = files.find(f => f.basename === sourceFileHint || f.path === sourceFileHint);
        if (hintedFile) {
          targetFile = hintedFile;
          console.log('🔗 [BlockLinkManager] 使用提示的源文件:', hintedFile.path);
        }
      }

      if (!targetFile) {
        // 🔧 改进：即使没有源文件，也要生成基础的来源信息
        console.warn('⚠️ [BlockLinkManager] 没有找到源文件，生成基础来源信息');
        const uniqueIdentifier = this.generateUniqueIdentifier(selectedText, 'unknown');
        return {
          success: false, // 🔥 修复：没有源文件时应该返回失败状态
          blockLinkInfo: {
            blockId: generateBlockId(),
            blockLink: '',
            sourceFile: '',
            sourceDocument: sourceFileHint || 'unknown',
            uniqueIdentifier,
            content: selectedText
          },
          error: '没有找到活动的源文件，无法创建块链接'
        };
      }

      // 2. 生成唯一标识符和块ID
      const uniqueIdentifier = this.generateUniqueIdentifier(selectedText, targetFile.basename);
      const blockId = generateBlockId();

      console.log('🔗 [BlockLinkManager] 生成标识符:', {
        uniqueIdentifier,
        blockId,
        file: targetFile.basename
      });

      // 3. 检查是否已存在相同内容的块链接
      const existingBlockLink = await this.findExistingBlockLink(selectedText, targetFile);
      if (existingBlockLink) {
        console.log('✅ [BlockLinkManager] 找到现有块链接:', existingBlockLink.blockLink);
        return {
          success: true,
          blockLinkInfo: existingBlockLink
        };
      }

      // 4. 尝试在源文档中创建块链接
      console.log('🔗 [BlockLinkManager] 开始在源文档中创建块链接:', {
        file: targetFile.path,
        blockId,
        contentLength: selectedText.length
      });

      const blockLinkInfo = await this.createBlockLinkInDocument(
        targetFile,
        selectedText,
        blockId,
        uniqueIdentifier
      );

      if (blockLinkInfo) {
        console.log('✅ [BlockLinkManager] 块链接创建成功:', {
          blockLink: blockLinkInfo.blockLink,
          lineNumber: blockLinkInfo.lineNumber,
          sourceFile: blockLinkInfo.sourceFile
        });
        return { success: true, blockLinkInfo };
      } else {
        // 🔥 修复：块链接创建失败时返回失败状态，但保护内容
        console.error('❌ [BlockLinkManager] 块链接创建失败，返回基础信息');
        return {
          success: false, // 🔥 修复：返回失败状态，让调用方知道块链接创建失败
          blockLinkInfo: {
            blockId,
            blockLink: `[[${targetFile.basename}]]`, // 至少提供文档链接
            sourceFile: targetFile.path,
            sourceDocument: targetFile.basename,
            uniqueIdentifier,
            content: selectedText
          },
          error: '无法在源文档中创建块链接，可能是权限问题或文档格式问题'
        };
      }

    } catch (error) {
      console.error('❌ [BlockLinkManager] 创建块链接失败:', error);
      // 🔧 改进：即使出错，也要保护内容
      const uniqueIdentifier = this.generateUniqueIdentifier(selectedText, 'error');
      return {
        success: true, // 改为 true，确保内容不丢失
        blockLinkInfo: {
          blockId: generateBlockId(),
          blockLink: '',
          sourceFile: '',
          sourceDocument: 'unknown',
          uniqueIdentifier,
          content: selectedText
        }
      };
    }
  }

  /**
   * 生成内容的唯一标识符
   */
  private generateUniqueIdentifier(content: string, fileName: string): string {
    // 使用内容的前50个字符 + 文件名 + 时间戳创建唯一标识符
    const contentHash = content.substring(0, 50).replace(/\s+/g, '-').replace(/[^\w\-]/g, '');
    const timestamp = Date.now().toString(36);
    return `tuanki-${fileName}-${contentHash}-${timestamp}`;
  }

  /**
   * 查找现有的块链接
   */
  private async findExistingBlockLink(content: string, file: TFile): Promise<BlockLinkInfo | null> {
    try {
      const fileContent = await this.app.vault.read(file);
      const lines = fileContent.split('\n');

      // 查找包含相同内容的行，并检查是否已有块ID
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(content.substring(0, 30))) {
          // 检查这一行或下一行是否有块ID
          const blockIdMatch = line.match(/\^([a-zA-Z0-9-]+)$/);
          if (blockIdMatch) {
            const blockId = blockIdMatch[1];
            const blockLink = `[[${file.basename}#^${blockId}]]`;
            
            return {
              blockId,
              blockLink,
              sourceFile: file.path,
              sourceDocument: file.basename,
              lineNumber: i + 1,
              uniqueIdentifier: `existing-${blockId}`,
              content: line.replace(/\s*\^[a-zA-Z0-9-]+$/, '').trim()
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('❌ [BlockLinkManager] 查找现有块链接失败:', error);
      return null;
    }
  }

  /**
   * 在文档中创建块链接（更智能的方法）
   */
  private async createBlockLinkInDocument(
    file: TFile,
    selectedText: string,
    blockId: string,
    uniqueIdentifier: string
  ): Promise<BlockLinkInfo | null> {
    try {
      console.log('🔗 [BlockLinkManager] 开始在文档中创建块链接:', {
        fileName: file.basename,
        filePath: file.path,
        blockId,
        selectedTextLength: selectedText.length,
        selectedTextPreview: selectedText.substring(0, 100) + '...'
      });

      // 读取文件内容
      const fileContent = await this.app.vault.read(file);
      const lines = fileContent.split('\n');

      console.log('🔗 [BlockLinkManager] 文件内容读取成功:', {
        totalLines: lines.length,
        fileSize: fileContent.length
      });

      // 查找包含选中内容的行
      let targetLineIndex = -1;
      let bestMatch = 0;
      const searchText = selectedText.trim();
      
      // ✅ 改进：检测多行文本，使用更智能的匹配策略
      const isMultiline = searchText.includes('\n');
      let searchPreview: string;
      
      if (isMultiline) {
        // 多行文本：使用第一行（更长的预览）
        const firstLine = searchText.split('\n')[0].trim();
        searchPreview = firstLine.substring(0, Math.min(50, firstLine.length));
        console.log('🔗 [BlockLinkManager] 检测到多行文本，使用第一行作为搜索依据');
      } else {
        // 单行文本：使用前50个字符（增加匹配成功率）
        searchPreview = searchText.substring(0, Math.min(50, searchText.length));
      }

      console.log('🔗 [BlockLinkManager] 开始搜索匹配行:', {
        isMultiline,
        searchPreview,
        searchTextLength: searchText.length
      });

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // ✅ 改进：使用更宽松的匹配条件
        // 1. 完全包含预览文本
        // 2. 或者预览文本包含在行中（处理格式化差异）
        const normalizedLine = line.trim();
        const normalizedPreview = searchPreview.trim();
        
        if (normalizedLine.includes(normalizedPreview) || 
            normalizedPreview.length > 10 && normalizedLine.includes(normalizedPreview.substring(0, 20))) {
          const matchLength = this.calculateMatchLength(line, searchText);
          console.log(`🔗 [BlockLinkManager] 找到潜在匹配行 ${i + 1}:`, {
            lineContent: line.substring(0, 50) + '...',
            matchLength,
            currentBestMatch: bestMatch
          });

          if (matchLength > bestMatch) {
            bestMatch = matchLength;
            targetLineIndex = i;
            console.log(`🔗 [BlockLinkManager] 更新最佳匹配行: ${i + 1}, 匹配度: ${matchLength}`);
          }
        }
      }

      if (targetLineIndex === -1) {
        // ✅ 修改策略：如果找不到匹配的行，不在文件中添加内容
        // 只返回基础的块链接信息，避免污染源文档
        console.log('🔗 [BlockLinkManager] 未找到匹配行，不修改源文档，返回文档链接');
        
        const blockLink = `[[${file.basename}]]`; // 只提供文档链接
        
        return {
          blockId,
          blockLink,
          sourceFile: file.path,
          sourceDocument: file.basename,
          lineNumber: undefined, // 没有具体行号
          uniqueIdentifier,
          content: selectedText
        };
      } else {
        // 在找到的行添加块ID
        const targetLine = lines[targetLineIndex];
        console.log('🔗 [BlockLinkManager] 找到目标行:', {
          lineIndex: targetLineIndex,
          lineNumber: targetLineIndex + 1,
          lineContent: targetLine,
          hasExistingBlockId: targetLine.includes('^')
        });

        // 检查是否已经有块ID
        if (!targetLine.includes('^')) {
          const newLine = `${targetLine} ^${blockId}`;
          lines[targetLineIndex] = newLine;
          const updatedContent = lines.join('\n');

          console.log('🔗 [BlockLinkManager] 准备修改现有行:', {
            originalLine: targetLine,
            newLine: newLine,
            fileName: file.basename
          });

          await this.app.vault.modify(file, updatedContent);
          console.log('✅ [BlockLinkManager] 现有行修改成功，块ID已添加');
        } else {
          // 如果已经有块ID，提取现有的块ID
          const existingBlockIdMatch = targetLine.match(/\^([a-zA-Z0-9-]+)$/);
          if (existingBlockIdMatch) {
            blockId = existingBlockIdMatch[1];
            console.log('🔗 [BlockLinkManager] 使用现有块ID:', blockId);
          } else {
            console.warn('⚠️ [BlockLinkManager] 检测到^符号但无法提取块ID，行内容:', targetLine);
          }
        }
      }

      // 生成块链接
      const blockLink = `[[${file.basename}#^${blockId}]]`;

      const result = {
        blockId,
        blockLink,
        sourceFile: file.path,
        sourceDocument: file.basename,
        lineNumber: targetLineIndex + 1,
        uniqueIdentifier,
        content: selectedText
      };

      console.log('✅ [BlockLinkManager] 块链接信息生成完成:', {
        blockLink,
        sourceDocument: file.basename,
        lineNumber: targetLineIndex + 1,
        uniqueIdentifier
      });

      return result;

    } catch (error) {
      console.error('❌ [BlockLinkManager] 创建块链接失败:', {
        fileName: file.basename,
        filePath: file.path,
        error: error.message,
        errorStack: error.stack,
        blockId,
        selectedTextLength: selectedText.length
      });
      return null;
    }
  }

  /**
   * 计算两个文本的匹配长度
   */
  private calculateMatchLength(line: string, searchText: string): number {
    const lineWords = line.toLowerCase().split(/\s+/);
    const searchWords = searchText.toLowerCase().split(/\s+/);

    let matchCount = 0;
    for (const searchWord of searchWords) {
      if (lineWords.some(lineWord => lineWord.includes(searchWord) || searchWord.includes(lineWord))) {
        matchCount++;
      }
    }

    return matchCount;
  }

  /**
   * 为卡片内容生成来源信息
   */
  generateSourceInfo(blockLinkInfo: BlockLinkInfo): string {
    const sourceInfo = [
      `**来源文档**: ${blockLinkInfo.blockLink}`,
      `**唯一标识**: \`${blockLinkInfo.uniqueIdentifier}\``,
      `**创建时间**: ${new Date().toLocaleString()}`
    ].join('\n');

    return `\n\n---\n\n### 📎 来源信息\n\n${sourceInfo}`;
  }

  /**
   * 检查唯一标识符是否已存在（避免重复创建）
   */
  async checkUniqueIdentifierExists(uniqueIdentifier: string): Promise<boolean> {
    try {
      // 这里可以实现检查逻辑，比如搜索所有卡片的notes字段
      // 暂时返回false，表示不存在
      return false;
    } catch (error) {
      console.error('❌ [BlockLinkManager] 检查唯一标识符失败:', error);
      return false;
    }
  }
}

/**
 * 获取块链接管理器实例
 */
export function getBlockLinkManager(app: App): BlockLinkManager {
  return new BlockLinkManager(app);
}
