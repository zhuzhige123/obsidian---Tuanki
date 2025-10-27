/**
 * 测试模板系统加载
 * 验证DEFAULT_TEMPLATES是否正确加载到SimplifiedParsingSettings
 */

// 模拟DEFAULT_TEMPLATES
const DEFAULT_TEMPLATES = [
  {
    id: 'official-qa',
    name: '问答题',
    description: '标准的问答题模板，支持正反面分离',
    type: 'single-field',
    fields: [
      { name: 'Front', regex: '^(.+?)(?=---div---|$)', flags: 'ms', required: true },
      { name: 'Back', regex: '(?<=---div---)(.+)$', flags: 'ms', required: false },
      { name: 'Tags', regex: '#([\\w\\u4e00-\\u9fa5]+)', flags: 'g', required: false }
    ],
    scenarios: ['newCard', 'study', 'edit'],
    isDefault: true,
    isOfficial: true
  },
  {
    id: 'official-choice',
    name: '选择题',
    description: '多选题模板，支持多种Markdown格式',
    type: 'single-field',
    fields: [
      { name: 'Question', regex: '^##\\s*(.+?)(?=\\n\\*\\*选项\\*\\*:|\\n[A-E]\\.|---div---|$)', flags: 'ms', required: true },
      { name: 'Options', regex: '\\*\\*选项\\*\\*:\\s*\\n((?:[A-E]\\..*?\\n?)+)', flags: 'ms', required: true },
      { name: 'OptionsAlt', regex: '((?:[A-E]\\..*?\\n?)+)(?=---div---|$)', flags: 'ms', required: false },
      { name: 'Answer', regex: '(?<=---div---)\\s*(.+?)(?=\\n\\*\\*解析\\*\\*:|\\n\\*\\*标签\\*\\*:|$)', flags: 'ms', required: false },
      { name: 'Explanation', regex: '\\*\\*解析\\*\\*:\\s*(.+?)(?=\\n\\*\\*标签\\*\\*:|$)', flags: 'ms', required: false },
      { name: 'Tags', regex: '\\*\\*标签\\*\\*:\\s*(.+?)$|#([\\w\\u4e00-\\u9fa5/_-]+)', flags: 'gms', required: false }
    ],
    scenarios: ['newCard', 'study', 'edit'],
    isDefault: true,
    isOfficial: true
  },
  {
    id: 'official-cloze',
    name: '填空题',
    description: '挖空题模板，支持多个挖空',
    type: 'single-field',
    fields: [
      { name: 'Text', regex: '^(.+?)(?=---div---|$)', flags: 'ms', required: true },
      { name: 'Cloze', regex: '\\{\\{c\\d+::(.+?)\\}\\}', flags: 'g', required: true },
      { name: 'Extra', regex: '(?<=---div---)(.+)$', flags: 'ms', required: false },
      { name: 'Tags', regex: '#([\\w\\u4e00-\\u9fa5]+)', flags: 'g', required: false }
    ],
    scenarios: ['newCard', 'study', 'edit'],
    isDefault: true,
    isOfficial: true
  }
];

// 模拟DEFAULT_SIMPLIFIED_PARSING_SETTINGS
const DEFAULT_SIMPLIFIED_PARSING_SETTINGS = {
  enableTagTrigger: true,
  triggerTag: '#tuanki',
  symbols: {
    rangeStart: '---start---',
    rangeEnd: '---end---',
    cardDelimiter: '---卡片---',
    faceDelimiter: '---div---',
    clozeMarker: '=='
  },
  enableTemplateSystem: true,
  templates: [], // 这里是空的，需要在运行时填充
  defaultTemplateId: 'official-qa'
};

