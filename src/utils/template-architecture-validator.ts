/**
 * 模板架构统一性验证器
 * 验证所有模板调用都通过统一模板管理系统
 */

import type AnkiPlugin from '../main';
// 使用现有的预设模板管理器进行验证
import { defaultPresetTemplateManager } from '../templates/preset-templates';

export interface ArchitectureValidationResult {
  isValid: boolean;
  score: number;
  issues: ArchitectureIssue[];
  summary: string;
  recommendations: string[];
}

export interface ArchitectureIssue {
  type: 'error' | 'warning' | 'info';
  category: 'template-bypass' | 'emergency-template' | 'service-usage' | 'consistency';
  message: string;
  location?: string;
  severity: number; // 1-10, 10 being most severe
}

export class TemplateArchitectureValidator {
  private plugin: AnkiPlugin;
  private triadService: any;

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
    this.triadService = getTriadTemplateService(plugin);
  }

  /**
   * 执行完整的架构验证
   */
  async validateArchitecture(): Promise<ArchitectureValidationResult> {
    const issues: ArchitectureIssue[] = [];

    // 1. 验证基础保障模板
    await this.validateEmergencyTemplate(issues);

    // 2. 验证模板服务可用性
    await this.validateTemplateService(issues);

    // 3. 验证统一模板管理
    await this.validateUnifiedTemplateManagement(issues);

    // 4. 验证降级策略
    await this.validateFallbackStrategies(issues);

    // 5. 验证模板一致性
    await this.validateTemplateConsistency(issues);

    // 计算分数和生成摘要
    const score = this.calculateScore(issues);
    const summary = this.generateSummary(issues);
    const recommendations = this.generateRecommendations(issues);

    return {
      isValid: issues.filter(i => i.type === 'error').length === 0,
      score,
      issues,
      summary,
      recommendations
    };
  }

  /**
   * 验证基础保障模板
   */
  private async validateEmergencyTemplate(issues: ArchitectureIssue[]): Promise<void> {
    try {
      // 检查基础保障模板是否存在
      const emergencyTemplate = this.triadService.getEmergencyTemplate();
      if (!emergencyTemplate) {
        issues.push({
          type: 'error',
          category: 'emergency-template',
          message: '基础保障模板不存在',
          severity: 10
        });
        return;
      }

      // 验证基础保障模板完整性
      const isValid = validateEmergencyTemplate();
      if (!isValid) {
        issues.push({
          type: 'error',
          category: 'emergency-template',
          message: '基础保障模板验证失败',
          severity: 9
        });
      } else {
        issues.push({
          type: 'info',
          category: 'emergency-template',
          message: '基础保障模板验证通过',
          severity: 0
        });
      }

      // 检查基础保障模板的字段完整性
      const requiredFields = ['question', 'answer', 'uuid'];
      const templateFields = emergencyTemplate.fieldTemplate.fields.map(f => f.key);
      
      for (const field of requiredFields) {
        if (!templateFields.includes(field)) {
          issues.push({
            type: 'error',
            category: 'emergency-template',
            message: `基础保障模板缺少必需字段: ${field}`,
            severity: 8
          });
        }
      }

    } catch (error) {
      issues.push({
        type: 'error',
        category: 'emergency-template',
        message: `基础保障模板检查失败: ${error.message}`,
        severity: 10
      });
    }
  }

  /**
   * 验证模板服务可用性
   */
  private async validateTemplateService(issues: ArchitectureIssue[]): Promise<void> {
    try {
      // 检查模板服务是否可用
      const isAvailable = await this.triadService.ensureTemplateAvailability();
      if (!isAvailable) {
        issues.push({
          type: 'error',
          category: 'service-usage',
          message: '模板服务不可用',
          severity: 10
        });
        return;
      }

      // 检查模板数量
      const allTemplates = this.triadService.getAllTriadTemplates();
      if (allTemplates.length === 0) {
        issues.push({
          type: 'error',
          category: 'service-usage',
          message: '没有可用的模板',
          severity: 9
        });
      } else {
        issues.push({
          type: 'info',
          category: 'service-usage',
          message: `发现 ${allTemplates.length} 个可用模板`,
          severity: 0
        });
      }

      // 检查官方模板是否存在
      const officialTemplates = allTemplates.filter(t => t.isOfficial);
      if (officialTemplates.length === 0) {
        issues.push({
          type: 'warning',
          category: 'service-usage',
          message: '没有官方模板',
          severity: 5
        });
      }

    } catch (error) {
      issues.push({
        type: 'error',
        category: 'service-usage',
        message: `模板服务检查失败: ${error.message}`,
        severity: 10
      });
    }
  }

  /**
   * 验证统一模板管理
   */
  private async validateUnifiedTemplateManagement(issues: ArchitectureIssue[]): Promise<void> {
    // 这里可以添加更多的统一性检查
    // 例如检查是否所有组件都使用getTriadTemplateService

    try {
      // 检查降级策略是否使用统一模板管理
      const fallbackTemplate = this.triadService.getTemplateWithFallback('non-existent-template');
      if (!fallbackTemplate) {
        issues.push({
          type: 'error',
          category: 'template-bypass',
          message: '降级策略失效',
          severity: 8
        });
      } else {
        issues.push({
          type: 'info',
          category: 'service-usage',
          message: '降级策略正常工作',
          severity: 0
        });
      }

    } catch (error) {
      issues.push({
        type: 'error',
        category: 'service-usage',
        message: `统一模板管理检查失败: ${error.message}`,
        severity: 8
      });
    }
  }

  /**
   * 验证降级策略
   */
  private async validateFallbackStrategies(issues: ArchitectureIssue[]): Promise<void> {
    try {
      // 测试各种降级场景
      const testCases = [
        'non-existent-template',
        '',
        null,
        undefined
      ];

      for (const testCase of testCases) {
        try {
          const result = this.triadService.getTemplateWithFallback(testCase);
          if (!result) {
            issues.push({
              type: 'error',
              category: 'template-bypass',
              message: `降级策略对 "${testCase}" 失效`,
              severity: 7
            });
          }
        } catch (error) {
          issues.push({
            type: 'warning',
            category: 'template-bypass',
            message: `降级策略对 "${testCase}" 抛出异常: ${error.message}`,
            severity: 6
          });
        }
      }

    } catch (error) {
      issues.push({
        type: 'error',
        category: 'template-bypass',
        message: `降级策略检查失败: ${error.message}`,
        severity: 8
      });
    }
  }

  /**
   * 验证模板一致性
   */
  private async validateTemplateConsistency(issues: ArchitectureIssue[]): Promise<void> {
    try {
      const allTemplates = this.triadService.getAllTriadTemplates();
      
      for (const template of allTemplates) {
        // 检查三位一体结构完整性
        if (!template.fieldTemplate || !template.markdownTemplate || !template.regexParseTemplate) {
          issues.push({
            type: 'error',
            category: 'consistency',
            message: `模板 "${template.name}" 缺少三位一体组件`,
            severity: 7
          });
        }

        // 检查字段一致性
        if (template.fieldTemplate && template.markdownTemplate) {
          const fieldKeys = template.fieldTemplate.fields
            ?.filter(f => f.type === 'field')
            .map(f => f.key) || [];
          
          const markdownPlaceholders = (template.markdownTemplate.markdownContent?.match(/\{\{([^}]+)\}\}/g) || [])
            .map(p => p.replace(/[{}]/g, ''));

          for (const key of fieldKeys) {
            if (!markdownPlaceholders.includes(key)) {
              issues.push({
                type: 'warning',
                category: 'consistency',
                message: `模板 "${template.name}" 的字段 "${key}" 在Markdown中未使用`,
                severity: 3
              });
            }
          }
        }
      }

    } catch (error) {
      issues.push({
        type: 'error',
        category: 'consistency',
        message: `模板一致性检查失败: ${error.message}`,
        severity: 7
      });
    }
  }

  /**
   * 计算架构分数
   */
  private calculateScore(issues: ArchitectureIssue[]): number {
    let totalDeduction = 0;
    
    for (const issue of issues) {
      switch (issue.type) {
        case 'error':
          totalDeduction += issue.severity * 2;
          break;
        case 'warning':
          totalDeduction += issue.severity;
          break;
        case 'info':
          // info不扣分
          break;
      }
    }

    return Math.max(0, 100 - totalDeduction);
  }

  /**
   * 生成验证摘要
   */
  private generateSummary(issues: ArchitectureIssue[]): string {
    const errors = issues.filter(i => i.type === 'error').length;
    const warnings = issues.filter(i => i.type === 'warning').length;
    const infos = issues.filter(i => i.type === 'info').length;

    if (errors === 0 && warnings === 0) {
      return `架构验证通过！发现 ${infos} 个正常状态。`;
    } else if (errors === 0) {
      return `架构基本正常，但有 ${warnings} 个警告需要关注。`;
    } else {
      return `架构存在问题：${errors} 个错误，${warnings} 个警告。需要立即修复。`;
    }
  }

  /**
   * 生成改进建议
   */
  private generateRecommendations(issues: ArchitectureIssue[]): string[] {
    const recommendations: string[] = [];
    
    const errorsByCategory = issues
      .filter(i => i.type === 'error')
      .reduce((acc, issue) => {
        acc[issue.category] = (acc[issue.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    if (errorsByCategory['emergency-template']) {
      recommendations.push('修复基础保障模板问题，确保系统稳定性');
    }

    if (errorsByCategory['service-usage']) {
      recommendations.push('检查模板服务配置，确保服务正常运行');
    }

    if (errorsByCategory['template-bypass']) {
      recommendations.push('消除绕过模板系统的代码路径');
    }

    if (errorsByCategory['consistency']) {
      recommendations.push('修复模板一致性问题，确保三位一体结构完整');
    }

    if (recommendations.length === 0) {
      recommendations.push('架构状态良好，继续保持最佳实践');
    }

    return recommendations;
  }
}

/**
 * 快速验证函数
 */
export async function validateTemplateArchitecture(plugin: AnkiPlugin): Promise<ArchitectureValidationResult> {
  const validator = new TemplateArchitectureValidator(plugin);
  return await validator.validateArchitecture();
}
