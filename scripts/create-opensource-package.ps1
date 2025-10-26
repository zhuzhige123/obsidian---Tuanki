# ============================================
# Tuanki 开源项目包创建脚本
# ============================================
# 用途：创建干净的、可以直接提交到GitHub的项目副本
# 使用：powershell -ExecutionPolicy Bypass -File scripts/create-opensource-package.ps1
# ============================================

param(
    [string]$TargetPath = "D:\桌面\tuanki-opensource"
)

Write-Host "`n" -NoNewline
Write-Host "="*70 -ForegroundColor Cyan
Write-Host "📦 Tuanki 开源项目包创建工具 v1.0" -ForegroundColor Cyan
Write-Host "="*70 -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date
$sourceDir = Get-Location
$errors = 0
$warnings = 0

# ============================================
# 配置：包含的目录（白名单）
# ============================================
$includeDirs = @(
    "src",
    "public",
    "tests",
    "docs",
    "scripts"
)

# ============================================
# 配置：包含的根文件（白名单）
# ============================================
$includeRootFiles = @(
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "vitest.config.ts",
    "uno.config.ts",
    "manifest.json",
    "LICENSE",
    "README.md",
    "CHANGELOG.md",
    ".gitignore",
    ".eslintrc.json",
    ".prettierrc",
    "biome.json"
)

# ============================================
# 配置：排除的文件模式（黑名单）
# ============================================
$excludePatterns = @(
    # 敏感文件
    "*激活码*",
    "*activation-code*",
    "*generated-codes*",
    "*发卡平台*",
    "*开源安全指南*",
    
    # 内部开发报告（约100+个文件）
    "*_REPORT.md",
    "*_FIX.md",
    "*_IMPLEMENTATION*.md",
    "*_GUIDE.md",
    "*_ANALYSIS.md",
    "*_DIAGNOSTIC*.md",
    "*_REFACTOR*.md",
    "*_OPTIMIZATION*.md",
    "*_ENHANCEMENT*.md",
    "*_UPDATE*.md",
    "*_COMPLETE*.md",
    "*_PROGRESS*.md",
    "*_PLAN.md",
    "*_SUMMARY*.md",
    "*AUDIT*.md",
    "*DEBUG*.md",
    
    # 临时测试文件
    "test-*.js",
    "test-*.html",
    "*-verify.js",
    "manual-verify.js",
    "simple-verify.js",
    "theme-test.html",
    "prototype-*.html",
    
    # 旧的激活码生成脚本（包含私钥）
    "generate-activation-codes.cjs",
    
    # 工具脚本（可选排除）
    "generate-keypair.cjs",
    "copy-manifest.cjs",
    
    # 开发环境文件
    "start-dev.bat",
    "start-dev.sh",
    "开发环境*.md",
    "快速开发指南.md",
    "构建教程.md",
    
    # 顽固性问题目录
    "顽固性问题",
    
    # 其他内部文档
    "DEVELOPMENT.md",
    "INSTALLATION.md",
    "HOT_RELOAD_GUIDE.md",
    "QUICK_VERIFICATION_CHECKLIST.md",
    "TUANKI_*.md",
    "SPEC_*.md",
    "TypeScript类型错误*.md",
    "celebration-messages.json"
)

# ============================================
# 配置：排除的scripts文件（除了保留的）
# ============================================
$keepScripts = @(
    "generate-activation-codes-secure.cjs",
    "security-check.ps1",
    "create-opensource-package.ps1"
)

# ============================================
# 函数：检查文件是否应该排除
# ============================================
function Should-Exclude {
    param([string]$FilePath)
    
    $fileName = Split-Path $FilePath -Leaf
    
    foreach ($pattern in $excludePatterns) {
        if ($fileName -like $pattern) {
            return $true
        }
    }
    
    return $false
}

