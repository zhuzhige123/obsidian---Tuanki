// Anki Plugin Helper Functions
// Common utility functions and helper methods
// Code cleanup completed 2025-01-25

import type { Card } from "../data/types";
import { CardState, Rating } from "../data/types";

// ============================================================================
// ID Generation - Backward Compatibility Layer
// ============================================================================

// 🆕 优先使用新的TuankiIDGenerator（推荐）
import {
  generateCardUUID as newGenerateCardUUID,
  generateBlockID as newGenerateBlockID,
  isValidUUID as newIsValidUUID,
  isValidBlockID as newIsValidBlockID,
  extractTimestamp,
} from '../services/identifier/TuankiIDGenerator';

// 兼容旧的unified ID generator（用于非UUID场景）
import {
  generateID,
  generateUUID as unifiedGenerateUUID,
  generateBlockID as unifiedGenerateBlockID,
  IDType
} from './unified-id-generator';

// ============================================================================
// UUID Functions
// ============================================================================

/**
 * 生成卡片UUID
 * 
 * 🆕 新格式：tk-{7位时间戳}{5位随机} (15位)
 * 示例：tk-xm8k3p2a7b9h
 * 
 * @returns UUID字符串
 */
export function generateUUID(): string {
  // 使用新的TuankiIDGenerator
  return newGenerateCardUUID();
}

/**
 * 验证UUID格式
 * @param uuid UUID字符串
 * @returns 是否有效
 */
export function isValidUUID(uuid: string): boolean {
  // 优先验证新格式
  if (newIsValidUUID(uuid)) {
    return true;
  }
  
  // 兼容旧格式UUID（标准UUID v4）
  const legacyUUIDRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (legacyUUIDRegex.test(uuid)) {
    return true;
  }
  
  // 兼容临时ID格式（tuanki-card-xxx 或 uuid-xxx）
  if (uuid.startsWith('tuanki-card-') || uuid.startsWith('uuid-') || uuid.startsWith('card-')) {
    return true;
  }
  
  return false;
}

/**
 * 从UUID提取创建时间
 * @param uuid UUID字符串
 * @returns Date对象，如果无法提取返回null
 */
export function getUUIDTimestamp(uuid: string): Date | null {
  const timestamp = extractTimestamp(uuid);
  return timestamp > 0 ? new Date(timestamp) : null;
}

// ============================================================================
// BlockID Functions
// ============================================================================

/**
 * 生成Obsidian BlockID
 * 
 * 格式：6位base36随机字符
 * 示例：3ka8m2
 * 
 * @returns BlockID字符串（不含^前缀）
 */
export function generateBlockId(): string {
  // 使用新的TuankiIDGenerator
  return newGenerateBlockID();
}

/**
 * 验证BlockID格式
 * @param blockId BlockID字符串（可含^前缀）
 * @returns 是否有效
 */
export function isValidBlockId(blockId: string): boolean {
  // 去除可能的^前缀
  const cleanId = blockId.startsWith('^') ? blockId.substring(1) : blockId;
  return newIsValidBlockID(cleanId);
}

/**
 * 标准化BlockID（确保有^前缀）
 * @param blockId BlockID字符串
 * @returns 标准化后的BlockID
 */
export function normalizeBlockId(blockId: string): string {
  return blockId.startsWith('^') ? blockId : `^${blockId}`;
}

// ============================================================================
// Generic ID Functions (Backward Compatibility)
// ============================================================================

/**
 * 生成通用ID
 * @deprecated 新代码请使用generateUUID()或generateBlockId()
 */
export function generateId(): string {
  return generateID(IDType.GENERIC);
}

// Refactor: Use unified date-time processing system
import {
  formatDate as unifiedFormatDate,
  formatDateTime as unifiedFormatDateTime,
  formatRelativeTime as unifiedFormatRelativeTime,
  DateFormat
} from './unified-date-time';

// Time formatting - backward compatibility
export function formatDate(date: string | Date | null): string {
  return unifiedFormatDate(date, DateFormat.CHINESE_DATE);
}

export function formatDateTime(date: string | Date | null): string {
  return unifiedFormatDateTime(date, DateFormat.CHINESE_DATETIME);
}

export function formatRelativeTime(date: string | Date | null): string {
  if (!date) return "-";
  return unifiedFormatRelativeTime(date);
}

