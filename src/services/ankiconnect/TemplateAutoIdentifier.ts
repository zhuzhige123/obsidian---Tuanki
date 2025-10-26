/**
 * 模板自动识别器
 * 负责识别和标记 Tuanki 专属模板，支持双向同步
 */

import type { ParseTemplate } from '../../types/newCardParsingTypes';

export interface IdentificationResult {
  isAnkiImported: boolean;  // 是否从 Anki 导入
  confidence: number;
  reason: string[];
}

export class TemplateAutoIdentifier {
  // Tuanki 专属标识符
  private readonly TUANKI_SIGNATURES = [
    'tuanki-template',
    'tuanki_template',
    'TUANKI',
    'tuanki-exclusive'
  ];

  // Tuanki 专属命名前缀
  private readonly TUANKI_PREFIXES = [
    'Tuanki:',
    'Tuanki-',
    'T:',
    '[Tuanki]'
  ];

  /**
   * 识别模板是否为 Tuanki 专属
   */
  identify(template: ParseTemplate): IdentificationResult {
    const reasons: string[] = [];
    let confidence = 0;
    let isTuankiExclusive = false;
    let supportsBidirectional = false;

    // 检查 1: 显式的 syncCapability 标记
    if (template.syncCapability) {
      if (template.syncCapability.isTuankiExclusive) {
        confidence += 100;
        isTuankiExclusive = true;
        supportsBidirectional = template.syncCapability.supportsBidirectional;
        reasons.push('模板已显式标记为 Tuanki 专属');
        return { isTuankiExclusive, supportsBidirectional, confidence, reason: reasons };
      }
    }

    // 检查 2: tuankiMetadata 标记
    if (template.tuankiMetadata) {
      const metadata = template.tuankiMetadata;
      
      if (metadata.source === 'tuanki_created') {
        confidence += 80;
        isTuankiExclusive = true;
        supportsBidirectional = true;
        reasons.push('模板在 Tuanki 中创建');
      } else if (metadata.source === 'official' && metadata.createdInTuanki) {
        confidence += 90;
        isTuankiExclusive = true;
        supportsBidirectional = true;
        reasons.push('Tuanki 官方模板');
      } else if (metadata.editedInTuanki && metadata.createdInTuanki) {
        confidence += 70;
        isTuankiExclusive = true;
        supportsBidirectional = true;
        reasons.push('模板在 Tuanki 中创建并编辑');
      } else if (metadata.source === 'anki_imported') {
        confidence = 10;
        isTuankiExclusive = false;
        supportsBidirectional = false;
        reasons.push('模板从 Anki 导入');
      }
      
      if (metadata.signature && this.containsTuankiSignature(metadata.signature)) {
        confidence += 20;
        isTuankiExclusive = true;
        reasons.push('包含 Tuanki 签名');
      }
    }

    // 检查 3: 模板名称
    const nameCheck = this.checkTemplateName(template.name);
    if (nameCheck.isTuanki) {
      confidence += 60;
      isTuankiExclusive = true;
      supportsBidirectional = true;
      reasons.push(`模板名称包含 Tuanki 标识: ${nameCheck.matchedPattern}`);
    }

    // 检查 4: 是否为官方模板
    if (template.isOfficial) {
      confidence += 50;
      isTuankiExclusive = true;
      supportsBidirectional = true;
      reasons.push('Tuanki 官方模板');
    }

    // 检查 5: 描述中的标识
    if (template.description) {
      if (this.containsTuankiSignature(template.description)) {
        confidence += 30;
        isTuankiExclusive = true;
        reasons.push('描述中包含 Tuanki 标识');
      }
    }

    // 检查 6: 创建时间和更新时间
    if (template.createdAt && !template.syncCapability?.ankiModelMapping) {
      confidence += 10;
      isTuankiExclusive = true;
      reasons.push('在 Tuanki 中首次创建');
    }

    // 最终判断
    if (confidence >= 50) {
      isTuankiExclusive = true;
      supportsBidirectional = true;
    }

    if (reasons.length === 0) {
      reasons.push('未找到 Tuanki 专属标识，判定为通用模板');
    }

    return {
      isTuankiExclusive,
      supportsBidirectional,
      confidence,
      reason: reasons
    };
  }

