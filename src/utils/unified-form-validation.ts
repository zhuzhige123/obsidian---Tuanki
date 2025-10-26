/**
 * 统一表单验证系统
 * 解决重复的表单验证和字段处理逻辑
 */

import { dispatchUI } from '../architecture/unified-state-management';
import { handleError, createErrorContext } from '../architecture/unified-error-handler';

// ============================================================================
// 验证规则类型定义
// ============================================================================

export interface ValidationRule {
  name: string;
  validator: (value: any, context?: ValidationContext) => ValidationResult;
  message?: string;
  priority?: number;
}

export interface ValidationResult {
  isValid: boolean;
  message?: string;
  code?: string;
  severity?: 'error' | 'warning' | 'info';
}

export interface ValidationContext {
  fieldName: string;
  allFields: Record<string, any>;
  formData: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface FieldValidationConfig {
  rules: ValidationRule[];
  required?: boolean;
  dependencies?: string[];
  transform?: (value: any) => any;
}

export interface FormValidationConfig {
  fields: Record<string, FieldValidationConfig>;
  globalRules?: ValidationRule[];
  stopOnFirstError?: boolean;
  validateOnChange?: boolean;
}

export interface FormValidationState {
  isValid: boolean;
  isValidating: boolean;
  errors: Record<string, string[]>;
  warnings: Record<string, string[]>;
  touched: Record<string, boolean>;
  dirty: Record<string, boolean>;
}

// ============================================================================
// 内置验证规则
// ============================================================================

export const ValidationRules = {
  /**
   * 必填验证
   */
  required: (message = '此字段为必填项'): ValidationRule => ({
    name: 'required',
    validator: (value) => ({
      isValid: value !== null && value !== undefined && String(value).trim() !== '',
      message,
      severity: 'error'
    }),
    priority: 1
  }),

  /**
   * 最小长度验证
   */
  minLength: (min: number, message?: string): ValidationRule => ({
    name: 'minLength',
    validator: (value) => {
      const str = String(value || '');
      return {
        isValid: str.length >= min,
        message: message || `最少需要${min}个字符`,
        severity: 'error'
      };
    },
    priority: 2
  }),

  /**
   * 最大长度验证
   */
  maxLength: (max: number, message?: string): ValidationRule => ({
    name: 'maxLength',
    validator: (value) => {
      const str = String(value || '');
      return {
        isValid: str.length <= max,
        message: message || `最多允许${max}个字符`,
        severity: 'error'
      };
    },
    priority: 2
  }),

  /**
   * 正则表达式验证
   */
  pattern: (regex: RegExp, message = '格式不正确'): ValidationRule => ({
    name: 'pattern',
    validator: (value) => ({
      isValid: !value || regex.test(String(value)),
      message,
      severity: 'error'
    }),
    priority: 3
  }),

  /**
   * 邮箱验证
   */
  email: (message = '请输入有效的邮箱地址'): ValidationRule => ({
    name: 'email',
    validator: (value) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return {
        isValid: !value || emailRegex.test(String(value)),
        message,
        severity: 'error'
      };
    },
    priority: 3
  }),

  /**
   * 数字验证
   */
  numeric: (message = '请输入有效的数字'): ValidationRule => ({
    name: 'numeric',
    validator: (value) => ({
      isValid: !value || !isNaN(Number(value)),
      message,
      severity: 'error'
    }),
    priority: 3
  }),

  /**
   * 数字范围验证
   */
  range: (min: number, max: number, message?: string): ValidationRule => ({
    name: 'range',
    validator: (value) => {
      const num = Number(value);
      return {
        isValid: !value || (!isNaN(num) && num >= min && num <= max),
        message: message || `请输入${min}到${max}之间的数字`,
        severity: 'error'
      };
    },
    priority: 3
  }),

  /**
   * 自定义验证
   */
  custom: (
    validator: (value: any, context?: ValidationContext) => boolean | ValidationResult,
    message = '验证失败'
  ): ValidationRule => ({
    name: 'custom',
    validator: (value, context) => {
      const result = validator(value, context);
      if (typeof result === 'boolean') {
        return {
          isValid: result,
          message,
          severity: 'error'
        };
      }
      return result;
    },
    priority: 4
  }),

