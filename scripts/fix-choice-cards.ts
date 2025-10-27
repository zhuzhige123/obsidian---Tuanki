/**
 * 数据修复脚本：清理选择题卡片中累积的 options 和 correctAnswers 字段
 * 
 * 问题：由于 card-markdown-serializer.ts 的 excludeFields 列表缺少选择题专用字段，
 * 导致这些字段被当作"其他字段"处理，每次编辑保存都会累积到 fields.back 中。
 * 
 * 修复策略：
 * 1. 从 fields.back 中移除所有 "## 其他字段" 及其后续内容
 * 2. 保留 fields.options 和 fields.correctAnswers 作为独立字段
 * 3. 仅处理包含 options 字段的选择题卡片
 */

import * as fs from 'fs';
import * as path from 'path';

interface Card {
  id: string;
  fields: {
    front?: string;
    back?: string;
    options?: string;
    correctAnswers?: string;
    hint?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface CardsData {
  _schemaVersion: string;
  deckId: string;
  cards: Card[];
}

/**
 * 清理 back 字段中的累积内容
 */
function cleanBackField(back: string | undefined): string {
  if (!back) return '';
  
  // 查找第一个 "## 其他字段" 的位置
  const otherFieldsMarker = '\n## 其他字段';
  const otherFieldsIndex = back.indexOf(otherFieldsMarker);
  
  if (otherFieldsIndex !== -1) {
    // 保留 "## 其他字段" 之前的内容
    const cleaned = back.substring(0, otherFieldsIndex).trim();
    console.log(`  ✂️  清理累积内容: 从 ${back.length} 字符缩减到 ${cleaned.length} 字符`);
    return cleaned;
  }
  
  return back;
}

/**
 * 检查卡片是否为选择题
 */
function isChoiceCard(card: Card): boolean {
  return !!(card.fields.options || card.fields.correctAnswers);
}

/**
 * 检查卡片的 back 字段是否被污染
 */
function isBackFieldPolluted(card: Card): boolean {
  const back = card.fields.back;
  return !!(back && back.includes('\n## 其他字段'));
}

/**
 * 修复单个卡片
 */
function fixCard(card: Card): boolean {
  if (!isChoiceCard(card)) {
    return false; // 不是选择题，跳过
  }
  
  if (!isBackFieldPolluted(card)) {
    return false; // 未被污染，跳过
  }
  
  console.log(`📝 修复卡片: ${card.id}`);
  console.log(`  原始 back 长度: ${card.fields.back?.length || 0} 字符`);
  
  // 清理 back 字段
  card.fields.back = cleanBackField(card.fields.back);
  
  console.log(`  清理后 back 长度: ${card.fields.back?.length || 0} 字符`);
  console.log(`  保留独立字段: options=${!!card.fields.options}, correctAnswers=${!!card.fields.correctAnswers}`);
  
  return true;
}

/**
 * 主函数
 */
async function main() {
  console.log('🔧 开始修复选择题卡片数据...\n');
  
  // 读取 cards.json
  const cardsPath = path.join(process.cwd(), 'cards.json');
  console.log(`📂 读取文件: ${cardsPath}`);
  
  if (!fs.existsSync(cardsPath)) {
    console.error('❌ 错误: cards.json 文件不存在！');
    process.exit(1);
  }
  
  // 检查备份
  const backupPath = cardsPath + '.backup';
  if (!fs.existsSync(backupPath)) {
    console.warn('⚠️  警告: 未找到备份文件，正在创建...');
    fs.copyFileSync(cardsPath, backupPath);
    console.log(`✅ 备份已创建: ${backupPath}`);
  }
  
  // 解析 JSON
  const rawData = fs.readFileSync(cardsPath, 'utf-8');
  const cardsData: CardsData = JSON.parse(rawData);
  
  console.log(`📊 卡片总数: ${cardsData.cards.length}\n`);
  
  // 统计信息
  let totalCards = cardsData.cards.length;
  let choiceCards = 0;
  let pollutedCards = 0;
  let fixedCards = 0;
  
  // 遍历所有卡片
  for (const card of cardsData.cards) {
    if (isChoiceCard(card)) {
      choiceCards++;
      
      if (isBackFieldPolluted(card)) {
        pollutedCards++;
        
        if (fixCard(card)) {
          fixedCards++;
        }
      }
    }
  }
  
  // 保存修复后的数据
  const outputData = JSON.stringify(cardsData, null, 2);
  fs.writeFileSync(cardsPath, outputData, 'utf-8');
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 修复统计:');
  console.log('='.repeat(60));
  console.log(`  总卡片数:       ${totalCards}`);
  console.log(`  选择题卡片:     ${choiceCards}`);
  console.log(`  被污染卡片:     ${pollutedCards}`);
  console.log(`  已修复卡片:     ${fixedCards}`);
  console.log('='.repeat(60));
  
  if (fixedCards > 0) {
    console.log('\n✅ 修复完成！已清理累积的 options 和 correctAnswers 字段。');
    console.log(`💾 原始文件已备份至: ${backupPath}`);
  } else {
    console.log('\n✨ 没有需要修复的卡片，数据完好！');
  }
}

// 执行脚本
main().catch(error => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});


