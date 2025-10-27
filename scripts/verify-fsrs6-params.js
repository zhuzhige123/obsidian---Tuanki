#!/usr/bin/env node

/**
 * 🔧 FSRS6参数一致性验证脚本
 * 验证所有FSRS6权重参数定义都是21个参数
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 需要检查的文件和对应的参数位置
const filesToCheck = [
  {
    file: 'src/main.ts',
    description: 'DEFAULT_SETTINGS.fsrsParams.w',
    pattern: /w:\s*\[([\d\.,\s]+)\]/,
    lineContext: 'DEFAULT_SETTINGS'
  },
  {
    file: 'src/data/storage.ts',
    description: 'createDefaultUserProfile.fsrsParams.w',
    pattern: /w:\s*\[([\d\.,\s]+)\]/,
    lineContext: 'createDefaultUserProfile'
  },
  {
    file: 'src/importers/apkg-mapping-config.ts',
    description: 'generateDefaultDeckSettings.fsrsParams.w',
    pattern: /w:\s*\[([\d\.,\s]+)\]/,
    lineContext: 'generateDefaultDeckSettings'
  },
  {
    file: 'src/algorithms/fsrs.ts',
    description: 'FSRS constructor default w',
    pattern: /w:\s*\[([\d\.,\s]+)\]/,
    lineContext: 'constructor'
  },
  {
    file: 'src/components/settings/constants/settings-constants.ts',
    description: 'FSRS6_DEFAULTS.DEFAULT_WEIGHTS',
    pattern: /DEFAULT_WEIGHTS:\s*\[([\d\.,\s]+)\]/,
    lineContext: 'FSRS6_DEFAULTS'
  }
];

console.log('🔧 开始验证FSRS6参数一致性...\n');

let allConsistent = true;
const results = [];

for (const { file, description, pattern, lineContext } of filesToCheck) {
  const filePath = path.join(__dirname, '..', file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  文件不存在: ${file}`);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // 查找包含权重参数的行
  let foundParams = null;
  let lineNumber = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(lineContext)) {
      // 在上下文附近查找权重参数
      for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 20); j++) {
        const match = lines[j].match(pattern);
        if (match) {
          foundParams = match[1];
          lineNumber = j + 1;
          break;
        }
      }
      break;
    }
  }

  if (foundParams) {
    // 解析参数数量
    const params = foundParams.split(',').map(p => p.trim()).filter(p => p.length > 0);
    const paramCount = params.length;
    
    const result = {
      file,
      description,
      lineNumber,
      paramCount,
      isCorrect: paramCount === 21,
      firstFew: params.slice(0, 3).join(', '),
      lastFew: params.slice(-3).join(', ')
    };
    
    results.push(result);
    
    if (paramCount === 21) {
      console.log(`✅ ${description}: ${paramCount}个参数 (正确)`);
    } else {
      console.log(`❌ ${description}: ${paramCount}个参数 (错误，应为21个)`);
      console.log(`   📍 位置: ${file}:${lineNumber}`);
      allConsistent = false;
    }
  } else {
    console.log(`⚠️  未找到权重参数: ${description} in ${file}`);
    allConsistent = false;
  }
}

console.log('\n📊 验证结果汇总:');
console.log('='.repeat(50));

results.forEach(result => {
  const status = result.isCorrect ? '✅' : '❌';
  console.log(`${status} ${result.description}`);
  console.log(`   📁 ${result.file}:${result.lineNumber}`);
  console.log(`   🔢 参数数量: ${result.paramCount}`);
  console.log(`   📝 前3个: ${result.firstFew}...`);
  console.log(`   📝 后3个: ...${result.lastFew}`);
  console.log('');
});

if (allConsistent) {
  console.log('🎉 所有FSRS6参数定义都是一致的21个参数！');
  process.exit(0);
} else {
  console.log('⚠️  发现FSRS6参数不一致问题，需要修复！');
  process.exit(1);
}
