/**
 * 视频课程服务
 * 
 * 负责从牌组卡片中提取视频文件、追踪视频状态、提供视频导航功能
 */

import type { Card } from '../../data/types';
import type { VideoFile, VideoItem, VideoStatus, VideoExtractionOptions } from '../../types/video-course-types';
import { VIDEO_REGEX, SUPPORTED_VIDEO_FORMATS } from '../../types/video-course-types';

export class VideoCourseService {
  private videoCache: Map<string, VideoFile[]> = new Map();
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL = 60000; // 1分钟缓存有效期

  /**
   * 从卡片列表中提取所有视频文件
   * 
   * @param cards 卡片列表
   * @param options 提取选项
   * @returns 视频文件列表
   */
  extractVideosFromCards(
    cards: Card[],
    options: VideoExtractionOptions = {}
  ): VideoFile[] {
    const {
      deduplicate = true
    } = options;

    console.log('[VideoCourseService] ========== 开始提取视频 ==========');
    console.log('[VideoCourseService] 卡片数量:', cards.length);

    const videos: VideoFile[] = [];
    const seen = new Set<string>();

    for (const card of cards) {
      console.log('[VideoCourseService] 处理卡片:', card.id);
      
      const content = this.getCardFullContent(card);
      
      if (!content) {
        console.log('[VideoCourseService] ❌ 卡片内容为空');
        continue;
      }
      
      console.log('[VideoCourseService] 卡片内容前100字符:', content.substring(0, 100));
      
      // 测试正则匹配
      const matches = [...content.matchAll(VIDEO_REGEX)];
      console.log('[VideoCourseService] 正则匹配结果数:', matches.length);

      for (const match of matches) {
        const filename = match[1];
        
        console.log('[VideoCourseService] ✅ 匹配到视频:', filename);
        console.log('[VideoCourseService] 完整匹配:', match[0]);
        
        // 去重处理
        if (deduplicate && seen.has(filename)) {
          console.log('[VideoCourseService] 跳过重复视频:', filename);
          continue;
        }
        
        seen.add(filename);
        
        videos.push({
          filename,
          wikiLink: match[0],
          cardId: card.id,
          relativePath: filename // 相对路径就是文件名本身
        });
      }
    }

    console.log('[VideoCourseService] ========== 提取完成 ==========');
    console.log('[VideoCourseService] 提取到视频数:', videos.length);
    if (videos.length > 0) {
      console.log('[VideoCourseService] 视频列表:', videos.map(v => v.filename));
    }

    return videos;
  }

  /**
   * 获取当前卡片包含的视频文件名集合
   * 
   * @param card 当前卡片
   * @returns 视频文件名集合
   */
  getCurrentCardVideos(card: Card | null): Set<string> {
    if (!card) return new Set();

    const content = this.getCardFullContent(card);
    const matches = content.matchAll(VIDEO_REGEX);
    
    return new Set([...matches].map(m => m[1]));
  }

  /**
   * 获取视频状态
   * 
   * @param videoFile 视频文件
   * @param currentCard 当前卡片
   * @param studiedCardIds 已学习的卡片ID集合
   * @param allCards 所有卡片
   * @returns 视频状态
   */
  getVideoStatus(
    videoFile: VideoFile,
    currentCard: Card | null,
    studiedCardIds: Set<string>,
    allCards: Card[]
  ): VideoStatus {
    // 检查是否在当前卡片
    if (currentCard) {
      const currentVideos = this.getCurrentCardVideos(currentCard);
      if (currentVideos.has(videoFile.filename)) {
        return 'current';
      }
    }

    // 检查是否在已学习的卡片中
    if (studiedCardIds.has(videoFile.cardId)) {
      return 'studied';
    }

    // 默认为待学习
    return 'pending';
  }