# ============================================
# 函数：复制目录（带过滤）
# ============================================
function Copy-DirectoryFiltered {
    param(
        [string]$Source,
        [string]$Destination,
        [string]$DirName
    )
    
    if (-not (Test-Path $Source)) {
        Write-Host "  ⚠️  目录不存在: $DirName" -ForegroundColor Yellow
        return 0
    }
    
    $fileCount = 0
    $items = Get-ChildItem -Path $Source -Recurse -File
    
    foreach ($item in $items) {
        $relativePath = $item.FullName.Substring($Source.Length + 1)
        
        # 检查是否应该排除
        if (Should-Exclude -FilePath $item.FullName) {
            Write-Verbose "  排除: $relativePath"
            continue
        }
        
        # 特殊处理scripts目录
        if ($DirName -eq "scripts") {
            $fileName = Split-Path $item.FullName -Leaf
            if ($keepScripts -notcontains $fileName) {
                Write-Verbose "  排除scripts: $fileName"
                continue
            }
        }
        
        # 复制文件
        $destFile = Join-Path $Destination $relativePath
        $destDir = Split-Path $destFile -Parent
        
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        
        Copy-Item -Path $item.FullName -Destination $destFile -Force
        $fileCount++
    }
    
    return $fileCount
}

# ============================================
# 主流程开始
# ============================================

Write-Host "📂 源目录: $sourceDir" -ForegroundColor Cyan
Write-Host "📂 目标目录: $TargetPath" -ForegroundColor Cyan
Write-Host ""

# 检查目标目录
if (Test-Path $TargetPath) {
    Write-Host "⚠️  目标目录已存在！" -ForegroundColor Yellow
    $response = Read-Host "是否删除并重新创建？(y/n)"
    if ($response -ne 'y') {
        Write-Host "❌ 操作已取消" -ForegroundColor Red
        exit 1
    }
    Remove-Item -Path $TargetPath -Recurse -Force
    Write-Host "✅ 已删除旧目录" -ForegroundColor Green
}

# 创建目标目录
New-Item -ItemType Directory -Path $TargetPath -Force | Out-Null
Write-Host "✅ 创建目标目录: $TargetPath`n" -ForegroundColor Green

# ============================================
# 复制核心目录
# ============================================
Write-Host "📋 步骤1：复制核心目录..." -ForegroundColor Yellow
Write-Host ""

$totalFiles = 0

foreach ($dir in $includeDirs) {
    $sourceSubDir = Join-Path $sourceDir $dir
    $destSubDir = Join-Path $TargetPath $dir
    
    Write-Host "  📁 复制目录: $dir..." -NoNewline
    $count = Copy-DirectoryFiltered -Source $sourceSubDir -Destination $destSubDir -DirName $dir
    $totalFiles += $count
    Write-Host " ✅ ($count 个文件)" -ForegroundColor Green
}

Write-Host ""

# ============================================
# 复制根文件
# ============================================
Write-Host "📋 步骤2：复制配置文件..." -ForegroundColor Yellow
Write-Host ""

$rootFileCount = 0
foreach ($file in $includeRootFiles) {
    $sourceFile = Join-Path $sourceDir $file
    $destFile = Join-Path $TargetPath $file
    
    if (Test-Path $sourceFile) {
        Copy-Item -Path $sourceFile -Destination $destFile -Force
        Write-Host "  ✅ $file" -ForegroundColor Green
        $rootFileCount++
    } else {
        Write-Host "  ⚠️  未找到: $file" -ForegroundColor Yellow
        $warnings++
    }
}

$totalFiles += $rootFileCount
Write-Host ""

# ============================================
# 创建CONTRIBUTING.md
# ============================================
Write-Host "📋 步骤3：创建CONTRIBUTING.md..." -ForegroundColor Yellow

$contributingContent = @"
# 🤝 贡献指南

感谢您对 Tuanki 项目的关注！我们欢迎各种形式的贡献。

---

## 🎯 贡献方式

### 1. 代码贡献

#### 开发环境设置

