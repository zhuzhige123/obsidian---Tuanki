/**
 * Markdown标签提取工具
 * 从Markdown内容中自动提取#标签
 * 
 * 特性：
 * - 支持中英文标签：#tag #标签
 * - 支持嵌套标签：#父标签/子标签
 * - 支持多词标签：#my-tag #my_tag
 * - 排除代码块中的标签
 * - 自动去重和排序
 */

export class TagExtractor {
  /**
   * 从Markdown内容中提取所有#标签
   * @param content - Markdown内容
   * @returns 标签数组（去重、排序，不含#前缀）
   */
  static extractTags(content: string): string[] {
    if (!content || typeof content !== 'string') {
      return [];
    }

    // Unicode属性转义：\p{L}=字母 \p{N}=数字
    // 支持：#tag #中文标签 #parent/child #my-tag #my_tag
    const tagPattern = /#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)/gu;
    
    const matches = content.matchAll(tagPattern);
    const tags = new Set<string>();
    
    for (const match of matches) {
      const tag = match[1].trim();
      if (tag) {
        tags.add(tag);
      }
    }
    
    return Array.from(tags).sort();
  }

  /**
   * 提取标签，但排除代码块中的内容
   * @param content - Markdown内容
   * @returns 标签数组（去重、排序，不含#前缀）
   */
  static extractTagsExcludingCode(content: string): string[] {
    if (!content || typeof content !== 'string') {
      return [];
    }

    // 移除代码块（```...```）
    let cleanedContent = content.replace(/```[\s\S]*?```/g, '');
    
    // 移除行内代码（`...`）
    cleanedContent = cleanedContent.replace(/`[^`]+`/g, '');

    // 从清理后的内容中提取标签
    return this.extractTags(cleanedContent);
  }

  /**
   * 智能合并标签
   * @param content - 内容
   * @param existingTags - 现有标签
   * @param mode - 合并模式
   * @returns 合并后的标签数组
   */
  static mergeTags(
    content: string,
    existingTags: string[] = [],
    mode: 'replace' | 'append' | 'smart' = 'smart'
  ): string[] {
    const extractedTags = this.extractTagsExcludingCode(content);
    
    switch (mode) {
      case 'replace':
        // 完全替换：只使用提取的标签
        return extractedTags;
      
      case 'append':
        // 追加模式：保留现有 + 添加提取的
        return Array.from(new Set([...existingTags, ...extractedTags])).sort();
      
      case 'smart':
      default:
        // 智能模式：合并去重
        // 保留手动添加的标签（不在content中的）+ 提取的标签
        const allTags = new Set([...existingTags, ...extractedTags]);
        return Array.from(allTags).sort();
    }
  }

  /**
   * 验证标签格式是否有效
   * @param tag - 标签（不含#前缀）
   * @returns 是否有效
   */
  static isValidTag(tag: string): boolean {
    if (!tag || typeof tag !== 'string') {
      return false;
    }

    // 标签规则：
    // - 只包含字母、数字、下划线、连字符、斜杠
    // - 不能为空
    // - 长度合理（1-100字符）
    const validPattern = /^[\p{L}\p{N}_\-\/]+$/u;
    return validPattern.test(tag) && tag.length > 0 && tag.length <= 100;
  }

  /**
   * 清理无效标签
   * @param tags - 标签数组
   * @returns 清理后的标签数组
   */
  static cleanTags(tags: string[]): string[] {
    if (!Array.isArray(tags)) {
      return [];
    }

    return tags
      .filter(tag => this.isValidTag(tag))
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
  }

  /**
   * 从内容中移除#标签（提取后清理）
   * @param content - 原始内容
   * @returns 移除标签后的内容
   */
  static removeTags(content: string): string {
    if (!content || typeof content !== 'string') {
      return '';
    }

    // 移除#标签，但保留周围的空格
    return content.replace(/#[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*/gu, '').trim();
  }
}