  /**
   * 卡片字段验证
   */
  cardField: (message = '卡片字段不能为空'): ValidationRule => ({
    name: 'cardField',
    validator: (value) => {
      const content = String(value || '').trim();
      return {
        isValid: content.length > 0,
        message,
        severity: 'error'
      };
    },
    priority: 1
  }),

  /**
   * Markdown内容验证
   */
  markdownContent: (message = 'Markdown内容格式不正确'): ValidationRule => ({
    name: 'markdownContent',
    validator: (value) => {
      const content = String(value || '').trim();
      // 简单的Markdown格式检查
      const hasValidStructure = content.includes('##') || content.includes('**') || content.length > 10;
      return {
        isValid: !content || hasValidStructure,
        message,
        severity: 'warning'
      };
    },
    priority: 3
  })
};

// ============================================================================
// 表单验证器
// ============================================================================

export class FormValidator {
  private config: FormValidationConfig;
  private state: FormValidationState;

  constructor(config: FormValidationConfig) {
    this.config = config;
    this.state = {
      isValid: true,
      isValidating: false,
      errors: {},
      warnings: {},
      touched: {},
      dirty: {}
    };
  }

  /**
   * 验证单个字段
   */
  async validateField(
    fieldName: string,
    value: any,
    allFields: Record<string, any> = {}
  ): Promise<ValidationResult> {
    const fieldConfig = this.config.fields[fieldName];
    if (!fieldConfig) {
      return { isValid: true };
    }

    try {
      // 应用字段转换
      const transformedValue = fieldConfig.transform ? fieldConfig.transform(value) : value;

      // 创建验证上下文
      const context: ValidationContext = {
        fieldName,
        allFields,
        formData: allFields,
        metadata: {}
      };

      // 执行验证规则
      const rules = [...fieldConfig.rules];
      if (fieldConfig.required) {
        rules.unshift(ValidationRules.required());
      }

      // 按优先级排序
      rules.sort((a, b) => (a.priority || 0) - (b.priority || 0));

      const errors: string[] = [];
      const warnings: string[] = [];

      for (const rule of rules) {
        const result = rule.validator(transformedValue, context);
        
        if (!result.isValid) {
          const message = result.message || rule.message || '验证失败';
          
          if (result.severity === 'warning') {
            warnings.push(message);
          } else {
            errors.push(message);
            
            // 如果配置为遇到第一个错误就停止
            if (this.config.stopOnFirstError) {
              break;
            }
          }
        }
      }

      // 更新状态
      this.state.errors[fieldName] = errors;
      this.state.warnings[fieldName] = warnings;

      return {
        isValid: errors.length === 0,
        message: errors[0] || warnings[0],
        severity: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : undefined
      };
    } catch (error) {
      await handleError(error, createErrorContext('FormValidator', 'validateField', { fieldName }));
      return {
        isValid: false,
        message: '验证过程中发生错误',
        severity: 'error'
      };
    }
  }

  /**
   * 验证整个表单
   */
  async validateForm(formData: Record<string, any>): Promise<FormValidationState> {
    this.state.isValidating = true;

    try {
      // 验证所有字段
      const validationPromises = Object.keys(this.config.fields).map(fieldName =>
        this.validateField(fieldName, formData[fieldName], formData)
      );

      await Promise.all(validationPromises);

      // 执行全局验证规则
      if (this.config.globalRules) {
        for (const rule of this.config.globalRules) {
          const result = rule.validator(formData, {
            fieldName: '_global',
            allFields: formData,
            formData
          });

          if (!result.isValid) {
            this.state.errors['_global'] = this.state.errors['_global'] || [];
            this.state.errors['_global'].push(result.message || '表单验证失败');
          }
        }
      }

      // 计算整体验证状态
      this.state.isValid = Object.values(this.state.errors).every(errors => errors.length === 0);

    } catch (error) {
      await handleError(error, createErrorContext('FormValidator', 'validateForm'));
      this.state.isValid = false;
      this.state.errors['_global'] = ['表单验证过程中发生错误'];
    } finally {
      this.state.isValidating = false;
    }

    return { ...this.state };
  }

