/**
 * Tuanki标注系统集成测试
 * 测试整个标注功能的端到端流程
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TuankiAnnotationSystem } from '../TuankiAnnotationSystem';
import { AnnotationDetector } from '../AnnotationDetector';
import { ContentExtractor } from '../ContentExtractor';
import { MetadataGenerator } from '../MetadataGenerator';
import { CardCreationBridge } from '../CardCreationBridge';
import { DocumentModifier } from '../DocumentModifier';
import { SyncManager } from '../SyncManager';
import { AnnotationFileWatcher } from '../AnnotationFileWatcher';

// Mock Obsidian API
const mockVault = {
  getAbstractFileByPath: vi.fn(),
  read: vi.fn(),
  modify: vi.fn(),
  getMarkdownFiles: vi.fn(() => []),
  on: vi.fn(),
  off: vi.fn(),
  offref: vi.fn()
};

const mockPlugin = {
  app: {
    vault: mockVault,
    workspace: {
      getActiveFile: vi.fn(),
      trigger: vi.fn()
    }
  }
};

const mockServices = {
  dataStorage: {
    saveCard: vi.fn()
  },
  deckService: {
    findByName: vi.fn(),
    create: vi.fn()
  },
  templateService: {
    findByName: vi.fn(),
    getBasic: vi.fn()
  },
  fsrs: {
    createCard: vi.fn(() => ({
      due: new Date().toISOString(),
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null
    }))
  }
};

describe('TuankiAnnotationSystem Integration Tests', () => {
  let annotationSystem: TuankiAnnotationSystem;
  let testMarkdownContent: string;

  beforeEach(async () => {
    // 重置所有单例实例
    vi.clearAllMocks();
    
    // 获取系统实例
    annotationSystem = TuankiAnnotationSystem.getInstance();
    
    // 初始化系统
    await annotationSystem.initialize({
      plugin: mockPlugin as any,
      vault: mockVault as any,
      ...mockServices
    });

    // 测试用的Markdown内容
    testMarkdownContent = `
# 测试文档

这是一些普通内容。

> [!tuanki]
> #### JavaScript数组方法
> 
> 在JavaScript中，使用什么方法可以创建一个新数组？
> 
> **答案**: 使用map()方法可以创建一个新数组，其结果是该数组中的每个元素都调用一个提供的函数后返回的结果。
> 
> #JavaScript/基础问答

更多内容...

> [!tuanki]
> #### 挖空练习
> 
> JavaScript中的 ==map()== 方法用于 ==创建新数组==。
> 
> #JavaScript/挖空题
`;
  });

  afterEach(async () => {
    await annotationSystem.destroy();
  });

  describe('标注检测功能', () => {
    it('应该能够检测到文档中的tuanki标注', async () => {
      // Mock文件读取
      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'test.md' });
      mockVault.read.mockResolvedValue(testMarkdownContent);

      const result = await annotationSystem.detectAnnotations('test.md');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].cardContent).toContain('JavaScript数组方法');
      expect(result.data![1].cardContent).toContain('挖空练习');
    });

    it('应该能够正确解析牌组和模板信息', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'test.md' });
      mockVault.read.mockResolvedValue(testMarkdownContent);

      const result = await annotationSystem.detectAnnotations('test.md');

      expect(result.success).toBe(true);
      expect(result.data![0].deckTemplate.deckName).toBe('JavaScript');
      expect(result.data![0].deckTemplate.templateName).toBe('基础问答');
      expect(result.data![1].deckTemplate.deckName).toBe('JavaScript');
      expect(result.data![1].deckTemplate.templateName).toBe('挖空题');
    });
  });

  describe('卡片创建功能', () => {
    it('应该能够从标注创建卡片', async () => {
      // Mock文件和服务
      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'test.md' });
      mockVault.read.mockResolvedValue(testMarkdownContent);
      mockServices.dataStorage.saveCard.mockResolvedValue({
        id: 'card-123',
        uuid: 'uuid-123'
      });

      const result = await annotationSystem.syncFile('test.md');

      expect(result.success).toBe(true);
      expect(result.data!.successCount).toBeGreaterThan(0);
      expect(mockServices.dataStorage.saveCard).toHaveBeenCalled();
    });

    it('应该能够处理不同类型的内容', async () => {
      const clozeContent = `
> [!tuanki]
> JavaScript中的 ==map()== 方法用于 ==创建新数组==。
> #JavaScript/挖空题
`;

      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'cloze.md' });
      mockVault.read.mockResolvedValue(clozeContent);

      const result = await annotationSystem.detectAnnotations('cloze.md');

      expect(result.success).toBe(true);
      expect(result.data![0].cardContent).toContain('==map()==');
      expect(result.data![0].cardContent).toContain('==创建新数组==');
    });
  });

  describe('文档修改功能', () => {
    it('应该能够在标注中插入元数据', async () => {
      const originalContent = `
> [!tuanki]
> #### 测试问题
> 这是一个测试问题
> #测试/基础
`;

      const expectedModifiedContent = `
> [!tuanki]
> #### 测试问题
> 这是一个测试问题
> #测试/基础
>
> ^test-block-id
> uuid: test-uuid-123
> created: 2025-01-15T10:00:00.000Z
> modified: 2025-01-15T10:00:00.000Z
> version: 1
`;

      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'test.md' });
      mockVault.read.mockResolvedValue(originalContent);
      mockVault.modify.mockResolvedValue(undefined);

      const result = await annotationSystem.syncFile('test.md');

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalled();
    });
  });

  describe('批量处理功能', () => {
    it('应该能够批量处理多个文件', async () => {
      const files = ['file1.md', 'file2.md', 'file3.md'];
      
      mockVault.getAbstractFileByPath.mockImplementation((path) => ({ path }));
      mockVault.read.mockResolvedValue(testMarkdownContent);
      mockServices.dataStorage.saveCard.mockResolvedValue({
        id: 'card-123',
        uuid: 'uuid-123'
      });

      const result = await annotationSystem.syncMultipleFiles(files);

      expect(result.success).toBe(true);
      expect(result.data!.totalProcessed).toBeGreaterThan(0);
    });

    it('应该能够处理部分失败的情况', async () => {
      const files = ['good.md', 'bad.md'];
      
      mockVault.getAbstractFileByPath.mockImplementation((path) => {
        if (path === 'bad.md') return null; // 模拟文件不存在
        return { path };
      });
      mockVault.read.mockResolvedValue(testMarkdownContent);

      const result = await annotationSystem.syncMultipleFiles(files);

      expect(result.success).toBe(true);
      expect(result.data!.failureCount).toBeGreaterThan(0);
      expect(result.data!.successCount).toBeGreaterThan(0);
    });
  });

  describe('错误处理', () => {
    it('应该能够处理无效的标注格式', async () => {
      const invalidContent = `
> [!tuanki]
> 这是一个没有足够内容的标注
`;

      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'invalid.md' });
      mockVault.read.mockResolvedValue(invalidContent);

      const result = await annotationSystem.detectAnnotations('invalid.md');

      expect(result.success).toBe(true);
      // 应该能检测到但可能在后续处理中被过滤
    });

    it('应该能够处理文件读取错误', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      const result = await annotationSystem.detectAnnotations('nonexistent.md');

      expect(result.success).toBe(false);
      expect(result.error).toContain('文件不存在');
    });
  });

  describe('性能测试', () => {
    it('应该能够在合理时间内处理大量标注', async () => {
      // 生成包含多个标注的大文档
      const largeContent = Array.from({ length: 50 }, (_, i) => `
> [!tuanki]
> #### 问题 ${i + 1}
> 这是第 ${i + 1} 个问题的内容
> #测试/批量
`).join('\n\n');

      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'large.md' });
      mockVault.read.mockResolvedValue(largeContent);

      const startTime = Date.now();
      const result = await annotationSystem.detectAnnotations('large.md');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(50);
      expect(endTime - startTime).toBeLessThan(5000); // 应该在5秒内完成
    });
  });

  describe('系统状态管理', () => {
    it('应该能够正确报告系统状态', () => {
      const state = annotationSystem.getSystemState();

      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('isProcessing');
      expect(state).toHaveProperty('stats');
      expect(state.stats).toHaveProperty('totalDetected');
      expect(state.stats).toHaveProperty('totalProcessed');
      expect(state.stats).toHaveProperty('successRate');
    });

    it('应该能够更新配置', () => {
      const newConfig = {
        autoDetectionEnabled: false,
        maxConcurrentTasks: 5
      };

      annotationSystem.updateConfig(newConfig);
      const config = annotationSystem.getConfig();

      expect(config.autoDetectionEnabled).toBe(false);
      expect(config.maxConcurrentTasks).toBe(5);
    });
  });

  describe('健康检查', () => {
    it('应该能够报告系统健康状态', () => {
      const health = annotationSystem.getHealthStatus();

      expect(health).toHaveProperty('isHealthy');
      expect(health).toHaveProperty('issues');
      expect(health).toHaveProperty('uptime');
      expect(Array.isArray(health.issues)).toBe(true);
    });
  });
});