// Relative time formatting (compatible with component implementation)
// 支持精确到分钟的相对时间显示：刚刚、X分钟前、X小时前、X天前等
export function formatRelativeTimeDetailed(date: string | Date | null): string {
  if (!date) return "-";
  return unifiedFormatRelativeTime(date);
}

// Study time formatting
export function formatStudyTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

// Number formatting
export function formatNumber(num: number, decimals = 0): string {
  return num.toFixed(decimals);
}

export function formatPercentage(ratio: number, decimals = 1): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

// Card state related
export function getCardStateText(state: CardState): string {
  switch (state) {
    case CardState.New: return 'New Card';
    case CardState.Learning: return 'Learning';
    case CardState.Review: return 'Review';
    case CardState.Relearning: return 'Relearning';
    default: return 'Unknown';
  }
}

export function getCardStateColor(state: CardState): string {
  switch (state) {
    case CardState.New: return 'var(--anki-new)';
    case CardState.Learning: return 'var(--anki-learning)';
    case CardState.Review: return 'var(--anki-review)';
    case CardState.Relearning: return 'var(--anki-relearning)';
    default: return 'var(--text-muted)';
  }
}

export function getRatingText(rating: Rating): string {
  switch (rating) {
    case Rating.Again: return 'Again';
    case Rating.Hard: return 'Hard';
    case Rating.Good: return 'Good';
    case Rating.Easy: return 'Easy';
    default: return 'Unknown';
  }
}

export function getRatingColor(rating: Rating): string {
  switch (rating) {
    case Rating.Again: return 'var(--anki-again)';
    case Rating.Hard: return 'var(--anki-hard)';
    case Rating.Good: return 'var(--anki-good)';
    case Rating.Easy: return 'var(--anki-easy)';
    default: return 'var(--text-muted)';
  }
}

// Data validation functions removed - not used in project

// Search and filter functions removed - project uses more specialized search implementations

// Statistics calculation
export function calculateDeckStats(cards: Card[]) {
  const stats = {
    totalCards: cards.length,
    newCards: 0,
    learningCards: 0,
    reviewCards: 0,
    relearningCards: 0,
    dueCards: 0,
    overdueCards: 0,
    averageEase: 0,
    averageInterval: 0,
    retentionRate: 0,
    totalReviews: 0,
    studyStreak: 0,
    lastStudied: null as Date | null,
    estimatedStudyTime: 0
  };

  let totalEase = 0;
  let totalInterval = 0;
  let easeCount = 0;
  let intervalCount = 0;
  let correctReviews = 0;
  const now = new Date();

  for (const card of cards) {
    // Count by state
    switch (card.state) {
      case CardState.New:
        stats.newCards++;
        break;
      case CardState.Learning:
        stats.learningCards++;
        break;
      case CardState.Review:
        stats.reviewCards++;
        break;
      case CardState.Relearning:
        stats.relearningCards++;
        break;
    }

    // Check if due
    if (card.due && new Date(card.due) <= now) {
      stats.dueCards++;
      if (new Date(card.due) < now) {
        stats.overdueCards++;
      }
    }

    // Calculate averages
    if (card.ease && card.ease > 0) {
      totalEase += card.ease;
      easeCount++;
    }

    if (card.interval && card.interval > 0) {
      totalInterval += card.interval;
      intervalCount++;
    }

    // Count reviews and calculate retention
    if (card.reviews && card.reviews > 0) {
      stats.totalReviews += card.reviews;
      // Simplified retention calculation
      if (card.state === CardState.Review) {
        correctReviews++;
      }
    }

    // Track last studied
    if (card.lastReviewed) {
      const lastReviewed = new Date(card.lastReviewed);
      if (!stats.lastStudied || lastReviewed > stats.lastStudied) {
        stats.lastStudied = lastReviewed;
      }
    }
  }

  // Calculate averages
  if (easeCount > 0) {
    stats.averageEase = totalEase / easeCount;
  }

  if (intervalCount > 0) {
    stats.averageInterval = totalInterval / intervalCount;
  }

  if (stats.totalReviews > 0) {
    stats.retentionRate = correctReviews / stats.totalReviews;
  }

  // Estimate study time (rough calculation)
  stats.estimatedStudyTime = stats.dueCards * 30; // 30 seconds per card

  return stats;
}

// Learning progress calculation functions removed - uses more precise FSRS algorithm implementation