  /**
   * 标记字段为已触摸
   */
  markTouched(fieldName: string) {
    this.state.touched[fieldName] = true;
  }

  /**
   * 标记字段为已修改
   */
  markDirty(fieldName: string) {
    this.state.dirty[fieldName] = true;
  }

  /**
   * 清除字段错误
   */
  clearFieldErrors(fieldName: string) {
    delete this.state.errors[fieldName];
    delete this.state.warnings[fieldName];
  }

  /**
   * 清除所有错误
   */
  clearAllErrors() {
    this.state.errors = {};
    this.state.warnings = {};
    this.state.isValid = true;
  }

  /**
   * 获取字段错误
   */
  getFieldErrors(fieldName: string): string[] {
    return this.state.errors[fieldName] || [];
  }

  /**
   * 获取字段警告
   */
  getFieldWarnings(fieldName: string): string[] {
    return this.state.warnings[fieldName] || [];
  }

  /**
   * 获取验证状态
   */
  getState(): FormValidationState {
    return { ...this.state };
  }

  /**
   * 检查字段是否有错误
   */
  hasFieldError(fieldName: string): boolean {
    return (this.state.errors[fieldName] || []).length > 0;
  }

  /**
   * 检查表单是否有错误
   */
  hasErrors(): boolean {
    return !this.state.isValid;
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 快速验证卡片字段
 */
export function validateCardFields(fields: Record<string, string>): ValidationResult {
  const hasContent = Object.values(fields).some(value => String(value || '').trim().length > 0);
  
  return {
    isValid: hasContent,
    message: hasContent ? undefined : '请至少填写一个字段内容',
    severity: 'error'
  };
}

/**
 * 快速验证必填字段
 */
export function validateRequired(value: any, fieldName = '字段'): ValidationResult {
  const isValid = value !== null && value !== undefined && String(value).trim() !== '';
  
  return {
    isValid,
    message: isValid ? undefined : `${fieldName}为必填项`,
    severity: 'error'
  };
}

/**
 * 创建卡片表单验证器
 */
export function createCardFormValidator(): FormValidator {
  return new FormValidator({
    fields: {
      question: {
        rules: [ValidationRules.cardField('问题不能为空')],
        required: true
      },
      answer: {
        rules: [ValidationRules.cardField('答案不能为空')],
        required: true
      },
      tags: {
        rules: [ValidationRules.maxLength(200, '标签长度不能超过200个字符')],
        required: false
      },
      deck: {
        rules: [ValidationRules.required('请选择牌组')],
        required: true
      }
    },
    globalRules: [
      ValidationRules.custom((formData) => {
        return validateCardFields(formData);
      }, '请至少填写问题和答案')
    ],
    stopOnFirstError: false,
    validateOnChange: true
  });
}

/**
 * 创建设置表单验证器
 */
export function createSettingsFormValidator(): FormValidator {
  return new FormValidator({
    fields: {
      defaultDeck: {
        rules: [
          ValidationRules.required('默认牌组不能为空'),
          ValidationRules.minLength(1, '牌组名称至少需要1个字符'),
          ValidationRules.maxLength(50, '牌组名称不能超过50个字符')
        ],
        required: true
      },
      reviewsPerDay: {
        rules: [
          ValidationRules.numeric('请输入有效的数字'),
          ValidationRules.range(1, 1000, '每日复习数量应在1-1000之间')
        ],
        required: true,
        transform: (value) => Number(value)
      },
      learningSteps: {
        rules: [
          ValidationRules.custom((value) => {
            if (!value) return true;
            const steps = String(value).split(/\s+/).map(s => parseInt(s, 10));
            return steps.every(step => !isNaN(step) && step > 0);
          }, '学习步骤必须是正整数，用空格分隔')
        ],
        required: false
      }
    },
    stopOnFirstError: false,
    validateOnChange: true
  });
}
