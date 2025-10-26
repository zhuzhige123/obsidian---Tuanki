/**
 * 集成测试 - 验证卡片解析系统的完整功能
 */

import { runAllTests } from './utils/cardParser/test';
import { BatchCardParser } from './utils/batchCardParser';
import { PresetManager } from './utils/cardParser/PresetManager';

/**
 * 运行集成测试
 */
async function runIntegrationTests(): Promise<void> {
  console.log('🧪 开始 Tuanki 卡片解析系统集成测试...\n');

  // 1. 运行核心解析引擎测试
  console.log('='.repeat(50));
  console.log('📋 第一阶段：核心解析引擎测试');
  console.log('='.repeat(50));
  runAllTests();

  // 2. 测试 BatchCardParser 集成
  console.log('\n' + '='.repeat(50));
  console.log('📋 第二阶段：BatchCardParser 集成测试');
  console.log('='.repeat(50));
  await testBatchCardParserIntegration();

  // 3. 测试预设管理器
  console.log('\n' + '='.repeat(50));
  console.log('📋 第三阶段：预设管理器测试');
  console.log('='.repeat(50));
  testPresetManagerIntegration();

  console.log('\n🎉 集成测试完成！');
}

/**
 * 测试 BatchCardParser 与新引擎的集成
 */
async function testBatchCardParserIntegration(): Promise<void> {
  console.log('🔧 测试 BatchCardParser 集成...');

  // 创建模拟插件设置
  const mockPlugin = {
    settings: {
      cardParsing: new PresetManager().getDefaultSettings()
    }
  };

  const parser = new BatchCardParser(undefined, mockPlugin as any);

  const testContent = `# 测试卡片

这是一个==重要概念==的测试。

---div---

这是答案部分，解释了==重要概念==的含义。`;

  try {
    // 测试新引擎解析
    const result = await parser.parseWithNewEngineFromContent(testContent, {
      sourcePath: 'test.md',
      sourceFileName: 'test.md'
    });

    console.log('📊 解析结果统计:');
    console.log(`   - 成功卡片: ${result.stats.successCount}`);
    console.log(`   - 失败卡片: ${result.stats.failedCount}`);
    console.log(`   - 解析时间: ${result.stats.parseTime}ms`);
    console.log(`   - 警告数量: ${result.warnings.length}`);

    if (result.cards.length > 0) {
      console.log('✅ BatchCardParser 集成测试通过');
      console.log('📝 第一张卡片预览:');
      console.log(`   正面: ${result.cards[0].front.substring(0, 50)}...`);
      console.log(`   背面: ${result.cards[0].back.substring(0, 50)}...`);
    } else {
      console.log('❌ BatchCardParser 集成测试失败：未生成卡片');
    }

  } catch (error) {
    console.log('❌ BatchCardParser 集成测试异常:', error);
  }
}

/**
 * 测试预设管理器集成
 */
function testPresetManagerIntegration(): void {
  console.log('🎨 测试预设管理器集成...');

  const presetManager = new PresetManager();

  try {
    // 测试获取所有预设
    const presets = presetManager.getAllPresets();
    console.log(`📦 可用预设数量: ${presets.length}`);

    presets.forEach(preset => {
      console.log(`   - ${preset.name} (${preset.category}): ${preset.rules.length} 个规则`);
    });

    // 测试默认设置
    const defaultSettings = presetManager.getDefaultSettings();
    console.log(`⚙️ 默认设置包含 ${defaultSettings.rules.length} 个规则`);

    // 测试预设应用
    if (presets.length > 0) {
      const firstPreset = presets[0];
      const appliedSettings = presetManager.applyPreset(firstPreset.id, defaultSettings);
      console.log(`✅ 预设 "${firstPreset.name}" 应用成功`);
      console.log(`   应用后规则数量: ${appliedSettings.rules.length}`);
    }

    // 测试导出/导入
    if (presets.length > 0) {
      const firstPreset = presets[0];
      const exportedJson = presetManager.exportPreset(firstPreset.id);
      console.log(`📤 预设导出成功，JSON 长度: ${exportedJson.length}`);

      try {
        const importedPreset = presetManager.importPreset(exportedJson);
        console.log(`📥 预设导入成功: ${importedPreset.name}`);
      } catch (error) {
        console.log(`❌ 预设导入失败: ${error}`);
      }
    }

    console.log('✅ 预设管理器集成测试通过');

  } catch (error) {
    console.log('❌ 预设管理器集成测试失败:', error);
  }
}

/**
 * 性能基准测试
 */
async function runPerformanceBenchmark(): Promise<void> {
  console.log('\n' + '='.repeat(50));
  console.log('📋 性能基准测试');
  console.log('='.repeat(50));

  const presetManager = new PresetManager();
  const mockPlugin = {
    settings: {
      cardParsing: presetManager.getDefaultSettings()
    }
  };

  const parser = new BatchCardParser(undefined, mockPlugin as any);

  // 生成不同大小的测试内容
  const testSizes = [100, 1000, 5000, 10000]; // 字符数

  for (const size of testSizes) {
    const content = generateTestContent(size);
    console.log(`\n📏 测试内容大小: ${size} 字符`);

    const startTime = performance.now();
    const result = await parser.parseWithNewEngineFromContent(content);
    const endTime = performance.now();

    const parseTime = endTime - startTime;
    const throughput = size / parseTime * 1000; // 字符/秒

    console.log(`   ⏱️ 解析时间: ${parseTime.toFixed(2)}ms`);
    console.log(`   🚀 吞吐量: ${throughput.toFixed(0)} 字符/秒`);
    console.log(`   📊 生成卡片: ${result.cards.length} 张`);

    if (parseTime > 1000) {
      console.log('   ⚠️ 性能警告：解析时间超过 1 秒');
    } else {
      console.log('   ✅ 性能良好');
    }
  }
}

/**
 * 生成指定大小的测试内容
 */
function generateTestContent(targetSize: number): string {
  const basePattern = `这是第 {i} 个==测试内容==。

---div---

这是第 {i} 个答案内容。

`;

  let content = '';
  let i = 1;

  while (content.length < targetSize) {
    content += basePattern.replace(/{i}/g, i.toString());
    i++;
  }

  return content.substring(0, targetSize);
}

// 主函数
async function main(): Promise<void> {
  try {
    await runIntegrationTests();
    await runPerformanceBenchmark();
    console.log('\n🎊 所有测试完成！系统运行正常。');
  } catch (error) {
    console.error('💥 测试过程中发生错误:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (typeof window === 'undefined' && require.main === module) {
  main();
}

export { runIntegrationTests, runPerformanceBenchmark };
