/**
 * 字段处理工具函数
 * 
 * 处理卡片字段内容的渲染和格式化
 */

import type { ParseTemplate } from "../../types/newCardParsingTypes";
import { processClozeText } from "./studyInterfaceUtils";
import type AnkiPlugin from "../../main";

/**
 * 字段处理选项
 */
interface FieldProcessingOptions {
  side: 'front' | 'back';
  showAnswer: boolean;
  plugin?: AnkiPlugin;
}

/**
 * 处理默认字段内容
 * 
 * 当没有模板或模板字段为空时的降级方案
 * 
 * @param fields - 字段对象
 * @param options - 处理选项
 * @returns HTML字符串
 */
function handleDefaultFieldContent(
  fields: Record<string, any>,
  options: FieldProcessingOptions
): string {
  const { side, showAnswer, plugin } = options;

  try {
    let content = '';

    // 根据side选择对应字段
    if (side === 'front') {
      content = fields.front || fields.question || '';
    } else {
      content = fields.back || fields.answer || '';
    }

    // 如果主字段为空，尝试其他可用字段
    if (!content || !content.trim()) {
      const availableFields = Object.keys(fields).filter(k => {
        const value = fields[k];
        return !['templateId', 'templateName', 'notes'].includes(k) &&
               value &&
               typeof value === 'string' &&
               value.trim();
      });

      if (availableFields.length > 0) {
        console.log(`handleDefaultFieldContent: using first available field: ${availableFields[0]}`);
        content = String(fields[availableFields[0]]);
      } else {
        console.log('handleDefaultFieldContent: no content found in any field');
        return `<div class="field-container error-field">
                  <div class="field-label">无内容</div>
                  <div class="field-content">该卡片没有${side === 'front' ? '问题' : '答案'}内容</div>
                </div>`;
      }
    }

    // 应用挖空处理
    const processedContent = processClozeText(content, side, showAnswer, plugin);

    // 为默认字段添加标签
    const label = side === 'front' ? '问题' : '答案';
    return `<div class="field-container default-field">
              <div class="field-label">${label}</div>
              <div class="field-content">${processedContent}</div>
            </div>`;

  } catch (error) {
    console.error('handleDefaultFieldContent: error processing default fields', error);
    return `<div class="field-container error-field">
              <div class="field-label">处理错误</div>
              <div class="field-content">默认字段处理失败</div>
            </div>`;
  }
}

/**
 * 处理模板字段内容
 * 
 * 根据模板定义渲染字段
 * 
 * @param fields - 字段对象
 * @param template - 模板定义
 * @param options - 处理选项
 * @returns HTML字符串
 */
function handleTemplateFieldContent(
  fields: Record<string, any>,
  template: any,
  options: FieldProcessingOptions
): string {
  const { side, showAnswer, plugin } = options;

  try {
    // 验证模板结构
    if (!template || !template.fields || !Array.isArray(template.fields)) {
      console.error('handleTemplateFieldContent: invalid template structure', template);
      return handleDefaultFieldContent(fields, options);
    }

    console.log(`handleTemplateFieldContent: using template ${template.name}`);

    // 根据模板组合字段
    const relevantFields = template.fields
      .filter((f: any) => {
        try {
          return f && f.type === 'field' && (f.side === side || f.side === 'both');
        } catch (error) {
          console.warn('handleTemplateFieldContent: field filter error', error);
          return false;
        }
      })
      .filter((f: any) => {
        try {
          const field = f as any;
          const fieldValue = fields[field.key];
          const hasContent = fieldValue && typeof fieldValue === 'string' && fieldValue.trim();
          console.log(`handleTemplateFieldContent: field ${field.key} has content:`, hasContent);
          return hasContent;
        } catch (error) {
          console.warn('handleTemplateFieldContent: field content check error', error);
          return false;
        }
      })
      .map((f: any) => {
        try {
          const field = f as any;
          const content = String(fields[field.key] || '');
          const label = field.name || field.key;

          // 应用挖空处理
          const processedContent = processClozeText(content, side, showAnswer, plugin);

          return `<div class="field-container template-field" data-field-key="${field.key}">
                    <div class="field-label">${label}</div>
                    <div class="field-content">${processedContent}</div>
                  </div>`;
        } catch (error) {
          console.error('handleTemplateFieldContent: field mapping error', error);
          return '';
        }
      })
      .filter(Boolean);

    console.log(`handleTemplateFieldContent: found ${relevantFields.length} relevant fields for ${side}`);

    if (relevantFields.length === 0) {
      console.log(`handleTemplateFieldContent: no relevant fields found for ${side}, using fallback`);
      return handleFallbackFieldContent(fields, options);
    }

    return relevantFields.join('');

  } catch (error) {
    console.error('handleTemplateFieldContent: unexpected error', error);
    return handleDefaultFieldContent(fields, options);
  }
}

/**
 * 处理降级字段内容
 * 
 * 当模板字段都为空时使用
 * 
 * @param fields - 字段对象
 * @param options - 处理选项
 * @returns HTML字符串
 */
function handleFallbackFieldContent(
  fields: Record<string, any>,
  options: FieldProcessingOptions
): string {
  const { side, showAnswer, plugin } = options;

  try {
    // 如果模板中没有匹配的字段，显示所有可用字段
    const availableFields = Object.keys(fields).filter(k => {
      try {
        const value = fields[k];
        return !['templateId', 'templateName', 'notes'].includes(k) &&
               value &&
               typeof value === 'string' &&
               value.trim();
      } catch (error) {
        console.warn('handleFallbackFieldContent: field check error', error);
        return false;
      }
    });

    if (availableFields.length > 0) {
      return availableFields.map(key => {
        try {
          const content = String(fields[key]);
          const processedContent = processClozeText(content, side, showAnswer, plugin);
          return `<div class="field-container fallback-field" data-field-key="${key}">
                    <div class="field-label">${key}</div>
                    <div class="field-content">${processedContent}</div>
                  </div>`;
        } catch (error) {
          console.error('handleFallbackFieldContent: field processing error', error);
          return '';
        }
      }).filter(Boolean).join('');
    } else {
      return `<div class="field-container error-field">
                <div class="field-label">无内容</div>
                <div class="field-content">该卡片没有可显示的${side === 'front' ? '问题' : '答案'}内容</div>
              </div>`;
    }
  } catch (error) {
    console.error('handleFallbackFieldContent: unexpected error', error);
    return `<div class="field-container error-field">
              <div class="field-label">处理错误</div>
              <div class="field-content">降级字段处理失败</div>
            </div>`;
  }
}

/**
 * 处理字段内容（统一入口）
 * 
 * 根据是否有模板自动选择处理策略
 * 
 * @param fields - 字段对象
 * @param template - 模板定义（可选）
 * @param options - 处理选项
 * @returns HTML字符串
 */
export function processFieldContent(
  fields: Record<string, any>,
  template: ParseTemplate | undefined,
  options: FieldProcessingOptions
): string {
  if (!fields) {
    return `<div class="field-container error-field">
              <div class="field-label">错误</div>
              <div class="field-content">字段数据为空</div>
            </div>`;
  }

  // 如果有模板，使用模板处理
  if (template && template.fields) {
    return handleTemplateFieldContent(fields, template, options);
  }

  // 否则使用默认处理
  return handleDefaultFieldContent(fields, options);
}