// Text processing
export function truncateText(text: any, maxLength: number): string {
  // 🛡️ 类型安全：确保text是字符串
  if (text === null || text === undefined) return '';
  const textStr = typeof text === 'string' ? text : String(text);
  if (textStr.length <= maxLength) return textStr;
  return `${textStr.substring(0, maxLength - 3)}...`;
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

// Convert HTML to Markdown (basic implementation, covers common tags)
export function htmlToMarkdown(html: string): string {
  if (!html || typeof html !== 'string') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const repeat = (s: string, n: number) => new Array(Math.max(0, n)).fill(s).join('');

  function serialize(node: Node, depth = 0): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    function joinChildren(sep = ''): string {
      return Array.from(el.childNodes).map(n => serialize(n, depth + 1)).join(sep);
    }

    const pad = repeat('  ', depth);

    switch (tag) {
      case 'h1': return `# ${joinChildren()}\n\n`;
      case 'h2': return `## ${joinChildren()}\n\n`;
      case 'h3': return `### ${joinChildren()}\n\n`;
      case 'h4': return `#### ${joinChildren()}\n\n`;
      case 'h5': return `##### ${joinChildren()}\n\n`;
      case 'h6': return `###### ${joinChildren()}\n\n`;
      case 'p': return `${joinChildren()}\n\n`;
      case 'br': return '\n';
      case 'strong':
      case 'b': return `**${joinChildren()}**`;
      case 'em':
      case 'i': return `*${joinChildren()}*`;
      case 'code': return `\`${joinChildren()}\``;
      case 'pre': return `\`\`\`\n${joinChildren()}\n\`\`\`\n\n`;
      case 'blockquote': return `> ${joinChildren().replace(/\n/g, '\n> ')}\n\n`;
      case 'a': {
        const href = el.getAttribute('href') || '';
        const text = joinChildren();
        return href ? `[${text}](${href})` : text;
      }
      case 'img': {
        const src = el.getAttribute('src') || '';
        const alt = el.getAttribute('alt') || '';
        return src ? `![${alt}](${src})` : '';
      }
      case 'ul':
      case 'ol': {
        const items = Array.from(el.children).map((li, i) => {
          const bullet = tag === 'ul' ? '-' : `${i + 1}.`;
          const content = serialize(li, depth + 1)
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .join(' ')
            .replace(/\s+\n\s+/g, '\n')
            .trim();
          return `${pad}${bullet} ${content}\n`;
        }).join('');
        return `${items}\n`;
      }
      case 'li': {
        const content = Array.from(el.childNodes)
          .map(n => serialize(n, depth))
          .join(' ')
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .join(' ')
          .replace(/\s+\n\s+/g, '\n')
          .trim();
        return `${pad}${bullet} ${content}\n`;
      }
      // audio/video/source: keep as link/text
      case 'audio':
      case 'video':
      case 'source': {
        const src = el.getAttribute('src') || '';
        return src ? `[media](${src})` : '';
      }
      default:
        return joinChildren('');
    }
  }

  // Main serialization
  const parts = Array.from(doc.body.childNodes).map((n) => serialize(n)).filter(Boolean);
  // Clean up extra blank lines
  const out = parts.join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out;
}

/**
 * Enhanced HTML to Markdown converter
 * Specially suitable for complex HTML content imported from APKG, such as styled blockquotes and complex links
 */
export function enhancedHtmlToMarkdown(html: string): string {
  if (!html || typeof html !== 'string') return '';

  // Preprocessing: clean up some common HTML issues
  let cleanHtml = html
    // Remove extra whitespace characters
    .replace(/\s+/g, ' ')
    // Handle self-closing tags
    .replace(/<br\s*\/?>/gi, '<br>')
    // Standardize quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // Handle special blockquote styles
    .replace(/<blockquote[^>]*style="[^"]*"[^>]*>/gi, '<blockquote>')
    .trim();

  // Use existing htmlToMarkdown function as base
  let result = htmlToMarkdown(cleanHtml);

  // Post-processing: optimize Markdown output
  result = result
    // Clean up extra blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Clean up extra spaces in quote blocks
    .replace(/^>\s+/gm, '> ')
    // Ensure proper blank lines before and after quote blocks
    .replace(/([^\n])\n>/g, '$1\n\n>')
    .replace(/>\n([^\n>])/g, '>\n\n$1')
    .trim();

  return result;
}

