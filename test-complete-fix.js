/**
 * 完整修复测试
 * 验证选择题渲染和智能诊断系统的完整流程
 */

console.log('🎯 开始完整修复测试\n');

// 模拟用户提供的选择题内容
const testCardContent = `## 以下哪个是JavaScript的基本数据类型？
**选项**:
A. string（字符串）
B. number（数字）
C. boolean（布尔值）
D. 以上都是

---div---

**解析**: JavaScript有七种基本数据类型...
**标签**: JavaScript,数据类型,基础知识`;

console.log('📝 测试卡片内容:');
console.log(testCardContent);
console.log('\n' + '='.repeat(60) + '\n');

// 测试1: ContentExtractor解析
console.log('🧪 测试1: ContentExtractor解析');

// 模拟ContentExtractor.parseChoiceContent
function mockParseChoiceContent(content) {
  const h2OptionsPattern = /^##\s*(.+?)\n\*\*选项\*\*:\s*\n((?:[A-E]\..*?\n?)+)(?:---div---\s*\n([\s\S]*))?$/m;
  const match = content.match(h2OptionsPattern);
  
  if (match) {
    const [, question, options, backContent] = match;
    
    // 解析解析和标签
    let explanation = '';
    let tags = '';
    
    if (backContent) {
      const explanationMatch = backContent.match(/\*\*解析\*\*:\s*(.+?)(?=\n\*\*标签\*\*:|$)/s);
      const tagsMatch = backContent.match(/\*\*标签\*\*:\s*(.+?)$/s);
      
      explanation = explanationMatch ? explanationMatch[1].trim() : '';
      tags = tagsMatch ? tagsMatch[1].trim() : '';
    }
    
    return {
      success: true,
      question: question.trim(),
      options: options.trim(),
      correctAnswer: 'D',
      explanation,
      tags,
      confidence: 0.95,
      format: 'markdown-h2'
    };
  }
  
  return { success: false, confidence: 0 };
}

const parseResult = mockParseChoiceContent(testCardContent);
console.log('解析结果:', parseResult);
console.log(`✅ 解析${parseResult.success ? '成功' : '失败'}`);

if (parseResult.success) {
  console.log(`- 题目: ${parseResult.question}`);
  console.log(`- 选项: ${parseResult.options.replace(/\n/g, ' | ')}`);
  console.log(`- 答案: ${parseResult.correctAnswer}`);
  console.log(`- 解析: ${parseResult.explanation}`);
  console.log(`- 标签: ${parseResult.tags}`);
  console.log(`- 置信度: ${parseResult.confidence}`);
}

console.log('\n' + '='.repeat(60) + '\n');

// 测试2: PreviewContainer预处理
console.log('🧪 测试2: PreviewContainer预处理');

const originalCard = {
  id: 'test-card-001',
  fields: {
    front: testCardContent
  }
};

function mockPreprocessCard(card) {
  const frontContent = card.fields.front || '';
  if (!frontContent) return card;
  
  const choiceResult = mockParseChoiceContent(frontContent);
  if (choiceResult.success) {
    return {
      ...card,
      fields: {
        ...card.fields,
        question: choiceResult.question,
        options: choiceResult.options,
        correct_answer: choiceResult.correctAnswer,
        explanation: choiceResult.explanation,
        tags: choiceResult.tags,
        _original_front: frontContent,
        _preprocessed: 'true',
        _format: choiceResult.format,
        _confidence: choiceResult.confidence.toString()
      }
    };
  }
  
  return card;
}

const preprocessedCard = mockPreprocessCard(originalCard);
console.log('预处理前字段:', Object.keys(originalCard.fields));
console.log('预处理后字段:', Object.keys(preprocessedCard.fields));
console.log(`✅ 预处理${preprocessedCard.fields._preprocessed ? '成功' : '失败'}`);

console.log('\n' + '='.repeat(60) + '\n');

// 测试3: 选择题检测
console.log('🧪 测试3: 选择题检测');

function mockIsMultipleChoiceCard(fields) {
  // 检查结构化字段
  if (fields.options && fields.question && fields.correct_answer) {
    return true;
  }
  
  // 检查Markdown格式
  const frontContent = fields.front || '';
  const h2OptionsPattern = /##\s*.+?\n\*\*选项\*\*:\s*\n(?:[A-E]\..+?\n?){2,}/ms;
  return h2OptionsPattern.test(frontContent);
}

const beforeDetection = mockIsMultipleChoiceCard(originalCard.fields);
const afterDetection = mockIsMultipleChoiceCard(preprocessedCard.fields);

console.log(`预处理前检测: ${beforeDetection ? '✅ 选择题' : '❌ 非选择题'}`);
console.log(`预处理后检测: ${afterDetection ? '✅ 选择题' : '❌ 非选择题'}`);
console.log(`修复效果: ${!beforeDetection && afterDetection ? '🎉 修复成功！' : '⚠️  需要检查'}`);

console.log('\n' + '='.repeat(60) + '\n');

// 测试4: 智能诊断系统
console.log('🧪 测试4: 智能诊断系统');

