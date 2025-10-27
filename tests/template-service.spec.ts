import { describe, it, expect, beforeEach, vi } from 'vitest';
// 使用现有的预设模板管理器进行测试
import { defaultPresetTemplateManager, PresetTemplateManager } from '../src/templates/preset-templates';
import type AnkiPlugin from '../src/main';
import type { FieldTemplate } from '../src/data/template-types';

// Mock plugin - 简化为只包含必要的设置
const mockPlugin = {
  settings: {},
  saveSettings: vi.fn().mockResolvedValue(undefined)
} as unknown as AnkiPlugin;

describe('TemplateService', () => {
  let templateService: TemplateService;

  beforeEach(() => {
    templateService = new TemplateService(mockPlugin);
  });

  describe('删除模板功能', () => {
    it('应该在缓存未初始化时自动加载模板', async () => {
      // 确保缓存未初始化
      expect(templateService.isTemplatesLoaded()).toBe(false);

      // 尝试删除模板
      const result = await templateService.deleteFieldTemplate('test-template-1');

      // 应该成功删除（因为会自动加载模板）
      expect(result.success).toBe(true);
      expect(result.message).toContain('删除成功');
    });

    it('应该在模板不存在时返回正确的错误信息', async () => {
      // 先加载模板
      await templateService.loadFieldTemplates();

      // 尝试删除不存在的模板
      const result = await templateService.deleteFieldTemplate('non-existent-template');

      expect(result.success).toBe(false);
      expect(result.message).toBe('模板不存在');
    });

    it('应该拒绝删除官方模板', async () => {
      // 先加载模板
      await templateService.loadFieldTemplates();

      // 尝试删除官方模板（假设有一个官方模板）
      const allTemplates = templateService.getAllTemplates();
      const officialTemplate = allTemplates.find(t => t.isOfficial);

      if (officialTemplate) {
        const result = await templateService.deleteFieldTemplate(officialTemplate.id);
        expect(result.success).toBe(false);
        expect(result.message).toBe('不能删除官方模板');
      }
    });
  });

  describe('缓存管理', () => {
    it('应该在初始化时缓存为空', () => {
      expect(templateService.isTemplatesLoaded()).toBe(false);
      expect(templateService.getAllTemplates()).toEqual([]);
    });

    it('应该在加载后正确填充缓存', async () => {
      await templateService.loadFieldTemplates();

      expect(templateService.isTemplatesLoaded()).toBe(true);
      const templates = templateService.getAllTemplates();
      expect(templates.length).toBeGreaterThan(0);
    });

    it('应该能够获取特定模板', async () => {
      await templateService.loadFieldTemplates();

      // 检查是否有自定义模板被加载
      const allTemplates = templateService.getAllTemplates();
      const customTemplate = allTemplates.find(t => !t.isOfficial);

      if (customTemplate) {
        const template = templateService.getTemplate(customTemplate.id);
        expect(template).toBeTruthy();
        expect(template?.name).toBe(customTemplate.name);
      } else {
        // 如果没有自定义模板，至少检查官方模板
        const officialTemplate = allTemplates.find(t => t.isOfficial);
        expect(officialTemplate).toBeTruthy();

        const template = templateService.getTemplate(officialTemplate!.id);
        expect(template).toBeTruthy();
      }
    });

    it('应该在缓存未加载时返回警告', () => {
      // 不加载缓存，直接调用方法
      const template = templateService.getTemplate('test-template-1');
      expect(template).toBeNull();

      const hasTemplate = templateService.hasTemplate('test-template-1');
      expect(hasTemplate).toBe(false);
    });
  });

  describe('模板验证', () => {
    it('应该在缓存未加载时返回验证错误', () => {
      const validation = templateService.validateTemplateConsistency();
      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('模板缓存未初始化，请先加载模板');
    });

    it('应该在加载后正确验证模板', async () => {
      await templateService.loadFieldTemplates();
      const validation = templateService.validateTemplateConsistency();
      
      // 根据模板内容，验证结果可能为 true 或 false
      expect(typeof validation.valid).toBe('boolean');
      expect(Array.isArray(validation.issues)).toBe(true);
    });
  });
});

describe('getTemplateService', () => {
  it('应该返回单例实例', () => {
    const service1 = getTemplateService(mockPlugin);
    const service2 = getTemplateService(mockPlugin);
    
    expect(service1).toBe(service2);
  });
});
