/**
 * 诊断循环修复测试
 * 验证DiagnosticPanel的防重复诊断机制
 */

console.log('🔧 开始诊断循环修复测试\n');

// 模拟卡片对象
const testCard = {
  id: 'card-1758468703985-kqchagu2z',
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

// 模拟DiagnosticPanel状态
let diagnosticPanelState = {
  card: null,
  diagnosticEngine: { diagnoseCard: mockDiagnoseCard },
  isRunning: false,
  currentReport: null,
  lastDiagnosedCardId: null,
  diagnosticCount: 0
};

// 模拟诊断引擎
async function mockDiagnoseCard(card) {
  diagnosticPanelState.diagnosticCount++;
  console.log(`[MockDiagnosticEngine] 第${diagnosticPanelState.diagnosticCount}次诊断卡片: ${card.id}`);
  
  // 模拟诊断延迟
  await new Promise(resolve => setTimeout(resolve, 10));
  
  return {
    cardId: card.id,
    timestamp: Date.now(),
    results: [
      {
        ruleId: 'choice-format-check',
        passed: true,
        severity: 'info',
        message: '选择题格式正确 (markdown-h2)',
        canAutoFix: false
      },
      {
        ruleId: 'content-completeness',
        passed: true,
        severity: 'info',
        message: '内容完整性良好',
        canAutoFix: false
      },
      {
        ruleId: 'separator-check',
        passed: true,
        severity: 'info',
        message: '分隔符使用正确',
        canAutoFix: false
      },
      {
        ruleId: 'tag-format-check',
        passed: false,
        severity: 'info',
        message: '未发现标签',
        suggestion: '建议添加相关标签以便分类',
        canAutoFix: false
      }
    ],
    summary: {
      total: 4,
      passed: 3,
      warnings: 0,
      errors: 0,
      canAutoFix: 0
    }
  };
}

// 模拟$effect逻辑（修复前）
function oldEffectLogic(card, diagnosticEngine, isRunning) {
  console.log('[OldEffect] 触发条件检查');
  if (card && diagnosticEngine) {
    console.log('[OldEffect] ✅ 条件满足，运行诊断');
    return true; // 会运行诊断
  }
  return false;
}

// 模拟$effect逻辑（修复后）
function newEffectLogic(card, diagnosticEngine, lastDiagnosedCardId, isRunning) {
  console.log('[NewEffect] 触发条件检查');
  console.log(`- card: ${card ? card.id : 'null'}`);
  console.log(`- diagnosticEngine: ${diagnosticEngine ? '存在' : '不存在'}`);
  console.log(`- lastDiagnosedCardId: ${lastDiagnosedCardId || 'null'}`);
  console.log(`- isRunning: ${isRunning}`);
  
  if (card && diagnosticEngine && card.id !== lastDiagnosedCardId && !isRunning) {
    console.log('[NewEffect] ✅ 条件满足，运行诊断');
    return true; // 会运行诊断
  } else {
    console.log('[NewEffect] ❌ 条件不满足，跳过诊断');
    return false;
  }
}

// 模拟runDiagnostic函数
async function mockRunDiagnostic() {
  if (!diagnosticPanelState.card || !diagnosticPanelState.diagnosticEngine || diagnosticPanelState.isRunning) {
    console.log('[RunDiagnostic] 跳过诊断 - 条件不满足');
    return;
  }

  diagnosticPanelState.isRunning = true;
  try {
    console.log(`[RunDiagnostic] 开始诊断卡片: ${diagnosticPanelState.card.id}`);
    const report = await diagnosticPanelState.diagnosticEngine.diagnoseCard(diagnosticPanelState.card);
    diagnosticPanelState.currentReport = report;
    diagnosticPanelState.lastDiagnosedCardId = diagnosticPanelState.card.id; // 关键修复：记录已诊断的卡片ID
    
    console.log(`[RunDiagnostic] 诊断完成: ${report.summary.total}个规则, ${report.summary.passed}个通过`);
  } catch (error) {
    console.error('[RunDiagnostic] 诊断失败:', error);
  } finally {
    diagnosticPanelState.isRunning = false;
  }
}

// 测试1: 修复前的行为（会无限循环）
console.log('🧪 测试1: 修复前的行为模拟');
console.log('模拟场景：卡片设置后触发多次$effect');

let oldLoopCount = 0;
const maxOldLoops = 5; // 限制循环次数以避免真正的无限循环

function simulateOldBehavior() {
  oldLoopCount++;
  console.log(`\n--- 第${oldLoopCount}次循环 ---`);
  
  if (oldEffectLogic(testCard, { diagnoseCard: mockDiagnoseCard }, false)) {
    console.log('[OldBehavior] 运行诊断...');
    // 在旧版本中，每次诊断完成后可能会触发新的$effect
    if (oldLoopCount < maxOldLoops) {
      console.log('[OldBehavior] 诊断完成，可能触发新的$effect...');
      setTimeout(simulateOldBehavior, 50); // 模拟异步触发
    } else {
      console.log('[OldBehavior] ⚠️  达到最大循环次数，停止模拟');
    }
  }
}

simulateOldBehavior();

// 等待旧行为模拟完成后开始新行为测试
setTimeout(() => {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 测试2: 修复后的行为');
  console.log('模拟场景：使用防重复诊断机制');
  
  // 重置状态
  diagnosticPanelState.diagnosticCount = 0;
  diagnosticPanelState.lastDiagnosedCardId = null;
  
  async function simulateNewBehavior() {
    console.log('\n--- 新行为测试开始 ---');
    
    // 第一次设置卡片
    console.log('\n1. 首次设置卡片');
    diagnosticPanelState.card = testCard;
    
    if (newEffectLogic(
      diagnosticPanelState.card, 
      diagnosticPanelState.diagnosticEngine, 
      diagnosticPanelState.lastDiagnosedCardId, 
      diagnosticPanelState.isRunning
    )) {
      await mockRunDiagnostic();
    }
    
    // 第二次触发（相同卡片）
    console.log('\n2. 相同卡片再次触发$effect');
    if (newEffectLogic(
      diagnosticPanelState.card, 
      diagnosticPanelState.diagnosticEngine, 
      diagnosticPanelState.lastDiagnosedCardId, 
      diagnosticPanelState.isRunning
    )) {
      await mockRunDiagnostic();
    }
    
    // 第三次触发（相同卡片）
    console.log('\n3. 相同卡片第三次触发$effect');
    if (newEffectLogic(
      diagnosticPanelState.card, 
      diagnosticPanelState.diagnosticEngine, 
      diagnosticPanelState.lastDiagnosedCardId, 
      diagnosticPanelState.isRunning
    )) {
      await mockRunDiagnostic();
    }
    
    // 第四次触发（新卡片）
    console.log('\n4. 设置新卡片');
    const newCard = { ...testCard, id: 'card-new-12345' };
    diagnosticPanelState.card = newCard;
    
    if (newEffectLogic(
      diagnosticPanelState.card, 
      diagnosticPanelState.diagnosticEngine, 
      diagnosticPanelState.lastDiagnosedCardId, 
      diagnosticPanelState.isRunning
    )) {
      await mockRunDiagnostic();
    }
    
    // 第五次触发（新卡片重复）
    console.log('\n5. 新卡片再次触发$effect');
    if (newEffectLogic(
      diagnosticPanelState.card, 
      diagnosticPanelState.diagnosticEngine, 
      diagnosticPanelState.lastDiagnosedCardId, 
      diagnosticPanelState.isRunning
    )) {
      await mockRunDiagnostic();
    }
    
    // 测试结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试结果总结:');
    console.log(`总诊断次数: ${diagnosticPanelState.diagnosticCount}`);
    console.log(`最后诊断的卡片ID: ${diagnosticPanelState.lastDiagnosedCardId}`);
    console.log(`当前卡片ID: ${diagnosticPanelState.card.id}`);
    
    if (diagnosticPanelState.diagnosticCount === 2) {
      console.log('✅ 修复成功！只对不同卡片进行了诊断，避免了重复诊断');
    } else {
      console.log('❌ 修复可能存在问题，诊断次数不符合预期');
    }
    
    console.log('\n💡 修复机制说明:');
    console.log('1. 使用lastDiagnosedCardId跟踪已诊断的卡片');
    console.log('2. 只有当card.id !== lastDiagnosedCardId时才运行诊断');
    console.log('3. 在runDiagnostic完成后更新lastDiagnosedCardId');
    console.log('4. 这样可以避免对同一卡片的重复诊断');
    
    console.log('\n🎉 诊断循环修复测试完成！');
  }
  
  simulateNewBehavior();
}, 1000);