// Simple Markdown to HTML (for export/preview; not a complete Markdown renderer)
export function markdownToHtml(md: string): string {
  if (!md) return "";
  let out = md;
  // Code blocks
  out = out.replace(/```([\s\S]*?)```/g, (_m, p1) => `<pre><code>${p1.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`);
  // Headers
  out = out.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>')
           .replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>')
           .replace(/^####\s+(.*)$/gm, '<h4>$1</h4>')
           .replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
           .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
           .replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
  // Quotes
  out = out.replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>');
  // Bold/italic/inline code
  out = out.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
           .replace(/\*(.*?)\*/g, '<em>$1</em>')
           .replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links and images
  out = out.replace(/!\[(.*?)\]\((.*?)\)/g, '<img alt="$1" src="$2" />')
           .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
  // Ordered/unordered lists (basic)
  out = out.replace(/^(?:-\s+.*(?:\n-\s+.*)*)/gm, (block) => {
    const items = block.split(/\n/).map((l) => l.replace(/^[-*]\s+/, '')).map((t) => `<li>${t}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  out = out.replace(/^(?:\d+\.\s+.*(?:\n\d+\.\s+.*)*)/gm, (block) => {
    const items = block.split(/\n/).map((l) => l.replace(/^\d+\.\s+/, '')).map((t) => `<li>${t}</li>`).join('');
    return `<ol>${items}</ol>`;
  });
  // Paragraphs and line breaks
  out = out.replace(/^(?!<(h\d|ul|ol|pre|blockquote|img|p|\/))/gm, '<p>')
           .replace(/\n{2,}/g, '</p><p>')
           .replace(/\n/g, '<br/>');
  // Cleanup
  out = out.replace(/(<p>\s*<\/p>)+/g, '')
           .replace(/^<p>/, '')
           .replace(/<p>$/, '');
  return out.trim();
}

// Text highlighting and JSON parsing functions removed - project uses more specialized implementations

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Keyboard shortcut handling
export function handleKeyboardShortcut(
  event: KeyboardEvent,
  shortcuts: Record<string, () => void>
): boolean {
  const key = event.key.toLowerCase();
  const modifiers = [];

  if (event.ctrlKey) modifiers.push('ctrl');
  if (event.altKey) modifiers.push('alt');
  if (event.shiftKey) modifiers.push('shift');
  if (event.metaKey) modifiers.push('meta');

  const shortcutKey = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;

  if (shortcuts[shortcutKey]) {
    event.preventDefault();
    shortcuts[shortcutKey]();
    return true;
  }

  return false;
}

// Error handling
export function createErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

// Deep copy function removed - use structuredClone or specialized clone implementation

/**
 * Generates a consistent HSL color based on a string input.
 * @param str The input string (e.g., a tag name).
 * @returns An HSL color string.
 */
export function generateColorFromString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    // Use the hash to generate HSL values
    const hue = Math.abs(hash) % 360;
    const saturation = 65 + (Math.abs(hash) % 20); // 65-85%
    const lightness = 45 + (Math.abs(hash) % 20);  // 45-65%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get card content by side using template system
 */
export function getCardContentBySide(
    card: Card,
    side: 'front' | 'back',
    allTemplates: any[],
    separator = '\n---\n'
): string {
    // 输入验证：防止空值访问
    if (!card || !card.fields) {
        console.warn('[getCardContentBySide] 无效的卡片数据，返回空字符串');
        return '';
    }
    
    const template = allTemplates?.find(t => t.id === card.templateId);

    // Fallback: if template not found, follow old hardcoded logic
    if (!template || !template.fields) {
        if (side === 'front') {
            return card.fields.front || card.fields.question || '';
        } else {
            return card.fields.back || card.fields.answer || '';
        }
    }

    // Filter fields belonging to the correct "side"
    const relevantFields = template.fields.filter((item: any) => {
        if (item.type !== 'field') return false;

        if (side === 'front') {
            return item.side === 'front' || item.side === 'both';
        } else { // side === 'back'
            return item.side === 'back' || item.side === 'both';
        }
    });

    // If no fields for this side, return empty string
    if (relevantFields.length === 0) {
        return '';
    }

    // Extract content from card.fields and concatenate
    const contentParts = relevantFields
        .map((field: any) => card.fields[field.key])
        .filter(Boolean); // Filter out empty content

    return contentParts.join(separator);
}
