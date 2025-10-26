/**
 * 🧪 BatchProcessor 测试
 * 验证批量处理器的功能正确性
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { BatchProcessor, type BatchProcessOptions, type BatchProcessResult } from '../utils/batch-processor';
import { TFile } from 'obsidian';

// Mock dependencies
const mockIntegrityChecker = {
  checkFileIntegrity: vi.fn(),
  repairAnnotation: vi.fn()
};

const mockOrphanedCardManager = {
  batchCheckFile: vi.fn(),
  batchProcessOrphanedCards: vi.fn(),
  detectOrphanedCards: vi.fn()
};

vi.mock('../utils/annotation-integrity-checker', () => ({
  AnnotationIntegrityChecker: vi.fn().mockImplementation(() => mockIntegrityChecker)
}));

vi.mock('../utils/orphaned-card-manager', () => ({
  OrphanedCardManager: vi.fn().mockImplementation(() => mockOrphanedCardManager)
}));

describe('BatchProcessor 测试', () => {
  let batchProcessor: BatchProcessor;
  let mockPlugin: any;

  beforeEach(() => {
    const mockVault = {
      getMarkdownFiles: vi.fn(),
      getAbstractFileByPath: vi.fn()
    };

    mockPlugin = {
      app: {
        vault: mockVault
      }
    };

    batchProcessor = new BatchProcessor(mockPlugin);

    // 重置 mocks
    vi.clearAllMocks();
  });

  describe('批量完整性检查', () => {
    test('应该正确执行批量完整性检查', async () => {
      const mockFiles = [
        { path: 'file1.md' },
        { path: 'file2.md' }
      ];

      const mockIntegrityResult = {
        filePath: 'file1.md',
        annotationReports: [],
        totalIssues: 2,
        autoFixableIssues: 1,
        checkedAt: '2025-01-02T12:00:00.000Z'
      };

      mockPlugin.app.vault.getMarkdownFiles.mockReturnValue(mockFiles);
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(new TFile());
      mockIntegrityChecker.checkFileIntegrity.mockResolvedValue(mockIntegrityResult);

      const options: BatchProcessOptions = {
        checkIntegrity: true,
        repairIssues: false,
        maxConcurrent: 1
      };

      const result = await batchProcessor.processBatch(options);

      expect(result.summary.totalFiles).toBe(2);
      expect(result.summary.totalIssuesFound).toBe(4); // 2 files × 2 issues each
      expect(mockIntegrityChecker.checkFileIntegrity).toHaveBeenCalledTimes(2);
    });

    test('应该正确执行自动修复', async () => {
      const mockFiles = [{ path: 'file1.md' }];

      const mockIntegrityResult = {
        filePath: 'file1.md',
        annotationReports: [{
          annotation: { uuid: 'test-uuid', filePath: 'file1.md' },
          issues: [{ type: 'missing-uuid', autoFixable: true }],
          needsRepair: true
        }],
        totalIssues: 1,
        autoFixableIssues: 1,
        checkedAt: '2025-01-02T12:00:00.000Z'
      };

      const mockRepairResult = {
        success: true,
        repairedCount: 1,
        failedRepairs: [],
        fileUpdated: true
      };

      mockPlugin.app.vault.getMarkdownFiles.mockReturnValue(mockFiles);
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(new TFile());
      mockIntegrityChecker.checkFileIntegrity.mockResolvedValue(mockIntegrityResult);
      mockIntegrityChecker.repairAnnotation.mockResolvedValue(mockRepairResult);

      const options: BatchProcessOptions = {
        checkIntegrity: true,
        repairIssues: true,
        maxConcurrent: 1
      };

      const result = await batchProcessor.processBatch(options);

      expect(result.summary.totalIssuesRepaired).toBe(1);
      expect(mockIntegrityChecker.repairAnnotation).toHaveBeenCalledTimes(1);
    });
  });

  describe('批量孤立卡片检测', () => {
    test('应该正确检测孤立卡片', async () => {
      const mockFiles = [{ path: 'file1.md' }];

      const mockOrphanedResult = {
        filePath: 'file1.md',
        totalAnnotations: 3,
        completeAnnotations: 2,
        incompleteAnnotations: 1,
        issues: [{
          annotation: { uuid: 'orphaned-uuid', filePath: 'file1.md' }
        }],
        repairSummary: {
          uuidsAdded: 0,
          timestampsAdded: 0,
          blockLinksAdded: 0,
          totalRepairs: 0
        }
      };

      mockPlugin.app.vault.getMarkdownFiles.mockReturnValue(mockFiles);
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(new TFile());
      mockOrphanedCardManager.batchCheckFile.mockResolvedValue(mockOrphanedResult);

      const options: BatchProcessOptions = {
        detectOrphaned: true,
        markOrphaned: false,
        maxConcurrent: 1
      };

      const result = await batchProcessor.processBatch(options);

      expect(result.summary.totalOrphanedCards).toBe(1);
      expect(mockOrphanedCardManager.batchCheckFile).toHaveBeenCalledTimes(1);
    });

    test('应该正确标记孤立卡片', async () => {
      const mockFiles = [{ path: 'file1.md' }];

      const mockOrphanedResult = {
        filePath: 'file1.md',
        totalAnnotations: 3,
        completeAnnotations: 2,
        incompleteAnnotations: 1,
        issues: [{
          annotation: { uuid: 'orphaned-uuid', filePath: 'file1.md' }
        }],
        repairSummary: {
          uuidsAdded: 0,
          timestampsAdded: 0,
          blockLinksAdded: 0,
          totalRepairs: 0
        }
      };

      const mockMarkResult = {
        successful: 1,
        failed: 0,
        errors: []
      };

      mockPlugin.app.vault.getMarkdownFiles.mockReturnValue(mockFiles);
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(new TFile());
      mockOrphanedCardManager.batchCheckFile.mockResolvedValue(mockOrphanedResult);
      mockOrphanedCardManager.batchProcessOrphanedCards.mockResolvedValue(mockMarkResult);

      const options: BatchProcessOptions = {
        detectOrphaned: true,
        markOrphaned: true,
        maxConcurrent: 1
      };

      const result = await batchProcessor.processBatch(options);

      expect(result.summary.totalMarkedCards).toBe(1);
      expect(mockOrphanedCardManager.batchProcessOrphanedCards).toHaveBeenCalledWith('mark', ['orphaned-uuid']);
    });
  });

  describe('快速检查功能', () => {
    test('应该正确执行快速完整性检查', async () => {
      const mockFiles = [{ path: 'file1.md' }];

      const mockIntegrityResult = {
        filePath: 'file1.md',
        annotationReports: [{
          annotation: { uuid: 'test-uuid' },
          issues: [
            { severity: 'critical', autoFixable: true },
            { severity: 'warning', autoFixable: false }
          ],
          needsRepair: true
        }],
        totalIssues: 2,
        autoFixableIssues: 1,
        checkedAt: '2025-01-02T12:00:00.000Z'
      };

      mockPlugin.app.vault.getMarkdownFiles.mockReturnValue(mockFiles);
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(new TFile());
      mockIntegrityChecker.checkFileIntegrity.mockResolvedValue(mockIntegrityResult);

      const result = await batchProcessor.quickIntegrityCheck();

      expect(result.totalFiles).toBe(1);
      expect(result.totalIssues).toBe(2);
      expect(result.criticalIssues).toBe(1);
      expect(result.autoFixableIssues).toBe(1);
      expect(result.summary).toContain('检查了 1 个文件');
    });

    test('应该正确执行快速孤立卡片检测', async () => {
      const mockDetectionResult = {
        totalCards: 10,
        orphanedCards: [
          { reason: 'FILE_DELETED' },
          { reason: 'ANNOTATION_DELETED' },
          { reason: 'FILE_DELETED' }
        ],
        healthyCards: 7,
        detectionTime: '2025-01-02T12:00:00.000Z',
        summary: {
          fileDeleted: 2,
          annotationDeleted: 1,
          fileMoved: 0,
          contentChanged: 0
        }
      };

      mockOrphanedCardManager.detectOrphanedCards.mockResolvedValue(mockDetectionResult);

      const result = await batchProcessor.quickOrphanedCheck();

      expect(result.totalCards).toBe(10);
      expect(result.orphanedCards).toBe(3);
      expect(result.byReason['FILE_DELETED']).toBe(2);
      expect(result.byReason['ANNOTATION_DELETED']).toBe(1);
      expect(result.summary).toContain('检查了 10 个卡片');
    });
  });

  describe('一键修复功能', () => {
    test('应该正确执行一键修复（预览模式）', async () => {
      const mockFiles = [{ path: 'file1.md' }];

      const mockIntegrityResult = {
        filePath: 'file1.md',
        annotationReports: [{
          annotation: { uuid: 'test-uuid' },
          issues: [{ autoFixable: true }],
          needsRepair: true
        }],
        totalIssues: 1,
        autoFixableIssues: 1,
        checkedAt: '2025-01-02T12:00:00.000Z'
      };

      const mockOrphanedResult = {
        filePath: 'file1.md',
        incompleteAnnotations: 1,
        issues: [{ annotation: { uuid: 'orphaned-uuid' } }]
      };

      mockPlugin.app.vault.getMarkdownFiles.mockReturnValue(mockFiles);
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue({ path: 'file1.md' });
      mockIntegrityChecker.checkFileIntegrity.mockResolvedValue(mockIntegrityResult);
      mockOrphanedCardManager.batchCheckFile.mockResolvedValue(mockOrphanedResult);

      const result = await batchProcessor.oneClickFix({
        repairIntegrity: true,
        markOrphaned: true,
        dryRun: true
      });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('预览模式');
      expect(result.details.filesProcessed).toBe(1);
    });

    test('应该正确执行一键修复（实际执行）', async () => {
      const mockFiles = [{ path: 'file1.md' }];

      const mockIntegrityResult = {
        filePath: 'file1.md',
        annotationReports: [{
          annotation: { uuid: 'test-uuid' },
          issues: [{ autoFixable: true }],
          needsRepair: true
        }],
        totalIssues: 1,
        autoFixableIssues: 1,
        checkedAt: '2025-01-02T12:00:00.000Z'
      };

      const mockRepairResult = {
        success: true,
        repairedCount: 1,
        failedRepairs: [],
        fileUpdated: true
      };

      const mockOrphanedResult = {
        filePath: 'file1.md',
        incompleteAnnotations: 1,
        issues: [{ annotation: { uuid: 'orphaned-uuid' } }]
      };

      const mockMarkResult = {
        successful: 1,
        failed: 0,
        errors: []
      };

      mockPlugin.app.vault.getMarkdownFiles.mockReturnValue(mockFiles);
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue({ path: 'file1.md' });
      mockIntegrityChecker.checkFileIntegrity.mockResolvedValue(mockIntegrityResult);
      mockIntegrityChecker.repairAnnotation.mockResolvedValue(mockRepairResult);
      mockOrphanedCardManager.batchCheckFile.mockResolvedValue(mockOrphanedResult);
      mockOrphanedCardManager.batchProcessOrphanedCards.mockResolvedValue(mockMarkResult);

      const result = await batchProcessor.oneClickFix({
        repairIntegrity: true,
        markOrphaned: true,
        dryRun: false
      });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('修复完成');
      expect(result.details.issuesRepaired).toBe(1);
      expect(result.details.cardsMarked).toBe(1);
    });
  });

  describe('错误处理', () => {
    test('应该正确处理文件处理错误', async () => {
      const mockFiles = [{ path: 'file1.md' }];

      mockPlugin.app.vault.getMarkdownFiles.mockReturnValue(mockFiles);
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue({ path: 'file1.md' });
      mockIntegrityChecker.checkFileIntegrity.mockRejectedValue(new Error('检查失败'));

      const options: BatchProcessOptions = {
        checkIntegrity: true,
        maxConcurrent: 1
      };

      const result = await batchProcessor.processBatch(options);

      expect(result.summary.failedFiles).toBe(1);
      expect(result.summary.successfulFiles).toBe(0);
      expect(result.fileResults[0].success).toBe(false);
      expect(result.fileResults[0].error).toContain('完整性检查失败');
    });

    test('应该正确处理批量处理异常', async () => {
      mockPlugin.app.vault.getMarkdownFiles.mockImplementation(() => {
        throw new Error('获取文件列表失败');
      });

      const options: BatchProcessOptions = {
        checkIntegrity: true
      };

      const result = await batchProcessor.processBatch(options);

      expect(result.summary.totalFiles).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('批量处理失败');
    });
  });

  describe('进度回调', () => {
    test('应该正确调用进度回调', async () => {
      const mockFiles = [{ path: 'file1.md' }];
      const progressCallback = vi.fn();
      const fileCompleteCallback = vi.fn();

      const mockIntegrityResult = {
        filePath: 'file1.md',
        annotationReports: [],
        totalIssues: 0,
        autoFixableIssues: 0,
        checkedAt: '2025-01-02T12:00:00.000Z'
      };

      mockPlugin.app.vault.getMarkdownFiles.mockReturnValue(mockFiles);
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue({ path: 'file1.md' });
      mockIntegrityChecker.checkFileIntegrity.mockResolvedValue(mockIntegrityResult);

      const options: BatchProcessOptions = {
        checkIntegrity: true,
        maxConcurrent: 1,
        onProgress: progressCallback,
        onFileComplete: fileCompleteCallback
      };

      await batchProcessor.processBatch(options);

      expect(progressCallback).toHaveBeenCalled();
      expect(fileCompleteCallback).toHaveBeenCalledWith('file1.md', expect.any(Object));
    });
  });
});
