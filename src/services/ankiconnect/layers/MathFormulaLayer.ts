/**
 * 数学公式转换层
 * 负责将 Obsidian 公式格式转换为 Anki 兼容格式
 * 
 * 转换规则：
 * - $formula$ → \(formula\) (行内公式)
 * - $$formula$$ → \[formula\] (块级公式)
 * - 已经是 LaTeX 格式的保持不变
 * - 检测货币符号避免误转换
 */

import { BaseConversionLayer } from './ConversionLayer';
import type { ConversionContext, LayerConversionResult } from '../../../types/ankiconnect-types';
import {
  CONVERSION_REGEX,
  BoundaryDetector,
  StringUtils
} from '../utils/conversion-utils';

export class MathFormulaLayer extends BaseConversionLayer {
  name = 'MathFormulaLayer';
  priority = 100; // 最高优先级，最先执行
  description = '数学公式格式转换（$ → \\( 和 $$ → \\[）';

  convert(content: string, context: ConversionContext): LayerConversionResult {
    const options = context.options.mathConversion;
    
    // 如果未启用或设置为保持 $ 格式，直接返回
    if (!options.enabled || options.targetFormat === 'keep-dollar') {
      this.debug('公式转换已禁用或设置为保持原格式');
      return this.createResult(content, 0);
    }

    this.debug('开始公式转换', {
      targetFormat: options.targetFormat,
      detectCurrency: options.detectCurrencySymbol
    });

    const warnings: string[] = [];
    let convertedContent = content;
    let totalChanges = 0;

    // 步骤1: 转换块级公式 $$...$$ → \[...\]
    const blockResult = this.convertBlockMath(convertedContent, options.detectCurrencySymbol);
    convertedContent = blockResult.content;
    totalChanges += blockResult.count;
    warnings.push(...blockResult.warnings);

    this.debug('块级公式转换完成', { changeCount: blockResult.count });

    // 步骤2: 转换行内公式 $...$ → \(...\)
    const inlineResult = this.convertInlineMath(convertedContent, options.detectCurrencySymbol);
    convertedContent = inlineResult.content;
    totalChanges += inlineResult.count;
    warnings.push(...inlineResult.warnings);

    this.debug('行内公式转换完成', { changeCount: inlineResult.count });

    this.debug('公式转换总结', {
      totalChanges,
      warningCount: warnings.length
    });

    return this.createResult(convertedContent, totalChanges, warnings);
  }

  /**
   * 转换块级公式
   * $$...$$ → \[...\]
   */
  private convertBlockMath(content: string, detectCurrency: boolean): {
    content: string;
    count: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let count = 0;

    // 使用非贪婪匹配，支持多行
    const result = content.replace(CONVERSION_REGEX.BLOCK_MATH, (match, formula, offset) => {
      // 检查是否在代码块中
      if (BoundaryDetector.shouldSkipMatch(content, offset)) {
        this.debug('跳过代码块中的匹配', { match: match.substring(0, 30) });
        return match;
      }

      // 检查是否已经是 LaTeX 格式
      if (this.isAlreadyLatexFormat(formula)) {
        this.debug('已经是 LaTeX 格式，跳过', { formula: formula.substring(0, 30) });
        return match;
      }

      count++;
      const trimmedFormula = formula.trim();
      
      // 转换为 LaTeX 块级公式格式
      return `\\[\n${trimmedFormula}\n\\]`;
    });

    return { content: result, count, warnings };
  }

  /**
   * 转换行内公式
   * $...$ → \(...\)
   */
  private convertInlineMath(content: string, detectCurrency: boolean): {
    content: string;
    count: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let count = 0;

    const result = content.replace(CONVERSION_REGEX.INLINE_MATH, (match, formula, offset) => {
      // 检查是否在代码块或行内代码中
      if (BoundaryDetector.shouldSkipMatch(content, offset)) {
        this.debug('跳过代码块/行内代码中的匹配', { match });
        return match;
      }

      // 检查是否已经是 LaTeX 格式
      if (this.isAlreadyLatexFormat(formula)) {
        this.debug('已经是 LaTeX 格式，跳过', { formula });
        return match;
      }

      // 货币符号检测
      if (detectCurrency) {
        if (this.isCurrencySymbol(match, content, offset)) {
          this.debug('检测到货币符号，跳过转换', { match });
          warnings.push(`跳过货币符号: ${match}`);
          return match;
        }
      }

      count++;
      
      // 转换为 LaTeX 行内公式格式
      return `\\(${formula}\\)`;
    });

    return { content: result, count, warnings };
  }

  /**
   * 检查是否已经是 LaTeX 格式
   * 避免重复转换
   */
  private isAlreadyLatexFormat(formula: string): boolean {
    // 检查是否包含 \( 或 \[ 标记
    return /\\[\(\[]/.test(formula);
  }

  /**
   * 检测是否为货币符号
   * 
   * 检测规则：
   * 1. $ 后面紧跟数字
   * 2. 数字格式为：整数或小数（最多2位）
   * 3. 后面跟着空格、逗号、句号或行尾
   */
  private isCurrencySymbol(match: string, fullContent: string, offset: number): boolean {
    // 获取匹配项及其后面的上下文
    const contextLength = 20;
    const afterMatch = fullContent.substring(offset + match.length, offset + match.length + contextLength);
    const context = match + afterMatch;

    // 使用边界检测器的货币检测
    return BoundaryDetector.isCurrencyAmount(match, context);
  }

  /**
   * 统计公式数量（调试用）
   */
  private countFormulas(content: string): {
    blockMath: number;
    inlineMath: number;
    latexBlock: number;
    latexInline: number;
  } {
    return {
      blockMath: this.countMatches(content, CONVERSION_REGEX.BLOCK_MATH),
      inlineMath: this.countMatches(content, CONVERSION_REGEX.INLINE_MATH),
      latexBlock: this.countMatches(content, CONVERSION_REGEX.LATEX_BLOCK),
      latexInline: this.countMatches(content, CONVERSION_REGEX.LATEX_INLINE)
    };
  }
}