  /**
   * 检查模板名称
   */
  private checkTemplateName(name: string): { isTuanki: boolean; matchedPattern?: string } {
    for (const prefix of this.TUANKI_PREFIXES) {
      if (name.startsWith(prefix)) {
        return { isTuanki: true, matchedPattern: prefix };
      }
    }

    for (const signature of this.TUANKI_SIGNATURES) {
      if (name.toLowerCase().includes(signature.toLowerCase())) {
        return { isTuanki: true, matchedPattern: signature };
      }
    }

    return { isTuanki: false };
  }

  /**
   * 检查字符串是否包含 Tuanki 签名
   */
  private containsTuankiSignature(text: string): boolean {
    const lowerText = text.toLowerCase();
    return this.TUANKI_SIGNATURES.some(sig => lowerText.includes(sig.toLowerCase()));
  }

  /**
   * 生成 Tuanki 签名
   */
  generateTuankiSignature(templateId: string, version: string = '1.0'): string {
    const timestamp = Date.now();
    return `tuanki-template-${templateId}-v${version}-${timestamp}`;
  }

  /**
   * 标记模板为 Tuanki 专属
   */
  markAsTuankiExclusive(
    template: ParseTemplate,
    supportsBidirectional: boolean = true
  ): ParseTemplate {
    const now = new Date().toISOString();

    return {
      ...template,
      syncCapability: {
        supportsBidirectional,
        isTuankiExclusive: true,
        ankiModelMapping: undefined
      },
      tuankiMetadata: {
        signature: this.generateTuankiSignature(template.id, '1.0'),
        version: '1.0',
        ankiCompatible: false,
        source: template.isOfficial ? 'official' : 'tuanki_created',
        createdInTuanki: true,
        editedInTuanki: false
      },
      createdAt: template.createdAt || now,
      updatedAt: now
    };
  }

  /**
   * 标记模板为从 Anki 导入
   */
  markAsAnkiImported(
    template: ParseTemplate,
    ankiModelId: number,
    ankiModelName: string
  ): ParseTemplate {
    const now = new Date().toISOString();

    return {
      ...template,
      syncCapability: {
        supportsBidirectional: false,
        isTuankiExclusive: false,
        ankiModelMapping: {
          modelId: ankiModelId,
          modelName: ankiModelName,
          lastSyncVersion: '1.0'
        }
      },
      tuankiMetadata: {
        signature: '',
        version: '1.0',
        ankiCompatible: true,
        source: 'anki_imported',
        createdInTuanki: false,
        editedInTuanki: false
      },
      createdAt: template.createdAt || now,
      updatedAt: now
    };
  }

  /**
   * 批量识别模板
   */
  identifyBatch(templates: ParseTemplate[]): Map<string, IdentificationResult> {
    const results = new Map<string, IdentificationResult>();
    
    for (const template of templates) {
      const result = this.identify(template);
      results.set(template.id, result);
    }

    return results;
  }


  /**
   * 获取统计信息
   */
  getStatistics(templates: ParseTemplate[]): {
    total: number;
    tuankiExclusive: number;
    bidirectional: number;
    ankiImported: number;
    generic: number;
  } {
    const results = this.identifyBatch(templates);
    const identifications = Array.from(results.values());

    return {
      total: templates.length,
      tuankiExclusive: identifications.filter(r => r.isTuankiExclusive).length,
      bidirectional: identifications.filter(r => r.supportsBidirectional).length,
      ankiImported: templates.filter(t => 
        t.tuankiMetadata?.source === 'anki_imported'
      ).length,
      generic: identifications.filter(r => !r.isTuankiExclusive).length
    };
  }
}