\`\`\`bash
# 克隆项目
git clone https://github.com/你的用户名/tuanki.git
cd tuanki

# 安装依赖
npm install

# 启动开发服务器
npm run dev
\`\`\`

#### 代码规范

- **TypeScript**: 使用严格模式，避免 \`any\` 类型
- **Svelte 5**: 使用 Runes 模式 (\`\$state\`, \`\$derived\`, \`\$effect\`)
- **命名**: 使用 camelCase（变量/函数）和 PascalCase（组件/类）
- **注释**: 复杂逻辑必须添加注释
- **提交信息**: 遵循 Conventional Commits 规范

#### 提交流程

1. Fork 项目
2. 创建功能分支：\`git checkout -b feature/amazing-feature\`
3. 提交更改：\`git commit -m 'feat: add amazing feature'\`
4. 推送分支：\`git push origin feature/amazing-feature\`
5. 创建 Pull Request

### 2. 文档贡献

- 改进 README
- 编写使用教程
- 翻译文档（支持多语言）
- 修复文档错误

### 3. 问题反馈

- 报告 Bug
- 提出功能建议
- 改进用户体验建议

### 4. 社区支持

- 回答 Issues 中的问题
- 帮助其他用户
- 分享使用经验

---

## 💎 贡献者福利

活跃贡献者可以获得**免费的高级功能访问权**！

### 如何获得

#### 代码贡献
- 修复 Bug（1个有效 PR = 1个月访问）
- 新功能开发（根据复杂度：3-12个月）
- 测试用例编写（10个测试 = 1个月）

#### 文档贡献
- 翻译文档到其他语言（完整翻译 = 6个月）
- 编写使用教程（每篇高质量教程 = 1个月）
- 制作视频教程（每个 = 2个月）

#### 社区贡献
- 活跃社区支持（每月解答10+问题 = 1个月）
- 测评和推广（公开平台测评 = 3个月）
- Bug 报告（5个有效 Bug = 1个月）

#### 核心贡献者
- 长期活跃贡献者：**终身全功能访问**
- 核心维护者：终身访问 + 决策参与权

---

## 📝 提交规范

### Commit Message 格式

\`\`\`
<type>(<scope>): <subject>

<body>

<footer>
\`\`\`

### Type 类型

- \`feat\`: 新功能
- \`fix\`: Bug 修复
- \`docs\`: 文档更新
- \`style\`: 代码格式调整
- \`refactor\`: 重构代码
- \`test\`: 测试相关
- \`chore\`: 构建过程或辅助工具

### 示例

\`\`\`
feat(card): 添加卡片批量编辑功能

- 实现多选卡片
- 添加批量操作菜单
- 支持批量修改标签和牌组

Closes #123
\`\`\`

---

## 🔍 代码审查标准

Pull Request 会根据以下标准审查：

### 功能性
- [ ] 功能正常工作
- [ ] 无明显 Bug
- [ ] 边界情况处理

### 代码质量
- [ ] 符合项目代码规范
- [ ] 类型定义完整
- [ ] 无不必要的代码
- [ ] 复杂逻辑有注释

### 测试
- [ ] 添加必要的测试
- [ ] 现有测试通过
- [ ] 无回归问题

### 文档
- [ ] 更新相关文档
- [ ] 添加使用示例
- [ ] 注释清晰

---

## 🚀 开发提示

### 常用命令

\`\`\`bash
# 开发模式
npm run dev

# 构建
npm run build

# 测试
npm run test

# 类型检查
npm run type-check

# 代码检查
npm run lint
\`\`\`

### 项目结构

\`\`\`
src/
├── components/     # Svelte 组件
├── services/       # 业务逻辑服务
├── utils/          # 工具函数
├── types/          # TypeScript 类型定义
└── main.ts         # 插件入口
\`\`\`

### 关键模块

- \`src/utils/licenseManager.ts\`: 激活码验证
- \`src/services/fsrs/\`: FSRS 算法实现
- \`src/components/study/\`: 学习界面
- \`src/services/data/\`: 数据管理

---

## 📞 联系我们

- 📧 Email: tutaoyuan8@outlook.com
- 🐛 Issues: GitHub Issues
- 💬 讨论: GitHub Discussions

---

## 📄 许可证

通过贡献，您同意您的贡献将使用与项目相同的 MIT 许可证。

---

**感谢您的贡献！让我们一起让 Tuanki 变得更好！** 🚀
"@

$contributingFile = Join-Path $TargetPath "CONTRIBUTING.md"
Set-Content -Path $contributingFile -Value $contributingContent -Encoding UTF8
Write-Host "  ✅ 创建 CONTRIBUTING.md" -ForegroundColor Green
Write-Host ""

# ============================================
# 创建README激活码说明片段
# ============================================
Write-Host "📋 步骤4：创建README激活码说明片段..." -ForegroundColor Yellow

$readmeSection = @"
# 📄 README激活码说明片段

将以下内容插入到 README.md 的合适位置：

---

## 💎 激活码系统

Tuanki 采用**基础功能免费，高级功能付费**的模式，遵循 Obsidian 官方要求。

### 免费功能

所有用户都可以免费使用以下核心功能：

- ✅ **卡片创建和编辑** - 支持多种卡片类型
- ✅ **FSRS6 智能算法** - 科学的间隔重复调度
- ✅ **卡片表格视图** - 高效管理所有卡片
- ✅ **数据导入导出** - JSON、CSV 格式支持
- ✅ **Anki 单向同步** - 从 Anki 导入数据
- ✅ **apkg 文件导入** - 快速迁移学习内容

### 高级功能（需要激活码）

通过购买激活码，可以解锁以下高级功能：

- 💎 **AI 智能制卡** - 使用 AI 批量生成高质量卡片
- 💎 **批量制卡** - 提高制卡效率
- 💎 **高级统计分析** - 详细的学习数据分析和可视化
- 💎 **多视图模式** - 网格视图、看板视图、时间线视图
- 💎 **Tuanki 标注系统** - 基于文档标注快速创建卡片
- 💎 **卢曼卡片ID系统** - 构建知识网络
- 💎 **所有未来的高级功能** - 终身免费更新

### 价格

- 🎁 **早鸟价**: ¥46（限时优惠）
- 💰 **正式价**: ¥64
- 🏆 **特点**: 终身许可，一次购买，永久使用

### 购买激活码

[立即购买激活码](您的发卡平台链接)

### 技术细节

- **加密方式**: RSA-2048 数字签名
- **验证方式**: 完全离线验证，无需网络
- **隐私保护**: 不上传任何用户数据
- **开源透明**: 验证逻辑完全公开，可审计

详见：[激活码系统技术文档](./docs/ACTIVATION_SYSTEM.md)

### 贡献者福利

为项目做出贡献的开发者、文档编写者、社区支持者可以**免费获得高级功能访问权**。

详见：[贡献指南](./CONTRIBUTING.md)

---
"@

$readmeFile = Join-Path $TargetPath "README_ACTIVATION_SECTION.txt"
Set-Content -Path $readmeFile -Value $readmeSection -Encoding UTF8
Write-Host "  ✅ 创建 README_ACTIVATION_SECTION.txt" -ForegroundColor Green
Write-Host "  💡 请手动将内容插入到 README.md 中" -ForegroundColor Cyan
Write-Host ""

# ============================================
# 创建清理说明
# ============================================
Write-Host "📋 步骤5：创建清理说明文档..." -ForegroundColor Yellow

$cleanupNote = @"
# 📝 开源包创建完成说明

## ✅ 已完成的工作

### 复制的内容
- ✅ 核心源代码（src/）
- ✅ 公共资源（public/）
- ✅ 测试文件（tests/）
- ✅ 公开文档（docs/）
- ✅ 必要脚本（scripts/）
- ✅ 配置文件（所有必要的配置）

### 排除的内容
- ❌ 敏感文件（激活码、私钥相关）
- ❌ 内部开发报告（100+ 个 *_REPORT.md 等）
- ❌ 临时测试文件（test-*.js, test-*.html）
- ❌ 开发工具脚本
- ❌ 构建输出（dist/）
- ❌ 依赖包（node_modules/）

### 创建的新文件
- ✅ CONTRIBUTING.md - 贡献指南
- ✅ README_ACTIVATION_SECTION.txt - README 激活码说明片段

---

## 🔧 后续操作

### 1. 更新 README.md

打开 \`README.md\`，找到合适的位置（建议在"主要特性"之后），插入 \`README_ACTIVATION_SECTION.txt\` 的内容。

### 2. 安全检查

\`\`\`powershell
# 进入新目录
cd "$($TargetPath)"

# 运行安全检查
powershell -ExecutionPolicy Bypass -File scripts/security-check.ps1

# 预期结果：0 个错误
\`\`\`

### 3. 手动检查

\`\`\`powershell
# 搜索是否有私钥残留
git grep -i "BEGIN PRIVATE KEY"

# 搜索是否有激活码文件
Get-ChildItem -Recurse -File | Where-Object { \$_.Name -like "*激活码*" }

# 检查文件数量是否合理
Get-ChildItem -Recurse -File | Measure-Object | Select-Object Count
\`\`\`

### 4. 初始化 Git

\`\`\`powershell
# 初始化仓库
git init

# 添加所有文件
git add .

# 创建初始提交
git commit -m "Initial commit: Tuanki v1.0.0"

# 查看提交历史（应该只有一个干净的提交）
git log --oneline
\`\`\`

### 5. 推送到 GitHub

\`\`\`powershell
# 添加远程仓库
git remote add origin https://github.com/你的用户名/tuanki.git

# 推送
git push -u origin main
\`\`\`

### 6. 提交 Obsidian 官方市场

参考文档：\`docs/OPEN_SOURCE_CHECKLIST.md\`

---

## 📊 统计信息

- **总文件数**: $totalFiles
- **创建时间**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
- **源目录**: $sourceDir
- **目标目录**: $TargetPath

---

## ⚠️ 重要提醒

1. **删除临时文件**
   - README_ACTIVATION_SECTION.txt（内容已插入 README.md 后可删除）
   - CLEANUP_NOTES.txt（本文件，阅读后可删除）

2. **验证无敏感信息**
   - 运行安全检查脚本
   - 手动检查关键文件

3. **测试构建**
   \`\`\`powershell
   npm install
   npm run build
   \`\`\`

4. **老激活码兼容性**
   - 确保老激活码仍然有效
   - 在插件中测试激活流程

---

## 📞 获取帮助

如有问题，请查看：
- docs/OPEN_SOURCE_CHECKLIST.md
- docs/QUICK_START_GUIDE.md
- docs/ACTIVATION_SYSTEM.md

---

**祝贺！开源项目包已准备就绪！** 🎉
"@

$cleanupFile = Join-Path $TargetPath "CLEANUP_NOTES.txt"
Set-Content -Path $cleanupFile -Value $cleanupNote -Encoding UTF8
Write-Host "  ✅ 创建 CLEANUP_NOTES.txt" -ForegroundColor Green
Write-Host ""

# ============================================
# 总结报告
# ============================================
$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

Write-Host "="*70 -ForegroundColor Cyan
Write-Host "✅ 开源项目包创建完成！" -ForegroundColor Green
Write-Host "="*70 -ForegroundColor Cyan
Write-Host ""

Write-Host "📊 统计信息:" -ForegroundColor Cyan
Write-Host "  • 复制文件数: $totalFiles" -ForegroundColor White
Write-Host "  • 耗时: $([math]::Round($duration, 2)) 秒" -ForegroundColor White
Write-Host "  • 错误: $errors 个" -ForegroundColor $(if ($errors -gt 0) { "Red" } else { "Green" })
Write-Host "  • 警告: $warnings 个" -ForegroundColor $(if ($warnings -gt 0) { "Yellow" } else { "Green" })
Write-Host ""

Write-Host "📂 目标位置:" -ForegroundColor Cyan
Write-Host "  $TargetPath" -ForegroundColor White
Write-Host ""

Write-Host "📝 后续操作:" -ForegroundColor Cyan
Write-Host "  1. 查看 CLEANUP_NOTES.txt 获取详细说明"
Write-Host "  2. 更新 README.md（插入激活码说明）"
Write-Host "  3. 运行安全检查：scripts/security-check.ps1"
Write-Host "  4. 初始化 Git 仓库"
Write-Host "  5. 推送到 GitHub"
Write-Host ""

Write-Host "⚠️  重要提醒:" -ForegroundColor Yellow
Write-Host "  • 务必运行安全检查脚本验证无敏感信息"
Write-Host "  • 手动检查 README.md 并插入激活码说明"
Write-Host "  • 在推送前验证老激活码兼容性"
Write-Host ""

Write-Host "="*70 -ForegroundColor Cyan
Write-Host "🎉 祝贺！可以开始准备提交到 GitHub 了！" -ForegroundColor Green
Write-Host "="*70 -ForegroundColor Cyan
Write-Host ""

# 返回结果
if ($errors -eq 0) {
    exit 0
} else {
    exit 1
}