  /**
   * 生成视频项列表（包含状态）
   * 
   * @param videos 视频文件列表
   * @param currentCard 当前卡片
   * @param studiedCardIds 已学习的卡片ID集合
   * @param allCards 所有卡片
   * @returns 视频项列表
   */
  generateVideoItems(
    videos: VideoFile[],
    currentCard: Card | null,
    studiedCardIds: Set<string>,
    allCards: Card[]
  ): VideoItem[] {
    return videos.map(video => {
      const status = this.getVideoStatus(video, currentCard, studiedCardIds, allCards);
      
      return {
        ...video,
        status,
        clickable: status === 'current'
      };
    });
  }

  /**
   * 获取卡片的完整内容（用于搜索）
   * 
   * @param card 卡片
   * @returns 完整内容字符串
   */
  private getCardFullContent(card: Card): string {
    const parts: string[] = [];
    
    // ✅ 1. 优先使用新的content字段（主要内容存储）
    if (card.content) {
      parts.push(card.content);
      console.log('[VideoCourseService] content字段:', card.content.substring(0, 300));
    }
    
    // ✅ 2. fields对象（可能包含视频）
    if (card.fields) {
      Object.entries(card.fields).forEach(([key, value]) => {
        if (typeof value === 'string') {
          parts.push(value);
          if (value.includes('![[') || value.includes('.mp4')) {
            console.log(`[VideoCourseService] fields.${key}包含视频:`, value.substring(0, 200));
          }
        }
      });
    }
    
    // ✅ 3. 降级处理：旧字段（已废弃，但保留兼容性）
    if (card.front) parts.push(card.front);
    if (card.back) parts.push(card.back);

    const fullContent = parts.join('\n');
    console.log('[VideoCourseService] 完整内容长度:', fullContent.length);
    
    return fullContent;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.videoCache.clear();
    this.lastCacheUpdate = 0;
  }

  /**
   * 检查文件是否为支持的视频格式
   * 
   * @param filename 文件名
   * @returns 是否为视频文件
   */
  isVideoFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext ? SUPPORTED_VIDEO_FORMATS.includes(ext as any) : false;
  }

  /**
   * 从wiki-link中提取文件名
   * 
   * @param wikiLink wiki-link格式字符串
   * @returns 文件名
   */
  extractFilenameFromWikiLink(wikiLink: string): string | null {
    const match = wikiLink.match(/!\[\[([^\]]+)\]\]/);
    return match ? match[1] : null;
  }

  /**
   * 批量提取多个卡片的视频（带缓存）
   * 
   * @param deckId 牌组ID（用作缓存键）
   * @param cards 卡片列表
   * @returns 视频文件列表
   */
  extractVideosWithCache(
    deckId: string,
    cards: Card[]
  ): VideoFile[] {
    const now = Date.now();
    
    // 检查缓存
    if (this.videoCache.has(deckId) && (now - this.lastCacheUpdate < this.CACHE_TTL)) {
      return this.videoCache.get(deckId)!;
    }

    // 提取并缓存
    const videos = this.extractVideosFromCards(cards);
    this.videoCache.set(deckId, videos);
    this.lastCacheUpdate = now;

    return videos;
  }

  /**
   * 获取视频在卡片中的位置信息（用于定位）
   * 
   * @param card 卡片
   * @param videoFilename 视频文件名
   * @returns 位置信息（字段名和偏移量）
   */
  getVideoPositionInCard(
    card: Card,
    videoFilename: string
  ): { field: string; offset: number } | null {
    const searchInField = (fieldName: string, content: string): number => {
      const wikiLink = `![[${videoFilename}]]`;
      return content.indexOf(wikiLink);
    };

    // 搜索 front 字段
    if (card.front) {
      const offset = searchInField('front', card.front);
      if (offset !== -1) {
        return { field: 'front', offset };
      }
    }

    // 搜索 back 字段
    if (card.back) {
      const offset = searchInField('back', card.back);
      if (offset !== -1) {
        return { field: 'back', offset };
      }
    }

    // 搜索 fields 对象
    if (card.fields) {
      for (const [key, value] of Object.entries(card.fields)) {
        if (typeof value === 'string') {
          const offset = searchInField(key, value);
          if (offset !== -1) {
            return { field: key, offset };
          }
        }
      }
    }

    return null;
  }
}

