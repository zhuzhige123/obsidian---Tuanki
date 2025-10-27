/**
 * Tuanki 激活码生成脚本（安全版本）
 * 
 * ⚠️ 私钥通过环境变量或外部文件提供，不包含在此文件中
 * 
 * 使用方法：
 * 
 * 方式1：指定私钥文件路径（推荐）
 *   node scripts/generate-activation-codes-secure.cjs 10 --key-file="D:\tuanki-private\private-key.pem"
 * 
 * 方式2：环境变量（用于自动化）
 *   Windows PowerShell:
 *     $env:TUANKI_PRIVATE_KEY = Get-Content "D:\tuanki-private\private-key.pem" -Raw
 *     node scripts/generate-activation-codes-secure.cjs 10
 * 
 * 参数说明：
 *   数量: 要生成的激活码数量（必填）
 *   --key-file: 私钥文件路径（可选，如不指定则从环境变量读取）
 *   --license-type: 许可类型 lifetime/subscription（默认lifetime）
 *   --max-devices: 最大设备数（默认3）
 *   --expires-years: 有效年限（默认10年）
 * 
 * 示例：
 *   # 生成20个终身许可激活码
 *   node scripts/generate-activation-codes-secure.cjs 20 --key-file="D:\tuanki-private\private-key.pem"
 *   
 *   # 生成5个年度订阅激活码
 *   node scripts/generate-activation-codes-secure.cjs 5 --key-file="D:\tuanki-private\private-key.pem" --license-type=subscription --expires-years=1
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ========================================
// 配置区域
// ========================================

const PRODUCT_ID = 'tuanki-obsidian-plugin';

// ✅ 公钥（可以公开，用于验证生成的激活码）
// 此公钥与客户端 src/utils/licenseManager.ts 中的公钥一致
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuFbE7080dfi90uTpCncI
n9wCXxPwz2r485ckXN0HO7yawwZTcSPf9I03GUg0EeyCj378AgnFUcj7GZ14Cnox
aCFhKje/u9PwBkUGiEb9Cgu6KkY29S1BPFZC9FBYE/N9Ymkw/vPZbR+0/4c8Uhu7
ou+Do+2e+C7s3UVBKRnXea4E54v/mGPOWttjvF+vwStg/x3hvDjIcfMqg3s74OVt
2vJqfOoVvqNnEVzx4wEPnAi5xD5p4Bxz2gXDlzRL+6HV2n55fdBJou+avIihxwUM
KiqnLPDZDoj1QmooLvpFj3j7/9dWyUfbKmJv3D1+hmdbeltKDYZJc9WdIU+v7Bmi
+wIDAQAB
-----END PUBLIC KEY-----`;

// ========================================
// 私钥加载逻辑
// ========================================

/**
 * 从多个来源加载私钥
 * 优先级：命令行参数 > 环境变量 > 默认路径
 */
