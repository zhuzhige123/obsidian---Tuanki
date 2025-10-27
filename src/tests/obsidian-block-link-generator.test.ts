/**
 * 🧪 ObsidianBlockLinkGenerator 重构后的测试
 * 验证重构后的块链接生成器功能正确性和唯一性保证
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ObsidianBlockLinkGenerator, type BlockLinkResult, type BlockLinkInfo } from '../utils/obsidian-block-link-generator';
import type { TuankiAnnotation } from '../utils/tuanki-annotation-parser';
import { TFile } from 'obsidian';

describe('ObsidianBlockLinkGenerator - 重构后测试', () => {
  let blockLinkGenerator: ObsidianBlockLinkGenerator;
  let mockPlugin: any;
  let mockFile: any;

  beforeEach(() => {
    const mockVaultInstance = {
      getAbstractFileByPath: vi.fn(),
      read: vi.fn(),
      modify: vi.fn()
    };

    mockPlugin = {
      app: {
        vault: mockVaultInstance
      }
    };

    mockFile = new TFile();

    blockLinkGenerator = new ObsidianBlockLinkGenerator(mockPlugin);
  });

  describe('块ID生成和唯一性测试', () => {
    test('应该生成唯一的块ID', async () => {
      const annotation: TuankiAnnotation = {
        content: '测试内容',
        cardContent: '测试卡片内容',
        position: { start: 0, end: 2, line: 1 },
        filePath: 'test.md',
        isNew: true
      };

      const fileContent = `!tuanki 测试问题

测试答案

!/tuanki`;

      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockPlugin.app.vault.read.mockResolvedValue(fileContent);
      mockPlugin.app.vault.modify.mockResolvedValue(undefined);

      const result = await blockLinkGenerator.generateBlockLink(annotation);

      expect(result.success).toBe(true);
      expect(result.blockInfo).toBeDefined();
      expect(result.blockInfo?.blockId).toBeDefined();
      expect(result.blockInfo?.blockId).toMatch(/^[a-zA-Z0-9]{8}$/);
      expect(result.blockInfo?.blockLink).toContain('#^');
      expect(result.fileUpdated).toBe(true);
    });

    test('应该检测并重用现有的块ID', async () => {
      const annotation: TuankiAnnotation = {
        content: '测试内容',
        cardContent: '测试卡片内容',
        position: { start: 0, end: 6, line: 1 },
        filePath: 'test.md',
        isNew: false
      };

      const fileContent = `!tuanki 测试问题

测试答案

^abc123def

!/tuanki`;

      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockPlugin.app.vault.read.mockResolvedValue(fileContent);

      const result = await blockLinkGenerator.generateBlockLink(annotation);

      expect(result.success).toBe(true);
      expect(result.blockInfo?.blockId).toBe('abc123def');
      expect(result.fileUpdated).toBe(false); // 没有更新文件
    });

    test('应该处理块ID冲突并重试', async () => {
      const annotation: TuankiAnnotation = {
        content: '测试内容',
        cardContent: '测试卡片内容',
        position: { start: 0, end: 2, line: 1 },
        filePath: 'test.md',
        isNew: true
      };

      // 模拟文件中已有多个块ID
      const fileContent = `!tuanki 测试问题

测试答案

^abc123de
^def456gh
^hij789kl

!/tuanki`;

      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockPlugin.app.vault.read.mockResolvedValue(fileContent);
      mockPlugin.app.vault.modify.mockResolvedValue(undefined);

      // Mock Math.random 来模拟冲突
      const originalRandom = Math.random;
      let callCount = 0;
      Math.random = jest.fn(() => {
        callCount++;
        // 前几次返回会冲突的值，最后返回不冲突的值
        if (callCount <= 3) {
          return 0.1; // 会生成已存在的ID
        }
        return 0.9; // 生成新的ID
      });

      const result = await blockLinkGenerator.generateBlockLink(annotation);

      expect(result.success).toBe(true);
      expect(result.blockInfo?.blockId).toBeDefined();
      expect(result.fileUpdated).toBe(true);

      // 恢复原始的 Math.random
      Math.random = originalRandom;
    });
  });

  describe('块链接格式测试', () => {
    test('应该生成正确格式的块链接', async () => {
      const annotation: TuankiAnnotation = {
        content: '测试内容',
        cardContent: '测试卡片内容',
        position: { start: 0, end: 2, line: 1 },
        filePath: 'notes/test-file.md',
        isNew: true
      };

      const fileContent = `!tuanki 测试问题

测试答案

!/tuanki`;

      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockPlugin.app.vault.read.mockResolvedValue(fileContent);
      mockPlugin.app.vault.modify.mockResolvedValue(undefined);

      const result = await blockLinkGenerator.generateBlockLink(annotation);

      expect(result.success).toBe(true);
      expect(result.blockInfo?.blockLink).toMatch(/^\[\[notes\/test-file#\^[a-zA-Z0-9]{8}\]\]$/);
      expect(result.blockInfo?.internalLink).toContain('obsidian://open');
      expect(result.blockInfo?.uriLink).toContain('obsidian://open');
    });

    test('应该正确处理不同的文件路径格式', async () => {
      const testCases = [
        { filePath: 'test.md', expected: 'test' },
        { filePath: 'folder/test.md', expected: 'folder/test' },
        { filePath: 'deep/nested/folder/test.md', expected: 'deep/nested/folder/test' }
      ];

      for (const testCase of testCases) {
        const annotation: TuankiAnnotation = {
          content: '测试内容',
          cardContent: '测试卡片内容',
          position: { start: 0, end: 2, line: 1 },
          filePath: testCase.filePath,
          isNew: true
        };

        const fileContent = `!tuanki 测试问题

测试答案

!/tuanki`;

        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);
        mockPlugin.app.vault.read.mockResolvedValue(fileContent);
        mockPlugin.app.vault.modify.mockResolvedValue(undefined);

        const result = await blockLinkGenerator.generateBlockLink(annotation);

        expect(result.success).toBe(true);
        expect(result.blockInfo?.blockLink).toContain(`[[${testCase.expected}#^`);
      }
    });
  });

  describe('错误处理测试', () => {
    test('应该处理文件不存在的情况', async () => {
      const annotation: TuankiAnnotation = {
        content: '测试内容',
        cardContent: '测试卡片内容',
        position: { start: 0, end: 2, line: 1 },
        filePath: 'nonexistent.md',
        isNew: true
      };

      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);

      const result = await blockLinkGenerator.generateBlockLink(annotation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('文件不存在');
      expect(result.fileUpdated).toBe(false);
    });

    test('应该处理无效的标注参数', async () => {
      const annotation: TuankiAnnotation = {
        content: '测试内容',
        cardContent: '测试卡片内容',
        position: { start: 0, end: 2, line: 1 },
        filePath: '', // 无效的文件路径
        isNew: true
      };

      const result = await blockLinkGenerator.generateBlockLink(annotation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('标注参数无效');
      expect(result.fileUpdated).toBe(false);
    });

    test('应该处理文件读取失败', async () => {
      const annotation: TuankiAnnotation = {
        content: '测试内容',
        cardContent: '测试卡片内容',
        position: { start: 0, end: 2, line: 1 },
        filePath: 'test.md',
        isNew: true
      };

      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockPlugin.app.vault.read.mockRejectedValue(new Error('读取失败'));

      const result = await blockLinkGenerator.generateBlockLink(annotation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('生成块链接失败');
      expect(result.fileUpdated).toBe(false);
    });
  });

  describe('插入位置智能检测测试', () => {
    test('应该在正确位置插入块ID', async () => {
      const annotation: TuankiAnnotation = {
        content: '测试内容',
        cardContent: '测试卡片内容',
        position: { start: 0, end: 4, line: 1 },
        filePath: 'test.md',
        isNew: true
      };

      const fileContent = `!tuanki 测试问题

测试答案

!/tuanki

下一段内容`;

      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockPlugin.app.vault.read.mockResolvedValue(fileContent);
      mockPlugin.app.vault.modify.mockResolvedValue(undefined);

      const result = await blockLinkGenerator.generateBlockLink(annotation);

      expect(result.success).toBe(true);
      expect(result.blockInfo?.insertLine).toBeGreaterThan(annotation.position.end);
    });

    test('应该跳过元数据注释', async () => {
      const annotation: TuankiAnnotation = {
        content: '测试内容',
        cardContent: '测试卡片内容',
        position: { start: 0, end: 8, line: 1 },
        filePath: 'test.md',
        isNew: true
      };

      const fileContent = `!tuanki 测试问题

测试答案

<!-- tuanki-uuid: 550e8400-e29b-41d4-a716-446655440000 -->
<!-- tuanki-created: 2025-01-02T12:00:00.000Z -->
<!-- tuanki-modified: 2025-01-02T12:00:00.000Z -->

!/tuanki`;

      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockPlugin.app.vault.read.mockResolvedValue(fileContent);
      mockPlugin.app.vault.modify.mockResolvedValue(undefined);

      const result = await blockLinkGenerator.generateBlockLink(annotation);

      expect(result.success).toBe(true);
      expect(result.blockInfo?.insertLine).toBeGreaterThan(8); // 应该在元数据注释之后
    });
  });
});
