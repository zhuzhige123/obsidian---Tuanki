#!/usr/bin/env node

/**
 * 清理项目中的多余空行
 * 规则：
 * - 最多连续2个空行
 * - 函数间保持1个空行
 * - 文件末尾保持1个空行
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 需要处理的文件扩展名
const TARGET_EXTENSIONS = ['.ts', '.js', '.svelte', '.vue', '.jsx', '.tsx'];

// 排除的目录
const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', '.svelte-kit'];

/**
 * 清理文件中的多余空行
 */
function cleanEmptyLines(content) {
  // 将内容按行分割
  const lines = content.split('\n');
  const cleanedLines = [];
  let consecutiveEmptyLines = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isEmptyLine = line.trim() === '';
    
    if (isEmptyLine) {
      consecutiveEmptyLines++;
      // 最多允许连续2个空行
      if (consecutiveEmptyLines <= 2) {
        cleanedLines.push(line);
      }
    } else {
      consecutiveEmptyLines = 0;
      cleanedLines.push(line);
    }
  }
  
  // 确保文件末尾只有一个空行
  while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1].trim() === '') {
    cleanedLines.pop();
  }
  cleanedLines.push(''); // 添加一个空行
  
  return cleanedLines.join('\n');
}

/**
 * 检查文件是否需要处理
 */
function shouldProcessFile(filePath) {
  const ext = path.extname(filePath);
  return TARGET_EXTENSIONS.includes(ext);
}

/**
 * 检查目录是否应该排除
 */
function shouldExcludeDir(dirName) {
  return EXCLUDE_DIRS.includes(dirName);
}

/**
 * 递归处理目录
 */
function processDirectory(dirPath) {
  const stats = {
    totalFiles: 0,
    processedFiles: 0,
    savedLines: 0
  };
  
  function processDir(currentPath) {
    const items = fs.readdirSync(currentPath);
    
    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        if (!shouldExcludeDir(item)) {
          processDir(itemPath);
        }
      } else if (stat.isFile() && shouldProcessFile(itemPath)) {
        stats.totalFiles++;
        
        try {
          const originalContent = fs.readFileSync(itemPath, 'utf8');
          const cleanedContent = cleanEmptyLines(originalContent);
          
          if (originalContent !== cleanedContent) {
            fs.writeFileSync(itemPath, cleanedContent, 'utf8');
            
            const originalLines = originalContent.split('\n').length;
            const cleanedLines = cleanedContent.split('\n').length;
            const savedLines = originalLines - cleanedLines;
            
            stats.processedFiles++;
            stats.savedLines += savedLines;
            
            console.log(`✅ ${itemPath}: 减少 ${savedLines} 行`);
          }
        } catch (error) {
          console.error(`❌ 处理文件失败 ${itemPath}:`, error.message);
        }
      }
    }
  }
  
  processDir(dirPath);
  return stats;
}

/**
 * 主函数
 */
function main() {
  const projectRoot = path.join(__dirname, '..');
  
  console.log('🧹 开始清理项目中的多余空行...');
  console.log(`📁 项目根目录: ${projectRoot}`);
  console.log(`📝 处理文件类型: ${TARGET_EXTENSIONS.join(', ')}`);
  console.log(`🚫 排除目录: ${EXCLUDE_DIRS.join(', ')}`);
  console.log('');
  
  const startTime = Date.now();
  const stats = processDirectory(projectRoot);
  const endTime = Date.now();
  
  console.log('');
  console.log('📊 清理完成统计:');
  console.log(`   总文件数: ${stats.totalFiles}`);
  console.log(`   处理文件数: ${stats.processedFiles}`);
  console.log(`   减少行数: ${stats.savedLines}`);
  console.log(`   耗时: ${endTime - startTime}ms`);
  
  if (stats.processedFiles > 0) {
    console.log('');
    console.log('✨ 代码清理完成！项目现在更加整洁了。');
  } else {
    console.log('');
    console.log('✅ 项目代码已经很整洁，无需清理。');
  }
}

// 运行脚本
main();

export { cleanEmptyLines, processDirectory };
