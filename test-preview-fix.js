/**
 * 测试PreviewContainer修复效果
 * 验证选择题数据流是否正确
 */

// 模拟ContentExtractor
class MockContentExtractor {
  static getInstance() {
    return new MockContentExtractor();
  }

  parseChoiceContent(content) {
    console.log('🔍 [MockContentExtractor] 解析选择题内容:', content.substring(0, 100) + '...');
    
    // 格式1: ## 题目\n**选项**:\nA. 选项1\nB. 选项2\n---div---\n答案
    const h2OptionsPattern = /^##\s*(.+?)\n\*\*选项\*\*:\s*\n((?:[A-E]\..*?\n?)+)(?:---div---\s*\n([\s\S]*))?$/m;
    const h2Match = content.match(h2OptionsPattern);
    
    if (h2Match) {
      const [, question, options, backContent] = h2Match;
      
      return {
        success: true,
        question: question.trim(),
        options: options.trim(),
        correctAnswer: 'D',
        explanation: '这是解析内容',
        tags: 'JavaScript,数据类型,基础知识',
        confidence: 0.95,
        format: 'markdown-h2'
      };
    }

    return {
      success: false,
      question: '',
      options: '',
      confidence: 0,
      format: 'unknown'
    };
  }
}

// 模拟isMultipleChoiceCard函数
function mockIsMultipleChoiceCard(fields) {
  console.log('🔍 [mockIsMultipleChoiceCard] 检查字段:', Object.keys(fields));
  
  // 检查新格式（预处理后的字段）
  if (fields.options && fields.question && fields.correct_answer) {
    console.log('✅ [mockIsMultipleChoiceCard] 检测到结构化选择题字段');
    return true;
  }

  // 检查Markdown格式
  const frontContent = fields.front || fields.Front || '';
  if (!frontContent) return false;

  // 模式1: ## 题目\n**选项**:\nA. 选项1\nB. 选项2
  const h2OptionsPattern = /##\s*.+?\n\*\*选项\*\*:\s*\n(?:[A-E]\..+?\n?){2,}/ms;
  if (h2OptionsPattern.test(frontContent)) {
    console.log('✅ [mockIsMultipleChoiceCard] 检测到Markdown选择题格式');
    return true;
  }

  console.log('❌ [mockIsMultipleChoiceCard] 未检测到选择题格式');
  return false;
}

// 模拟PreviewContainer的预处理逻辑
function testPreprocessCardForRendering(card) {
  console.log('\n🧪 测试PreviewContainer预处理逻辑');
  console.log('📥 输入卡片:', {
    id: card.id,
    fields: Object.keys(card.fields)
  });

  const contentExtractor = MockContentExtractor.getInstance();
  
  // 检查是否需要预处理
  const frontContent = card.fields.front || card.fields.Front || '';
  if (!frontContent) {
    console.log('⚠️  没有front内容，跳过预处理');
    return card;
  }

  // 尝试解析选择题内容
  const choiceResult = contentExtractor.parseChoiceContent(frontContent);
  if (choiceResult.success) {
    console.log('✅ 检测到选择题格式，进行预处理');
    
    const preprocessedCard = {
      ...card,
      fields: {
        ...card.fields,
        // 添加结构化字段
        question: choiceResult.question,
        options: choiceResult.options,
        correct_answer: choiceResult.correctAnswer || '',
        explanation: choiceResult.explanation || '',
        tags: choiceResult.tags || '',
        // 保留原始内容
        _original_front: frontContent,
        _preprocessed: 'true',
        _format: choiceResult.format,
        _confidence: choiceResult.confidence.toString()
      }
    };

    console.log('📤 预处理后的卡片字段:', Object.keys(preprocessedCard.fields));
    return preprocessedCard;
  }

  console.log('ℹ️  不是选择题，返回原始卡片');
  return card;
}

// 测试选择题检测逻辑
function testChoiceDetection(card) {
  console.log('\n🧪 测试选择题检测逻辑');
  
  // 预处理前检测
  console.log('📋 预处理前检测:');
  const beforeResult = mockIsMultipleChoiceCard(card.fields);
  console.log(`结果: ${beforeResult ? '✅ 检测为选择题' : '❌ 未检测为选择题'}`);

  // 预处理
  const preprocessedCard = testPreprocessCardForRendering(card);

  // 预处理后检测
  console.log('\n📋 预处理后检测:');
  const afterResult = mockIsMultipleChoiceCard(preprocessedCard.fields);
  console.log(`结果: ${afterResult ? '✅ 检测为选择题' : '❌ 未检测为选择题'}`);

  return {
    before: beforeResult,
    after: afterResult,
    preprocessedCard
  };
}

// 运行测试
function runTests() {
  console.log('🎯 开始测试PreviewContainer修复效果\n');

  // 测试用例：用户提供的选择题格式
  const testCard = {
    id: 'test-choice-card-001',
    fields: {
      front: `## 以下哪个是JavaScript的基本数据类型？
**选项**:
A. string（字符串）
B. number（数字）
C. boolean（布尔值）
D. 以上都是

---div---

**解析**: JavaScript有七种基本数据类型...
**标签**: JavaScript,数据类型,基础知识`
    }
  };

  const result = testChoiceDetection(testCard);

  console.log('\n📊 测试结果总结:');
  console.log(`预处理前检测: ${result.before ? '✅ 成功' : '❌ 失败'}`);
  console.log(`预处理后检测: ${result.after ? '✅ 成功' : '❌ 失败'}`);
  console.log(`修复效果: ${!result.before && result.after ? '🎉 修复成功！' : '⚠️  需要进一步检查'}`);

  if (result.after) {
    console.log('\n🔍 预处理后的字段内容:');
    console.log('question:', result.preprocessedCard.fields.question);
    console.log('options:', result.preprocessedCard.fields.options.replace(/\n/g, ' | '));
    console.log('correct_answer:', result.preprocessedCard.fields.correct_answer);
    console.log('explanation:', result.preprocessedCard.fields.explanation);
  }
}

// 执行测试
runTests();