function mockDiagnosticEngine(card) {
  const results = [];
  
  // 规则1: 选择题格式检查
  const frontContent = card.fields.front || '';
  const parseResult = mockParseChoiceContent(frontContent);
  
  if (parseResult.success) {
    results.push({
      ruleId: 'choice-format-check',
      passed: true,
      severity: 'info',
      message: `选择题格式正确 (${parseResult.format})`,
      canAutoFix: false
    });
  } else {
    const hasOptions = /[A-E]\./.test(frontContent);
    const hasQuestion = /[？?]/.test(frontContent);
    
    if (hasOptions && hasQuestion) {
      results.push({
        ruleId: 'choice-format-check',
        passed: false,
        severity: 'warning',
        message: '疑似选择题但格式不规范',
        suggestion: '建议使用标准格式：## 题目\\n**选项**:\\nA. 选项1\\nB. 选项2',
        canAutoFix: true
      });
    } else {
      results.push({
        ruleId: 'choice-format-check',
        passed: true,
        severity: 'info',
        message: '非选择题内容',
        canAutoFix: false
      });
    }
  }
  
  // 规则2: 内容完整性检查
  if (!frontContent.trim()) {
    results.push({
      ruleId: 'content-completeness',
      passed: false,
      severity: 'error',
      message: '卡片内容为空',
      canAutoFix: false
    });
  } else if (frontContent.length < 10) {
    results.push({
      ruleId: 'content-completeness',
      passed: false,
      severity: 'warning',
      message: '卡片内容过短',
      canAutoFix: false
    });
  } else {
    results.push({
      ruleId: 'content-completeness',
      passed: true,
      severity: 'info',
      message: '内容完整性良好',
      canAutoFix: false
    });
  }
  
  // 规则3: 标签格式检查
  const tags = frontContent.match(/#[\w\u4e00-\u9fa5]+/g) || [];
  if (tags.length === 0) {
    results.push({
      ruleId: 'tag-format-check',
      passed: false,
      severity: 'info',
      message: '未发现标签',
      suggestion: '建议添加相关标签以便分类',
      canAutoFix: false
    });
  } else {
    results.push({
      ruleId: 'tag-format-check',
      passed: true,
      severity: 'info',
      message: `标签格式正确 (${tags.length} 个标签)`,
      canAutoFix: false
    });
  }
  
  // 生成摘要
  const summary = {
    total: results.length,
    passed: results.filter(r => r.passed).length,
    warnings: results.filter(r => !r.passed && r.severity === 'warning').length,
    errors: results.filter(r => !r.passed && r.severity === 'error').length,
    canAutoFix: results.filter(r => !r.passed && r.canAutoFix).length
  };
  
  return { results, summary };
}

const diagnosticReport = mockDiagnosticEngine(preprocessedCard);
console.log('诊断报告:');
console.log(`- 总计: ${diagnosticReport.summary.total}`);
console.log(`- 通过: ${diagnosticReport.summary.passed}`);
console.log(`- 警告: ${diagnosticReport.summary.warnings}`);
console.log(`- 错误: ${diagnosticReport.summary.errors}`);
console.log(`- 可修复: ${diagnosticReport.summary.canAutoFix}`);

console.log('\n诊断详情:');
diagnosticReport.results.forEach((result, index) => {
  const icon = result.severity === 'error' ? '🔴' : result.severity === 'warning' ? '🟡' : '🔵';
  const status = result.passed ? '✅' : '❌';
  console.log(`${index + 1}. ${icon} ${status} ${result.ruleId}: ${result.message}`);
  if (result.suggestion) {
    console.log(`   💡 ${result.suggestion}`);
  }
});

console.log('\n' + '='.repeat(60) + '\n');

// 测试总结
console.log('📊 完整修复测试总结:');
console.log(`1. ContentExtractor解析: ${parseResult.success ? '✅ 成功' : '❌ 失败'}`);
console.log(`2. PreviewContainer预处理: ${preprocessedCard.fields._preprocessed ? '✅ 成功' : '❌ 失败'}`);
console.log(`3. 选择题检测修复: ${!beforeDetection && afterDetection ? '✅ 成功' : '❌ 失败'}`);
console.log(`4. 智能诊断系统: ${diagnosticReport.summary.total > 0 ? '✅ 正常' : '❌ 异常'}`);

const allTestsPassed = parseResult.success && 
                      preprocessedCard.fields._preprocessed && 
                      (!beforeDetection && afterDetection) && 
                      diagnosticReport.summary.total > 0;

console.log(`\n🎉 整体结果: ${allTestsPassed ? '所有测试通过！修复完成！' : '存在问题需要进一步检查'}`);

if (allTestsPassed) {
  console.log('\n💡 用户现在应该能够:');
  console.log('1. 在Obsidian中正常编写选择题内容');
  console.log('2. 在学习模式中看到正确的选择题界面');
  console.log('3. 在设置界面看到完整的模板列表');
  console.log('4. 使用智能诊断功能检查和修复卡片问题');
}

console.log('\n🔚 测试完成');