function loadPrivateKey() {
  // 1. 从命令行参数读取
  const keyFileArg = process.argv.find(arg => arg.startsWith('--key-file='));
  if (keyFileArg) {
    const keyFilePath = keyFileArg.split('=')[1].replace(/["']/g, '');
    if (fs.existsSync(keyFilePath)) {
      console.log(`✅ 从指定文件加载私钥: ${keyFilePath}`);
      return fs.readFileSync(keyFilePath, 'utf-8');
    } else {
      console.error(`❌ 私钥文件不存在: ${keyFilePath}`);
      process.exit(1);
    }
  }

  // 2. 从环境变量读取
  if (process.env.TUANKI_PRIVATE_KEY) {
    console.log('✅ 从环境变量 TUANKI_PRIVATE_KEY 加载私钥');
    return process.env.TUANKI_PRIVATE_KEY;
  }

  // 3. 尝试默认路径（项目外）
  const defaultPaths = [
    'D:\\tuanki-private\\private-key.pem',
    path.join(process.env.USERPROFILE || '', 'tuanki-private', 'private-key.pem'),
    path.join(__dirname, '..', '..', 'tuanki-private', 'private-key.pem')
  ];

  for (const defaultPath of defaultPaths) {
    if (fs.existsSync(defaultPath)) {
      console.log(`✅ 从默认路径加载私钥: ${defaultPath}`);
      return fs.readFileSync(defaultPath, 'utf-8');
    }
  }

  // 4. 找不到私钥
  console.error(`
❌ 错误：未找到私钥

私钥加载失败，请使用以下任一方式提供私钥：

方式1：命令行参数（推荐）
  node scripts/generate-activation-codes-secure.cjs 10 --key-file="D:\\tuanki-private\\private-key.pem"

方式2：环境变量
  Windows PowerShell:
    $env:TUANKI_PRIVATE_KEY = Get-Content "D:\\tuanki-private\\private-key.pem" -Raw
    node scripts/generate-activation-codes-secure.cjs 10

方式3：将私钥文件放在以下任一默认路径：
  - D:\\tuanki-private\\private-key.pem
  - %USERPROFILE%\\tuanki-private\\private-key.pem

⚠️ 重要提醒：
  - 私钥文件必须保密，不要提交到Git
  - 建议将私钥存储在项目目录之外
  - 定期备份私钥到安全位置（至少3份：本地+移动硬盘+加密云盘）

📚 详细文档：
  请查看 docs/PRIVATE_KEY_SETUP.md
  `);
  process.exit(1);
}

// ========================================
// 激活码生成逻辑
// ========================================

/**
 * 验证私钥是否有效
 */
function validatePrivateKey(privateKey) {
  try {
    const testData = 'tuanki-test-data-' + Date.now();
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(testData);
    sign.end();
    const signature = sign.sign(privateKey);

    // 用公钥验证签名
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(testData);
    verify.end();
    const isValid = verify.verify(PUBLIC_KEY, signature);

    if (isValid) {
      console.log('✅ 私钥验证成功（与公钥匹配）');
      return true;
    } else {
      console.error('❌ 私钥验证失败：私钥与公钥不匹配');
      console.error('💡 请确认私钥文件是否正确');
      return false;
    }
  } catch (error) {
    console.error('❌ 私钥验证失败:', error.message);
    console.log('💡 请检查私钥格式是否正确（应为PEM格式，以 -----BEGIN PRIVATE KEY----- 开头）');
    return false;
  }
}

/**
 * 生成单个激活码
 */
function generateActivationCode(privateKey, options = {}) {
  const {
    userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    licenseType = 'lifetime',
    expiresAt = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    maxDevices = 3,
    features = ['full_access'],
  } = options;

  const activationData = {
    userId,
    productId: PRODUCT_ID,
    licenseType,
    expiresAt,
    maxDevices,
    features,
    issuedAt: new Date().toISOString(),
  };

  const dataString = JSON.stringify(activationData);
  const dataBase64 = Buffer.from(dataString, 'utf-8').toString('base64');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(dataString);
  sign.end();
  const signature = sign.sign(privateKey);
  const signatureBase64 = signature.toString('base64');

  const activationCode = `${dataBase64}.${signatureBase64}`;

  return {
    activationCode,
    data: activationData,
  };
}

/**
 * 批量生成激活码
 */
function batchGenerate(privateKey, count, options = {}) {
  const codes = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const expiresDate = options.expiresAt ? new Date(options.expiresAt).toLocaleDateString('zh-CN') : '2035年';

  console.log(`\n${'='.repeat(60)}`);
  console.log('🎯 Tuanki 激活码批量生成');
  console.log(`${'='.repeat(60)}`);
  console.log(`📅 生成时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`📦 生成数量: ${count} 个`);
  console.log(`💎 许可类型: ${options.licenseType === 'subscription' ? '订阅制' : '终身许可'}`);
  console.log(`📱 最大设备: ${options.maxDevices || 3} 台`);
  console.log(`⏰ 有效期至: ${expiresDate}`);
  console.log(`${'='.repeat(60)}\n`);

  for (let i = 0; i < count; i++) {
    const result = generateActivationCode(privateKey, options);
    codes.push(result);
    
    // 显示进度
    const progress = Math.floor((i + 1) / count * 100);
    const progressBar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
    process.stdout.write(`\r生成进度: [${progressBar}] ${progress}% (${i + 1}/${count})`);
  }
  console.log('\n');

  // 保存JSON格式（完整数据）
  const jsonOutput = {
    generatedAt: new Date().toISOString(),
    generatedBy: 'Tuanki Activation Code Generator v2.0',
    count: codes.length,
    licenseType: options.licenseType || 'lifetime',
    maxDevices: options.maxDevices || 3,
    expiresAt: options.expiresAt || new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    codes: codes
  };

  const jsonFilename = `generated-codes-${timestamp}.json`;
  fs.writeFileSync(jsonFilename, JSON.stringify(jsonOutput, null, 2), 'utf-8');

  // 保存发卡平台格式（纯激活码，每行一个）
  const plainCodes = codes.map(c => c.activationCode).join('\n');
  const plainFilename = `codes-plain-${timestamp}.txt`;
  fs.writeFileSync(plainFilename, plainCodes, 'utf-8');

  // 保存带编号格式（便于用户识别）
  const numberedCodes = codes.map((c, i) => 
    `Tuanki终身许可-${String(i + 1).padStart(3, '0')} ${c.activationCode}`
  ).join('\n');
  const numberedFilename = `codes-numbered-${timestamp}.txt`;
  fs.writeFileSync(numberedFilename, numberedCodes, 'utf-8');

  console.log(`${'='.repeat(60)}`);
  console.log('✅ 激活码生成完成！');
  console.log(`${'='.repeat(60)}\n`);
  console.log('📁 生成的文件：');
  console.log(`   1. ${jsonFilename}`);
  console.log(`      → 完整数据（JSON格式，用于备份和记录）`);
  console.log(`   2. ${plainFilename}`);
  console.log(`      → 纯激活码（发卡平台导入格式）`);
  console.log(`   3. ${numberedFilename}`);
  console.log(`      → 带编号格式（仅选号模式）\n`);
  
  console.log('📝 后续操作：');
  console.log('   1. 将 codes-plain-*.txt 内容复制到发卡平台');
  console.log('   2. 妥善保存 generated-codes-*.json 作为备份');
  console.log('   3. 上传到发卡平台后，删除或移动本地激活码文件到安全位置');
  console.log('   4. 绝对不要将激活码文件提交到Git\n');
  
  console.log('⚠️ 安全提醒：');
  console.log('   - 生成的激活码文件包含敏感信息');
  console.log('   - 不要在公开场合分享');
  console.log('   - 不要提交到版本控制系统');
  console.log('   - 定期检查 .gitignore 是否正确配置\n');

  return codes;
}

// ========================================
// 主程序
// ========================================

function main() {
  console.log('\n🚀 Tuanki 激活码生成器 v2.0（安全版本）\n');

  // 解析命令行参数
  const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const count = parseInt(args[0]);

  if (!count || count <= 0) {
    console.error('❌ 错误：请指定要生成的激活码数量\n');
    console.log('用法示例：');
    console.log('  node scripts/generate-activation-codes-secure.cjs 20 --key-file="D:\\tuanki-private\\private-key.pem"\n');
    process.exit(1);
  }

  if (count > 1000) {
    console.warn('⚠️  警告：一次生成超过1000个激活码，确定继续吗？');
    console.warn('   建议分批生成，便于管理\n');
  }

  const options = {};
  
  // 解析许可类型
  const licenseTypeArg = process.argv.find(arg => arg.startsWith('--license-type='));
  if (licenseTypeArg) {
    options.licenseType = licenseTypeArg.split('=')[1];
  }

  // 解析最大设备数
  const maxDevicesArg = process.argv.find(arg => arg.startsWith('--max-devices='));
  if (maxDevicesArg) {
    options.maxDevices = parseInt(maxDevicesArg.split('=')[1]);
  }

  // 解析有效期
  const expiresYearsArg = process.argv.find(arg => arg.startsWith('--expires-years='));
  if (expiresYearsArg) {
    const years = parseInt(expiresYearsArg.split('=')[1]);
    options.expiresAt = new Date(Date.now() + years * 365 * 24 * 60 * 60 * 1000).toISOString();
  }

  // 加载私钥
  const privateKey = loadPrivateKey();

  // 验证私钥
  if (!validatePrivateKey(privateKey)) {
    process.exit(1);
  }

  // 生成激活码
  batchGenerate(privateKey, count, options);
}

// 运行主程序
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('\n❌ 发生错误:', error.message);
    console.error('\n如需帮助，请查看文档或联系技术支持\n');
    process.exit(1);
  }
}

module.exports = {
  generateActivationCode,
  batchGenerate,
  validatePrivateKey
};