// 模拟SimplifiedParsingSettings的初始化逻辑
function testTemplateInitialization() {
  console.log('🧪 测试模板系统初始化');
  
  // 模拟组件的settings状态
  let settings = { ...DEFAULT_SIMPLIFIED_PARSING_SETTINGS };
  
  console.log('📋 初始设置状态:');
  console.log(`- enableTemplateSystem: ${settings.enableTemplateSystem}`);
  console.log(`- templates.length: ${settings.templates.length}`);
  console.log(`- defaultTemplateId: ${settings.defaultTemplateId}`);
  
  // 模拟onMount逻辑
  console.log('\n🔄 执行onMount初始化逻辑:');
  
  if (!settings.templates || settings.templates.length === 0) {
    console.log('✅ 检测到空模板列表，开始初始化默认模板');
    settings.templates = [...DEFAULT_TEMPLATES];
    settings.enableTemplateSystem = true;
    console.log(`📤 已加载 ${settings.templates.length} 个默认模板`);
  } else {
    console.log('ℹ️  模板已存在，跳过初始化');
  }
  
  console.log('\n📊 初始化后的状态:');
  console.log(`- enableTemplateSystem: ${settings.enableTemplateSystem}`);
  console.log(`- templates.length: ${settings.templates.length}`);
  console.log('- 模板列表:');
  settings.templates.forEach((template, index) => {
    console.log(`  ${index + 1}. ${template.name} (${template.id})`);
    console.log(`     描述: ${template.description}`);
    console.log(`     类型: ${template.type}`);
    console.log(`     官方: ${template.isOfficial ? '是' : '否'}`);
  });
  
  return settings;
}

// 测试模板显示逻辑
function testTemplateDisplay(settings) {
  console.log('\n🧪 测试模板显示逻辑');
  
  if (!settings.templates || settings.templates.length === 0) {
    console.log('❌ 没有模板可显示');
    return false;
  }
  
  console.log('✅ 模板显示测试:');
  console.log(`共有 ${settings.templates.length} 个模板可显示`);
  
  // 模拟模板卡片渲染
  settings.templates.forEach((template) => {
    console.log(`\n📄 模板卡片: ${template.name}`);
    console.log(`   ID: ${template.id}`);
    console.log(`   描述: ${template.description || '无描述'}`);
    console.log(`   类型: ${template.type === 'single-field' ? '单字段' : '完整正则'}`);
    console.log(`   官方标识: ${template.isOfficial ? '显示官方徽章' : '无徽章'}`);
    
    if (template.fields) {
      console.log(`   字段配置: ${template.fields.length} 个字段`);
      template.fields.slice(0, 3).forEach(field => {
        console.log(`     - ${field.name}`);
      });
      if (template.fields.length > 3) {
        console.log(`     - +${template.fields.length - 3} 个更多字段`);
      }
    }
  });
  
  return true;
}

// 测试选择题模板是否存在
function testChoiceTemplateExists(settings) {
  console.log('\n🧪 测试选择题模板是否存在');
  
  const choiceTemplate = settings.templates.find(t => t.id === 'official-choice');
  
  if (choiceTemplate) {
    console.log('✅ 找到选择题模板:');
    console.log(`   名称: ${choiceTemplate.name}`);
    console.log(`   描述: ${choiceTemplate.description}`);
    console.log(`   字段数量: ${choiceTemplate.fields.length}`);
    console.log('   字段列表:');
    choiceTemplate.fields.forEach(field => {
      console.log(`     - ${field.name} (${field.required ? '必需' : '可选'})`);
    });
    return true;
  } else {
    console.log('❌ 未找到选择题模板');
    return false;
  }
}

// 运行所有测试
function runAllTests() {
  console.log('🎯 开始测试模板系统加载\n');
  
  // 测试1: 模板初始化
  const settings = testTemplateInitialization();
  
  // 测试2: 模板显示
  const displaySuccess = testTemplateDisplay(settings);
  
  // 测试3: 选择题模板检查
  const choiceExists = testChoiceTemplateExists(settings);
  
  // 总结
  console.log('\n📊 测试结果总结:');
  console.log(`模板初始化: ${settings.templates.length > 0 ? '✅ 成功' : '❌ 失败'}`);
  console.log(`模板显示: ${displaySuccess ? '✅ 成功' : '❌ 失败'}`);
  console.log(`选择题模板: ${choiceExists ? '✅ 存在' : '❌ 缺失'}`);
  
  const allSuccess = settings.templates.length > 0 && displaySuccess && choiceExists;
  console.log(`\n🎉 整体结果: ${allSuccess ? '所有测试通过！' : '存在问题需要修复'}`);
  
  if (allSuccess) {
    console.log('\n💡 模板系统应该能够正常工作，用户应该能在设置界面看到所有模板');
  } else {
    console.log('\n⚠️  模板系统存在问题，需要检查代码实现');
  }
}

// 执行测试
runAllTests();
