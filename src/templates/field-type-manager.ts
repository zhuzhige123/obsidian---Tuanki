/**
 * 字段类型管理器
 * 管理标准化字段类型的配置和行为
 */

import {
  StandardFieldType
} from "../data/template-types";
import type {
  FieldTypeConfig,
  FieldValidationRules,
  FieldDisplayConfig
} from "../data/template-types";

/**
 * 字段类型管理器类
 */
export class FieldTypeManager {
  private typeConfigs: Map<StandardFieldType, FieldTypeConfig> = new Map();

  constructor() {
    this.initializeFieldTypeConfigs();
  }

  /**
   * 初始化所有字段类型配置
   */
  private initializeFieldTypeConfigs(): void {
    // 基础文本类型
    this.addTypeConfig({
      type: StandardFieldType.TEXT,
      defaultValidation: { required: false, maxLength: 500 },
      defaultDisplay: { inputType: 'text', placeholder: '请输入文本...' },
      description: '普通文本字段，适用于简短的文本内容',
      category: '基础类型',
      examples: ['标题', '简短描述', '关键词']
    });

    this.addTypeConfig({
      type: StandardFieldType.RICH_TEXT,
      defaultValidation: { required: false, maxLength: 5000, allowHtml: true },
      defaultDisplay: { inputType: 'textarea', multiline: true, rows: 4, showPreview: true },
      description: '富文本字段，支持HTML格式',
      category: '基础类型',
      examples: ['格式化内容', '带样式的文本', 'HTML内容']
    });

    this.addTypeConfig({
      type: StandardFieldType.MARKDOWN,
      defaultValidation: { required: false, maxLength: 5000, allowMarkdown: true },
      defaultDisplay: { inputType: 'textarea', multiline: true, rows: 6, syntax: 'markdown', showPreview: true },
      description: 'Markdown格式文本，支持Markdown语法',
      category: '基础类型',
      examples: ['文档内容', '格式化笔记', '结构化文本']
    });

    this.addTypeConfig({
      type: StandardFieldType.LONG_TEXT,
      defaultValidation: { required: false, maxLength: 10000 },
      defaultDisplay: { inputType: 'textarea', multiline: true, rows: 8 },
      description: '长文本字段，适用于大段文本内容',
      category: '基础类型',
      examples: ['详细解释', '长篇内容', '文章段落']
    });

    // 语言学习类型
    this.addTypeConfig({
      type: StandardFieldType.WORD,
      defaultValidation: { required: true, minLength: 1, maxLength: 50 },
      defaultDisplay: { inputType: 'text', placeholder: '请输入单词...' },
      description: '单词字段，用于语言学习中的词汇',
      category: '语言学习',
      examples: ['apple', 'beautiful', 'understand']
    });

    this.addTypeConfig({
      type: StandardFieldType.PRONUNCIATION,
      defaultValidation: { required: false, maxLength: 100 },
      defaultDisplay: { inputType: 'text', placeholder: '请输入音标...', helpText: '支持IPA音标格式' },
      description: '发音字段，通常使用IPA音标',
      category: '语言学习',
      examples: ['/ˈæpəl/', '/ˈbjuːtɪfəl/', '/ˌʌndəˈstænd/']
    });

    this.addTypeConfig({
      type: StandardFieldType.TRANSLATION,
      defaultValidation: { required: false, maxLength: 200 },
      defaultDisplay: { inputType: 'text', placeholder: '请输入翻译...' },
      description: '翻译字段，用于显示词汇或句子的翻译',
      category: '语言学习',
      examples: ['苹果', '美丽的', '理解']
    });

    this.addTypeConfig({
      type: StandardFieldType.PART_OF_SPEECH,
      defaultValidation: { 
        required: false, 
        allowedValues: ['名词', '动词', '形容词', '副词', '介词', '连词', '感叹词', '代词', '数词', '冠词']
      },
      defaultDisplay: { 
        inputType: 'select', 
        options: ['名词', '动词', '形容词', '副词', '介词', '连词', '感叹词', '代词', '数词', '冠词']
      },
      description: '词性字段，标识单词的语法类别',
      category: '语言学习',
      examples: ['名词', '动词', '形容词']
    });

    // 学术类型
    this.addTypeConfig({
      type: StandardFieldType.CONCEPT,
      defaultValidation: { required: true, minLength: 2, maxLength: 100 },
      defaultDisplay: { inputType: 'text', placeholder: '请输入概念名称...' },
      description: '概念名称字段，用于学术概念的标识',
      category: '学术类型',
      examples: ['牛顿第一定律', '细胞分裂', '函数']
    });

    this.addTypeConfig({
      type: StandardFieldType.DEFINITION,
      defaultValidation: { required: true, minLength: 10, maxLength: 1000 },
      defaultDisplay: { inputType: 'textarea', multiline: true, rows: 3, placeholder: '请输入定义...' },
      description: '定义字段，用于解释概念的含义',
      category: '学术类型',
      examples: ['物体在没有外力作用时保持静止或匀速直线运动的性质', '细胞通过分裂产生新细胞的过程']
    });

    this.addTypeConfig({
      type: StandardFieldType.FORMULA,
      defaultValidation: { required: false, maxLength: 500, allowLatex: true },
      defaultDisplay: { 
        inputType: 'textarea', 
        multiline: true, 
        rows: 2, 
        syntax: 'latex',
        placeholder: '请输入公式（支持LaTeX）...',
        showPreview: true,
        helpText: '使用LaTeX语法，如：$E = mc^2$'
      },
      description: '公式字段，支持LaTeX数学公式',
      category: '学术类型',
      examples: ['$E = mc^2$', '$F = ma$', '$\\int_{a}^{b} f(x) dx$']
    });

    // 媒体类型
    this.addTypeConfig({
      type: StandardFieldType.IMAGE,
      defaultValidation: { required: false },
      defaultDisplay: { 
        inputType: 'file',
        helpText: '支持 JPG, PNG, GIF, SVG 格式'
      },
      description: '图片字段，用于插入图像内容',
      category: '媒体类型',
      examples: ['![图片描述](image.png)', '![[image.jpg]]']
    });

    this.addTypeConfig({
      type: StandardFieldType.AUDIO,
      defaultValidation: { required: false },
      defaultDisplay: { 
        inputType: 'file',
        helpText: '支持 MP3, WAV, OGG 格式'
      },
      description: '音频字段，用于插入音频内容',
      category: '媒体类型',
      examples: ['[sound:audio.mp3]', '![[audio.wav]]']
    });

    // 代码类型
    this.addTypeConfig({
      type: StandardFieldType.CODE,
      defaultValidation: { required: false, maxLength: 5000 },
      defaultDisplay: { 
        inputType: 'textarea', 
        multiline: true, 
        rows: 8,
        syntax: 'javascript',
        placeholder: '请输入代码...',
        helpText: '支持语法高亮'
      },
      description: '代码字段，用于显示程序代码',
      category: '代码类型',
      examples: ['function hello() { console.log("Hello"); }', 'def fibonacci(n): return n if n <= 1 else fibonacci(n-1) + fibonacci(n-2)']
    });

    this.addTypeConfig({
      type: StandardFieldType.ALGORITHM,
      defaultValidation: { required: false, maxLength: 2000 },
      defaultDisplay: { 
        inputType: 'textarea', 
        multiline: true, 
        rows: 6,
        placeholder: '请描述算法步骤...'
      },
      description: '算法字段，用于描述算法步骤',
      category: '代码类型',
      examples: ['1. 初始化变量\n2. 循环处理\n3. 返回结果', '快速排序：选择基准，分区，递归排序']
    });

    // 学习辅助类型
    this.addTypeConfig({
      type: StandardFieldType.HINT,
      defaultValidation: { required: false, maxLength: 200 },
      defaultDisplay: { 
        inputType: 'text', 
        placeholder: '请输入提示...',
        helpText: '简短的提示信息'
      },
      description: '提示字段，为学习者提供帮助信息',
      category: '学习辅助',
      examples: ['想想牛顿的发现', '注意词根的含义', '考虑边界条件']
    });

    this.addTypeConfig({
      type: StandardFieldType.EXAMPLE,
      defaultValidation: { required: false, maxLength: 1000 },
      defaultDisplay: { 
        inputType: 'textarea', 
        multiline: true, 
        rows: 3,
        placeholder: '请输入示例...'
      },
      description: '示例字段，提供具体的例子说明',
      category: '学习辅助',
      examples: ['The cat is sleeping on the mat.', '当 x = 2 时，f(x) = 4', '水在100°C时沸腾']
    });

    this.addTypeConfig({
      type: StandardFieldType.NOTE,
      defaultValidation: { required: false, maxLength: 500 },
      defaultDisplay: { 
        inputType: 'textarea', 
        multiline: true, 
        rows: 2,
        placeholder: '请输入备注...'
      },
      description: '备注字段，用于添加额外的说明信息',
      category: '学习辅助',
      examples: ['注意时态变化', '这是重点内容', '容易混淆的概念']
    });

    // 分类和标识类型
    this.addTypeConfig({
      type: StandardFieldType.TAG,
      defaultValidation: { required: false, maxLength: 100 },
      defaultDisplay: { 
        inputType: 'text', 
        placeholder: '请输入标签，用逗号分隔...',
        helpText: '多个标签用逗号分隔'
      },
      description: '标签字段，用于分类和组织内容',
      category: '分类标识',
      examples: ['英语, 词汇, 基础', '数学, 几何, 定理', '编程, JavaScript, 函数']
    });

    this.addTypeConfig({
      type: StandardFieldType.DIFFICULTY,
      defaultValidation: { 
        required: false,
        allowedValues: ['简单', '中等', '困难', '专家']
      },
      defaultDisplay: { 
        inputType: 'select',
        options: ['简单', '中等', '困难', '专家']
      },
      description: '难度字段，标识内容的难度级别',
      category: '分类标识',
      examples: ['简单', '中等', '困难']
    });

    // 数值类型
    this.addTypeConfig({
      type: StandardFieldType.NUMBER,
      defaultValidation: { required: false, min: 0 },
      defaultDisplay: { 
        inputType: 'number',
        placeholder: '请输入数字...'
      },
      description: '数字字段，用于输入数值',
      category: '数值类型',
      examples: ['42', '3.14', '100']
    });

    this.addTypeConfig({
      type: StandardFieldType.RATING,
      defaultValidation: { 
        required: false,
        min: 1,
        max: 5,
        step: 1
      },
      defaultDisplay: { 
        inputType: 'number',
        placeholder: '1-5分',
        helpText: '1-5分评分'
      },
      description: '评分字段，用于评价内容质量',
      category: '数值类型',
      examples: ['5', '3', '4']
    });

    // 自定义类型
    this.addTypeConfig({
      type: StandardFieldType.CUSTOM,
      defaultValidation: { required: false },
      defaultDisplay: { inputType: 'text' },
      description: '自定义字段，可根据需要配置',
      category: '自定义',
      examples: ['根据需要自定义']
    });
  }

