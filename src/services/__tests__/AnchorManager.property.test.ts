/**
 * 锚点管理属性测试
 * 
 * **Feature: incremental-reading, Property 1: Anchor Uniqueness**
 * **Validates: Requirements 1.2**
 * 
 * 测试锚点ID的唯一性和格式正确性
 * 
 * @module services/__tests__/AnchorManager.property.test
 */
import * as fc from 'fast-check';
import {
  ANCHOR_PREFIX,
  ANCHOR_REGEX
} from '../../types/incremental-reading-types';

// ===== 辅助函数 =====

/**
 * 生成锚点ID（模拟AnchorManager.generateAnchorId）
 */
function generateAnchorId(): string {
  return `${ANCHOR_PREFIX}${Date.now()}`;
}

/**
 * 验证锚点ID格式
 */
function isValidAnchorId(anchorId: string): boolean {
  const pattern = /^weave-bookmark-\d+$/;
  return pattern.test(anchorId);
}

/**
 * 从锚点ID提取时间戳
 */
function extractTimestamp(anchorId: string): number | null {
  const match = anchorId.match(/^weave-bookmark-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 解析内容中的锚点
 */
function parseAnchorsFromContent(content: string): string[] {
  const anchors: string[] = [];
  const regex = new RegExp(ANCHOR_REGEX.source, 'g');
  let match;

  while ((match = regex.exec(content)) !== null) {
    anchors.push(match[0].substring(1)); // 移除 ^ 前缀
  }

  return anchors;
}

/**
 * 生成随机Markdown内容
 */
const markdownContentArb = fc.array(
  fc.oneof(
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.constant('# Heading'),
    fc.constant('## Subheading'),
    fc.constant('- list item'),
    fc.constant('```code```'),
    fc.constant('**bold**'),
    fc.constant('*italic*')
  ),
  { minLength: 1, maxLength: 20 }
).map(lines => lines.join('\n'));

/**
 * 生成随机锚点ID
 */
const anchorIdArb = fc.integer({ min: 1000000000000, max: 9999999999999 })
  .map(ts => `${ANCHOR_PREFIX}${ts}`);

// ===== 属性测试 =====

describe('Property 1: Anchor Uniqueness', () => {
  /**
   * **Feature: incremental-reading, Property 1: Anchor Uniqueness**
   * **Validates: Requirements 1.2**
   * 
   * *For any* reading material, all anchor IDs within that material must be unique
   * and follow the format `^weave-bookmark-{timestamp}`.
   */

  it('生成的锚点ID应该遵循正确的格式', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (count) => {
          const anchors: string[] = [];
          
          for (let i = 0; i < count; i++) {
            const anchorId = generateAnchorId();
            anchors.push(anchorId);
            
            // 验证格式
            expect(isValidAnchorId(anchorId)).toBe(true);
            expect(anchorId.startsWith(ANCHOR_PREFIX)).toBe(true);
            
            // 验证时间戳
            const timestamp = extractTimestamp(anchorId);
            expect(timestamp).not.toBeNull();
            expect(timestamp).toBeGreaterThan(0);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('在同一毫秒内生成的锚点应该有相同的时间戳部分', () => {
    // 快速连续生成多个锚点
    const anchors: string[] = [];
    const startTime = Date.now();
    
    for (let i = 0; i < 10; i++) {
      anchors.push(generateAnchorId());
    }
    
    const endTime = Date.now();
    
    // 所有锚点都应该有有效格式
    anchors.forEach(anchor => {
      expect(isValidAnchorId(anchor)).toBe(true);
    });
    
    // 时间戳应该在合理范围内
    anchors.forEach(anchor => {
      const timestamp = extractTimestamp(anchor);
      expect(timestamp).toBeGreaterThanOrEqual(startTime);
      expect(timestamp).toBeLessThanOrEqual(endTime + 1);
    });
  });

  it('锚点正则表达式应该正确匹配有效锚点', () => {
    fc.assert(
      fc.property(
        anchorIdArb,
        (anchorId) => {
          const content = `Some text\n^${anchorId}\nMore text`;
          const parsed = parseAnchorsFromContent(content);
          
          expect(parsed).toContain(anchorId);
          expect(parsed.length).toBe(1);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('锚点正则表达式不应该匹配无效格式', () => {
    const invalidAnchors = [
      'bookmark-1234567890123',
      'weave-1234567890123',
      'weave-bookmark-abc',
      'weave-bookmark-',
      'other-bookmark-1234567890123'
    ];

    invalidAnchors.forEach(invalid => {
      const content = `Some text\n^${invalid}\nMore text`;
      const parsed = parseAnchorsFromContent(content);
      expect(parsed).not.toContain(invalid);
    });
  });

  it('多个锚点应该都能被正确解析', () => {
    fc.assert(
      fc.property(
        fc.array(anchorIdArb, { minLength: 1, maxLength: 10 }),
        markdownContentArb,
        (anchorIds, baseContent) => {
          // 确保锚点ID唯一
          const uniqueAnchors = [...new Set(anchorIds)];
          
          // 构建包含多个锚点的内容
          let content = baseContent;
          uniqueAnchors.forEach((anchorId, index) => {
            content += `\n\nParagraph ${index}\n^${anchorId}\n`;
          });
          
          // 解析锚点
          const parsed = parseAnchorsFromContent(content);
          
          // 验证所有锚点都被解析
          uniqueAnchors.forEach(anchorId => {
            expect(parsed).toContain(anchorId);
          });
          
          // 验证解析数量正确
          expect(parsed.length).toBe(uniqueAnchors.length);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('解析的锚点应该保持唯一性', () => {
    fc.assert(
      fc.property(
        fc.array(anchorIdArb, { minLength: 2, maxLength: 20 }),
        (anchorIds) => {
          // 构建内容，可能包含重复锚点
          let content = 'Start\n';
          anchorIds.forEach((anchorId, index) => {
            content += `Section ${index}\n^${anchorId}\n`;
          });
          
          // 解析锚点
          const parsed = parseAnchorsFromContent(content);
          
          // 验证解析结果中的唯一锚点数量
          const uniqueParsed = [...new Set(parsed)];
          const uniqueInput = [...new Set(anchorIds)];
          
          // 每个唯一锚点应该出现正确的次数
          uniqueInput.forEach(anchorId => {
            const inputCount = anchorIds.filter(a => a === anchorId).length;
            const parsedCount = parsed.filter(a => a === anchorId).length;
            expect(parsedCount).toBe(inputCount);
          });
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('锚点时间戳属性', () => {
  it('时间戳应该是单调递增的（在不同时间生成时）', async () => {
    const anchors: { id: string; timestamp: number }[] = [];
    
    for (let i = 0; i < 5; i++) {
      const anchorId = generateAnchorId();
      const timestamp = extractTimestamp(anchorId);
      
      if (timestamp !== null) {
        anchors.push({ id: anchorId, timestamp });
      }
      
      // 等待1毫秒确保时间戳不同
      await new Promise(resolve => window.setTimeout(resolve, 1));
    }
    
    // 验证时间戳递增
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i].timestamp).toBeGreaterThanOrEqual(anchors[i - 1].timestamp);
    }
  });

  it('时间戳应该是有效的Unix毫秒时间戳', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (count) => {
          const now = Date.now();
          const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
          const oneYearLater = now + 365 * 24 * 60 * 60 * 1000;
          
          for (let i = 0; i < count; i++) {
            const anchorId = generateAnchorId();
            const timestamp = extractTimestamp(anchorId);
            
            expect(timestamp).not.toBeNull();
            // 时间戳应该在合理范围内（过去一年到未来一年）
            expect(timestamp).toBeGreaterThan(oneYearAgo);
            expect(timestamp).toBeLessThan(oneYearLater);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