  /**
   * 添加字段类型配置
   */
  addTypeConfig(config: FieldTypeConfig): void {
    this.typeConfigs.set(config.type, config);
  }

  /**
   * 获取字段类型配置
   */
  getTypeConfig(type: StandardFieldType): FieldTypeConfig | undefined {
    return this.typeConfigs.get(type);
  }

  /**
   * 获取所有字段类型配置
   */
  getAllTypeConfigs(): FieldTypeConfig[] {
    return Array.from(this.typeConfigs.values());
  }

  /**
   * 根据分类获取字段类型
   */
  getTypesByCategory(category: string): FieldTypeConfig[] {
    return this.getAllTypeConfigs().filter(config => config.category === category);
  }

  /**
   * 获取所有分类
   */
  getAllCategories(): string[] {
    const categories = new Set<string>();
    this.typeConfigs.forEach(config => categories.add(config.category));
    return Array.from(categories);
  }

  /**
   * 搜索字段类型
   */
  searchTypes(query: string): FieldTypeConfig[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllTypeConfigs().filter(config => 
      config.description.toLowerCase().includes(lowerQuery) ||
      config.category.toLowerCase().includes(lowerQuery) ||
      config.examples.some(example => example.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 获取字段类型的默认验证规则
   */
  getDefaultValidation(type: StandardFieldType): FieldValidationRules {
    const config = this.getTypeConfig(type);
    return config ? { ...config.defaultValidation } : {};
  }

  /**
   * 获取字段类型的默认显示配置
   */
  getDefaultDisplay(type: StandardFieldType): FieldDisplayConfig {
    const config = this.getTypeConfig(type);
    return config ? { ...config.defaultDisplay } : {};
  }

  /**
   * 检查字段类型是否存在
   */
  hasType(type: StandardFieldType): boolean {
    return this.typeConfigs.has(type);
  }

  /**
   * 获取推荐的字段类型（基于字段名称）
   */
  getRecommendedType(fieldName: string): StandardFieldType {
    const lowerName = fieldName.toLowerCase();
    
    // 语言学习相关
    if (lowerName.includes('单词') || lowerName.includes('word')) return StandardFieldType.WORD;
    if (lowerName.includes('音标') || lowerName.includes('发音') || lowerName.includes('pronunciation')) return StandardFieldType.PRONUNCIATION;
    if (lowerName.includes('翻译') || lowerName.includes('translation') || lowerName.includes('意思')) return StandardFieldType.TRANSLATION;
    if (lowerName.includes('词性') || lowerName.includes('part')) return StandardFieldType.PART_OF_SPEECH;
    
    // 学术相关
    if (lowerName.includes('概念') || lowerName.includes('concept')) return StandardFieldType.CONCEPT;
    if (lowerName.includes('定义') || lowerName.includes('definition')) return StandardFieldType.DEFINITION;
    if (lowerName.includes('公式') || lowerName.includes('formula')) return StandardFieldType.FORMULA;
    
    // 媒体相关
    if (lowerName.includes('图片') || lowerName.includes('图像') || lowerName.includes('image')) return StandardFieldType.IMAGE;
    if (lowerName.includes('音频') || lowerName.includes('声音') || lowerName.includes('audio')) return StandardFieldType.AUDIO;
    
    // 代码相关
    if (lowerName.includes('代码') || lowerName.includes('code')) return StandardFieldType.CODE;
    if (lowerName.includes('算法') || lowerName.includes('algorithm')) return StandardFieldType.ALGORITHM;
    
    // 学习辅助
    if (lowerName.includes('提示') || lowerName.includes('hint')) return StandardFieldType.HINT;
    if (lowerName.includes('例子') || lowerName.includes('示例') || lowerName.includes('example')) return StandardFieldType.EXAMPLE;
    if (lowerName.includes('备注') || lowerName.includes('注释') || lowerName.includes('note')) return StandardFieldType.NOTE;
    
    // 分类标识
    if (lowerName.includes('标签') || lowerName.includes('tag')) return StandardFieldType.TAG;
    if (lowerName.includes('难度') || lowerName.includes('difficulty')) return StandardFieldType.DIFFICULTY;
    
    // 默认为普通文本
    return StandardFieldType.TEXT;
  }
}

// 导出默认字段类型管理器实例
export const defaultFieldTypeManager = new FieldTypeManager();
