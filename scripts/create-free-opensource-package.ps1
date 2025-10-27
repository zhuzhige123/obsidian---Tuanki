# ============================================
# Tuanki 完全开源免费版本创建脚本
# ============================================
# 用途：创建移除所有激活码系统的完全免费开源版本
# 使用：powershell -ExecutionPolicy Bypass -File scripts/create-free-opensource-package.ps1
# ============================================

param(
    [string]$TargetPath = "D:\桌面\tuanki-opensource-clean"
)

Write-Host "`n" -NoNewline
Write-Host "="*70 -ForegroundColor Cyan
Write-Host "📦 Tuanki 完全开源免费版本创建工具" -ForegroundColor Cyan
Write-Host "="*70 -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date
$sourceDir = Get-Location
$copiedFiles = 0
$modifiedFiles = 0
$deletedFiles = 0

# ============================================
# 配置：需要排除的文件和目录
# ============================================
$excludePatterns = @(
    # 激活码系统文件
    "*/licenseManager.ts",
    "*/PremiumFeatureGuard.ts",
    "*/license-types.ts",
    "*LicenseSection.svelte",
    "*ActivationForm.svelte",
    "*ActivationPrompt.svelte",
    "*LicenseActivation*.svelte",
    "*EnhancedLicenseStatusCard.svelte",
    "*PremiumBadge.svelte",
    "*/premium/*",
    
    # 激活码生成脚本
    "scripts/generate-activation-codes*.cjs",
    "scripts/generate-keypair.cjs",
    
    # 开发报告和文档（项目根目录的）
    "*_REPORT.md",
    "*_IMPLEMENTATION*.md",
    "*_GUIDE.md",
    "*_ANALYSIS.md",
    "*_COMPLETE*.md",
    "*_PROGRESS*.md",
    "*_PLAN.md",
    "*_SUMMARY*.md",
    "*AUDIT*.md",
    "*DEBUG*.md",
    "*DIAGNOSTIC*.md",
    "*REFACTOR*.md",
    "*OPTIMIZATION*.md",
    "*ENHANCEMENT*.md",
    "*UPDATE*.md",
    "*FIX.md",
    
    # 敏感文档
    "docs/ACTIVATION_SYSTEM.md",
    "docs/PRIVATE_KEY_SETUP.md",
    "docs/GIT_CLEANUP.md",
    "docs/OPEN_SOURCE_CHECKLIST.md",
    "docs/QUICK_START_GUIDE.md",
    "*激活码*.md",
    "*发卡*.md",
    
    # 临时和测试文件
    "test-*.js",
    "test-*.html",
    "*-verify.js",
    "*.backup",
    "*.bak",
    
    # 构建输出
    "dist/*",
    "node_modules/*",
    ".vite/*",
    "build/*",
    
    # IDE 配置
    ".vscode/*",
    ".idea/*"
)

# ============================================
# 函数：检查文件是否应该排除
# ============================================
function Should-Exclude {
    param([string]$FilePath)
    
    $relativePath = $FilePath.Replace($sourceDir.Path + "\", "").Replace("\", "/")
    
    foreach ($pattern in $excludePatterns) {
        $regexPattern = $pattern -replace '\*', '.*' -replace '\.', '\.'
        if ($relativePath -match $regexPattern) {
            return $true
        }
    }
    
    return $false
}

# ============================================
# 步骤1：复制项目文件
# ============================================
Write-Host "📋 步骤1：复制项目文件..." -ForegroundColor Yellow
Write-Host ""

# 确保目标目录存在
if (Test-Path $TargetPath) {
    Write-Host "⚠️  目标目录已存在，将清空..." -ForegroundColor Yellow
    Remove-Item -Path $TargetPath -Recurse -Force
}
New-Item -ItemType Directory -Path $TargetPath -Force | Out-Null

# 复制所有文件
$allFiles = Get-ChildItem -Path $sourceDir -Recurse -File | Where-Object {
    $_.FullName -notmatch 'node_modules' -and 
    $_.FullName -notmatch '\\dist\\' -and
    $_.FullName -notmatch '\\.vite\\'
}

foreach ($file in $allFiles) {
    $relativePath = $file.FullName.Substring($sourceDir.Path.Length + 1)
    
    if (Should-Exclude -FilePath $file.FullName) {
        Write-Verbose "排除: $relativePath"
        $deletedFiles++
        continue
    }
    
    $targetFile = Join-Path $TargetPath $relativePath
    $targetDir = Split-Path $targetFile -Parent
    
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
    
    Copy-Item -Path $file.FullName -Destination $targetFile -Force
    $copiedFiles++
}

Write-Host "  ✅ 复制了 $copiedFiles 个文件" -ForegroundColor Green
Write-Host "  ✅ 排除了 $deletedFiles 个文件" -ForegroundColor Green
Write-Host ""

# ============================================
# 步骤2：创建 PremiumFeatureGuard 存根
# ============================================
Write-Host "📋 步骤2：创建免费版本的功能守卫..." -ForegroundColor Yellow

$premiumGuardPath = Join-Path $TargetPath "src\services\premium\PremiumFeatureGuard.ts"
$premiumGuardDir = Split-Path $premiumGuardPath -Parent

if (-not (Test-Path $premiumGuardDir)) {
    New-Item -ItemType Directory -Path $premiumGuardDir -Force | Out-Null
}

$premiumGuardContent = @"
/**
 * 功能守卫服务 - 开源免费版本
 * 所有功能完全免费开放
 */

import { writable, type Writable } from 'svelte/store';

/**
 * 功能ID定义（仅用于兼容性）
 */
export const PREMIUM_FEATURES = {
  GRID_VIEW: 'grid-view',
  KANBAN_VIEW: 'kanban-view',
  ANKI_BIDIRECTIONAL_SYNC: 'anki-bidirectional-sync',
  MULTI_STUDY_VIEWS: 'multi-study-views',
  ADVANCED_ANALYTICS: 'advanced-analytics',
  AI_ASSISTANT: 'ai-assistant',
  ANNOTATION_SYSTEM: 'annotation-system',
  INCREMENTAL_READING: 'incremental-reading'
} as const;

/**
 * 功能守卫类 - 开源免费版本
 * 所有功能返回 true，完全免费使用
 */
export class PremiumFeatureGuard {
  private static instance: PremiumFeatureGuard;
  
  /**
   * 激活状态（始终为 true）
   */
  public isPremiumActive: Writable<boolean>;
  
  private constructor() {
    this.isPremiumActive = writable(true);
  }
  
  /**
   * 获取单例实例
   */
  public static getInstance(): PremiumFeatureGuard {
    if (!PremiumFeatureGuard.instance) {
      PremiumFeatureGuard.instance = new PremiumFeatureGuard();
    }
    return PremiumFeatureGuard.instance;
  }
  
  /**
   * 检查功能是否可用（始终返回 true）
   */
  public canUseFeature(featureId: string): boolean {
    return true;
  }
  
  /**
   * 初始化守卫
   */
  public async initialize(): Promise<void> {
    // 开源版本无需初始化
  }
  
  /**
   * 显示升级提示（开源版本不显示）
   */
  public showUpgradePrompt(featureName: string): void {
    // 开源版本不显示升级提示
  }
}
"@

Set-Content -Path $premiumGuardPath -Value $premiumGuardContent -Encoding UTF8
Write-Host "  ✅ 创建功能守卫存根（所有功能免费）" -ForegroundColor Green
Write-Host ""

# ============================================
# 步骤3：创建 licenseManager 存根
# ============================================
Write-Host "📋 步骤3：创建许可证管理器存根..." -ForegroundColor Yellow

$licenseManagerPath = Join-Path $TargetPath "src\utils\licenseManager.ts"
$licenseManagerDir = Split-Path $licenseManagerPath -Parent

if (-not (Test-Path $licenseManagerDir)) {
    New-Item -ItemType Directory -Path $licenseManagerDir -Force | Out-Null
}

$licenseManagerContent = @"
/**
 * 许可证管理器 - 开源免费版本
 * 所有功能完全免费，此模块仅用于兼容性
 */

export interface LicenseInfo {
    activationCode: string;
    isActivated: boolean;
    activatedAt: string;
    deviceFingerprint: string;
    expiresAt: string;
    productVersion: string;
    licenseType: 'lifetime' | 'subscription';
}

export class LicenseManager {
    private static instance: LicenseManager;
    
    private constructor() {}
    
    public static getInstance(): LicenseManager {
        if (!LicenseManager.instance) {
            LicenseManager.instance = new LicenseManager();
        }
        return LicenseManager.instance;
    }
    
    /**
     * 获取许可证信息（开源版本始终激活）
     */
    public async getLicenseInfo(): Promise<LicenseInfo | null> {
        return {
            activationCode: 'OPENSOURCE-FREE-VERSION',
            isActivated: true,
            activatedAt: new Date().toISOString(),
            deviceFingerprint: 'opensource',
            expiresAt: '2099-12-31T23:59:59.999Z',
            productVersion: '1.0.0',
            licenseType: 'lifetime'
        };
    }
    
    /**
     * 验证激活码（开源版本始终返回成功）
     */
    public async validateActivationCode(code: string): Promise<{success: boolean; message: string}> {
        return {
            success: true,
            message: '开源免费版本，所有功能已解锁'
        };
    }
    
    /**
     * 激活许可证（开源版本无需激活）
     */
    public async activateLicense(code: string): Promise<{success: boolean; message: string}> {
        return {
            success: true,
            message: '开源免费版本，所有功能已解锁'
        };
    }
    
    /**
     * 检查是否激活（始终返回 true）
     */
    public isActivated(): boolean {
        return true;
    }
}

export const licenseManager = LicenseManager.getInstance();
"@

Set-Content -Path $licenseManagerPath -Value $licenseManagerContent -Encoding UTF8
Write-Host "  ✅ 创建许可证管理器存根（始终激活）" -ForegroundColor Green
Write-Host ""

# ============================================
# 步骤4：修改 main.ts 移除激活系统初始化
# ============================================
Write-Host "📋 步骤4：修改主入口文件..." -ForegroundColor Yellow

$mainTsPath = Join-Path $TargetPath "src\main.ts"
if (Test-Path $mainTsPath) {
    $mainContent = Get-Content $mainTsPath -Raw
    
    # 移除激活系统相关的导入和初始化
    $mainContent = $mainContent -replace "import.*licenseManager.*\n", ""
    $mainContent = $mainContent -replace "import.*PremiumFeatureGuard.*\n", ""
    $mainContent = $mainContent -replace "await\s+licenseManager\..*\n", ""
    $mainContent = $mainContent -replace "PremiumFeatureGuard\.getInstance\(\)\..*\n", ""
    
    Set-Content -Path $mainTsPath -Value $mainContent -Encoding UTF8
    Write-Host "  ✅ 修改主入口文件" -ForegroundColor Green
    $modifiedFiles++
}
Write-Host ""

# ============================================
# 步骤5：创建开源版 README
# ============================================
Write-Host "📋 步骤5：创建开源版 README..." -ForegroundColor Yellow

$readmePath = Join-Path $TargetPath "README.md"
$readmeContent = @"
# 🎯 Tuanki - Obsidian 智能记忆卡片插件

<div align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-0.15.0+-purple.svg)](https://obsidian.md)
[![GitHub Stars](https://img.shields.io/github/stars/zhuzhige123/obsidian---Tuanki?style=social)](https://github.com/zhuzhige123/obsidian---Tuanki)

**为 Obsidian 打造的现代化间隔重复学习插件**

基于科学的 FSRS6 算法 | 优雅的 Svelte 5 界面 | 完全开源免费

[快速开始](#-快速开始) · [功能特性](#-核心功能) · [安装指南](#-安装) · [使用文档](#-使用指南) · [贡献代码](#-贡献)

</div>

---

## ✨ 特色亮点

### 🧠 智能学习算法
- **FSRS6 算法**：基于大量学习数据训练的智能调度系统
- **自适应学习**：根据个人表现动态调整复习间隔
- **科学记忆建模**：准确预测遗忘时间，优化学习效率

### 🎨 现代化界面
- **Cursor 风格设计**：精致的视觉风格，注重细节
- **响应式布局**：完美适配各种屏幕尺寸
- **流畅动画**：基于 Svelte 5 的高性能交互
- **主题集成**：无缝融入 Obsidian 的主题系统

### 🔒 隐私优先
- **本地存储**：所有数据存储在本地 Vault
- **离线使用**：无需网络连接
- **开源透明**：代码完全开源，接受社区审计

---

## 🚀 核心功能

### 📝 卡片创建与编辑
- **多种卡片类型**：基础卡片、选择题、填空题、图片遮挡等
- **Markdown 支持**：完整的 Markdown 语法支持
- **智能解析**：自动识别卡片类型和内容
- **批量创建**：高效的批量制卡工具

### 📊 学习与复习
- **智能调度**：FSRS6 算法精准预测复习时间
- **多种视图**：卡片表格、网格视图、看板视图
- **学习统计**：详细的学习数据分析和可视化
- **自定义模板**：灵活的卡片模板系统

### 🔄 数据管理
- **Anki 同步**：完整的 Anki 数据导入导出
- **APKG 导入**：支持导入 Anki 卡片包
- **JSON/CSV 导出**：方便的数据备份和迁移

### 🤖 AI 辅助（需配置 API）
- **AI 智能制卡**：使用 AI 批量生成高质量卡片
- **多服务商支持**：OpenAI、Claude、本地模型等
- **智能格式化**：自动优化卡片内容和格式

---

## 📦 安装

### 方式一：Obsidian 社区插件（推荐）

1. 打开 Obsidian 设置
2. 进入「社区插件」→「浏览」
3. 搜索「Tuanki」
4. 点击「安装」→「启用」

### 方式二：手动安装

1. 下载最新的 Release
2. 解压到 Vault 的 `.obsidian/plugins/tuanki/` 目录
3. 重启 Obsidian
4. 在设置中启用插件

### 方式三：从源码构建

\`\`\`bash
# 克隆仓库
git clone https://github.com/zhuzhige123/obsidian---Tuanki.git
cd obsidian---Tuanki

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build
\`\`\`

---

## 📖 使用指南

### 快速开始

1. **创建第一张卡片**
   - 点击侧边栏的 Tuanki 图标
   - 选择「创建卡片」
   - 填写正面和背面内容
   - 保存

2. **开始学习**
   - 点击「开始学习」按钮
   - 根据记忆情况点击对应按钮
   - FSRS 算法会自动安排下次复习时间

3. **管理卡片**
   - 使用表格视图查看所有卡片
   - 使用过滤器筛选卡片
   - 批量编辑和管理

### 卡片类型

#### 基础卡片
\`\`\`markdown
---start---
Q: 什么是间隔重复学习？
A: 间隔重复学习是一种学习技术，通过增加复习间隔来提高长期记忆效果。
---end---
\`\`\`

#### 选择题
\`\`\`markdown
---start---
## 地球的卫星是什么？
- 太阳
- [x] 月球
- 火星
- 金星
---end---
\`\`\`

#### 挖空卡片
\`\`\`markdown
---start---
FSRS 算法可以==精准预测==遗忘时间。
---end---
\`\`\`

### Anki 数据导入

1. 打开 Tuanki 设置
2. 进入「Anki Connect」标签
3. 配置 AnkiConnect 连接
4. 选择要导入的牌组
5. 点击「开始同步」

---

## 🛠️ 技术栈

- **前端框架**：Svelte 5 + TypeScript
- **样式系统**：UnoCSS + CSS Variables
- **算法核心**：FSRS6 间隔重复算法
- **构建工具**：Vite
- **测试框架**：Vitest

---

## 🤝 贡献

我们欢迎所有形式的贡献！

### 如何贡献

1. **Fork 本仓库**
2. **创建功能分支** (\`git checkout -b feature/AmazingFeature\`)
3. **提交更改** (\`git commit -m 'feat: add amazing feature'\`)
4. **推送到分支** (\`git push origin feature/AmazingFeature\`)
5. **开启 Pull Request**

### 开发指南

\`\`\`bash
# 安装依赖
npm install

# 启动开发服务器（热重载）
npm run dev

# 运行测试
npm run test

# 代码格式化
npm run format

# 代码检查
npm run lint
\`\`\`

### 项目结构

\`\`\`
src/
├── components/        # Svelte 组件
│   ├── study/        # 学习相关组件
│   ├── settings/     # 设置界面
│   └── ui/           # 通用 UI 组件
├── services/         # 业务逻辑服务
├── utils/            # 工具函数
│   ├── fsrs/        # FSRS 算法实现
│   └── parsing/     # 卡片解析引擎
└── styles/           # 样式文件
\`\`\`

---

## 📝 版本历史

查看 [CHANGELOG.md](CHANGELOG.md) 了解详细的版本更新信息。

---

## 🙋 常见问题

### Q: 插件完全免费吗？
**A**: 是的！本插件完全开源免费，所有功能都可以免费使用。

### Q: 数据存储在哪里？
**A**: 所有数据都存储在您的 Obsidian Vault 中，完全本地化，保护您的隐私。

### Q: 如何备份数据？
**A**: 数据存储在 Vault 的 `.obsidian/plugins/tuanki/data.json` 中，您可以随时备份此文件。

### Q: 支持移动端吗？
**A**: 目前主要针对桌面端优化，移动端支持正在开发中。

### Q: 如何导入 Anki 卡片？
**A**: 通过 AnkiConnect 或直接导入 .apkg 文件，详见使用指南。

---

## 📞 联系方式

- **邮箱**: tutaoyuan8@outlook.com
- **GitHub Issues**: [问题反馈](https://github.com/zhuzhige123/obsidian---Tuanki/issues)
- **GitHub Discussions**: [功能讨论](https://github.com/zhuzhige123/obsidian---Tuanki/discussions)

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源。

---

## 🙏 致谢

- [Obsidian](https://obsidian.md) - 优秀的知识管理平台
- [FSRS](https://github.com/open-spaced-repetition/fsrs-rs) - 科学的间隔重复算法
- [Svelte](https://svelte.dev) - 现代化的前端框架
- 所有贡献者和支持者 ❤️

---

<div align="center">

**如果这个项目对你有帮助，请给我们一个 ⭐ Star！**

Made with ❤️ by Tuanki Team

</div>
"@

Set-Content -Path $readmePath -Value $readmeContent -Encoding UTF8
Write-Host "  ✅ 创建开源版 README.md" -ForegroundColor Green
Write-Host ""

# ============================================
# 步骤6：创建 CONTRIBUTING.md
# ============================================
Write-Host "📋 步骤6：创建贡献指南..." -ForegroundColor Yellow

$contributingPath = Join-Path $TargetPath "CONTRIBUTING.md"
$contributingContent = @"
# 🤝 贡献指南

感谢您对 Tuanki 项目的关注！我们欢迎各种形式的贡献。

## 📋 行为准则

请确保在参与项目时保持友善和尊重。我们致力于为所有人创造一个友好的环境。

## 🎯 如何贡献

### 报告 Bug

1. 确认 Bug 尚未被报告
2. 在 Issues 中创建新问题
3. 提供详细的复现步骤
4. 包含系统环境信息

### 提出功能建议

1. 在 Discussions 中讨论想法
2. 说明功能的使用场景
3. 提供mockup或示例（如果可能）

### 提交代码

1. **Fork 仓库**
2. **创建分支**: \`git checkout -b feature/your-feature\`
3. **编写代码**: 遵循项目的代码风格
4. **添加测试**: 确保新功能有测试覆盖
5. **提交更改**: 使用清晰的提交信息
6. **推送分支**: \`git push origin feature/your-feature\`
7. **创建 Pull Request**

## 💻 开发环境设置

\`\`\`bash
# 克隆项目
git clone https://github.com/zhuzhige123/obsidian---Tuanki.git
cd obsidian---Tuanki

# 安装依赖
npm install

# 启动开发服务器
npm run dev
\`\`\`

## 📝 代码规范

### TypeScript 规范

- 使用严格的类型检查
- 避免使用 \`any\` 类型
- 添加 JSDoc 注释
- 保持函数简洁

### Svelte 规范

- 使用 Svelte 5 Runes 语法
- 组件名使用 PascalCase
- Props 使用 TypeScript 类型
- 保持组件单一职责

### 提交信息规范

使用 Conventional Commits 格式：

\`\`\`
<type>(<scope>): <subject>

<body>

<footer>
\`\`\`

**Type 类型:**
- \`feat\`: 新功能
- \`fix\`: Bug 修复
- \`docs\`: 文档更新
- \`style\`: 代码格式调整
- \`refactor\`: 重构代码
- \`test\`: 测试相关
- \`chore\`: 构建过程或辅助工具

## 🧪 测试

\`\`\`bash
# 运行所有测试
npm run test

# 运行特定测试
npm run test -- <test-name>

# 监听模式
npm run test:watch
\`\`\`

## 📖 文档

- 重要功能需要添加文档
- 更新 README.md 中的功能列表
- 在代码中添加清晰的注释

## 🔍 代码审查

所有 Pull Request 都会经过审查：

- 代码质量和风格
- 测试覆盖率
- 文档完整性
- 向后兼容性

## 📞 获取帮助

- 📧 Email: tutaoyuan8@outlook.com
- 💬 GitHub Discussions
- 🐛 GitHub Issues

---

感谢您的贡献！🎉
"@

Set-Content -Path $contributingPath -Value $contributingContent -Encoding UTF8
Write-Host "  ✅ 创建 CONTRIBUTING.md" -ForegroundColor Green
Write-Host ""

# ============================================
# 步骤7：更新 package.json
# ============================================
Write-Host "📋 步骤7：更新 package.json..." -ForegroundColor Yellow

$packageJsonPath = Join-Path $TargetPath "package.json"
if (Test-Path $packageJsonPath) {
    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    $packageJson.description = "A powerful spaced repetition learning plugin for Obsidian, featuring FSRS6 algorithm and modern UI - Completely Free and Open Source"
    $packageJson.repository = @{
        type = "git"
        url = "https://github.com/zhuzhige123/obsidian---Tuanki.git"
    }
    $packageJson.bugs = @{
        url = "https://github.com/zhuzhige123/obsidian---Tuanki/issues"
    }
    $packageJson.homepage = "https://github.com/zhuzhige123/obsidian---Tuanki"
    
    $packageJson | ConvertTo-Json -Depth 10 | Set-Content $packageJsonPath -Encoding UTF8
    Write-Host "  ✅ 更新 package.json" -ForegroundColor Green
    $modifiedFiles++
}
Write-Host ""

# ============================================
# 总结报告
# ============================================
$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

Write-Host "="*70 -ForegroundColor Cyan
Write-Host "✅ 完全开源免费版本创建完成！" -ForegroundColor Green
Write-Host "="*70 -ForegroundColor Cyan
Write-Host ""

Write-Host "📊 统计信息:" -ForegroundColor Cyan
Write-Host "  • 复制文件: $copiedFiles" -ForegroundColor White
Write-Host "  • 排除文件: $deletedFiles" -ForegroundColor White
Write-Host "  • 修改文件: $modifiedFiles" -ForegroundColor White
Write-Host "  • 耗时: $([math]::Round($duration, 2)) 秒" -ForegroundColor White
Write-Host ""

Write-Host "📂 目标位置:" -ForegroundColor Cyan
Write-Host "  $TargetPath" -ForegroundColor White
Write-Host ""

Write-Host "✨ 完成的工作:" -ForegroundColor Cyan
Write-Host "  ✅ 移除所有激活码系统文件" -ForegroundColor Green
Write-Host "  ✅ 移除所有内部开发文档" -ForegroundColor Green
Write-Host "  ✅ 创建功能守卫存根（所有功能免费）" -ForegroundColor Green
Write-Host "  ✅ 创建许可证管理器存根" -ForegroundColor Green
Write-Host "  ✅ 创建开源版 README.md" -ForegroundColor Green
Write-Host "  ✅ 创建 CONTRIBUTING.md" -ForegroundColor Green
Write-Host "  ✅ 更新 package.json" -ForegroundColor Green
Write-Host ""

Write-Host "📝 后续操作:" -ForegroundColor Cyan
Write-Host "  1. 进入目标目录: cd `"$TargetPath`"" -ForegroundColor White
Write-Host "  2. 初始化 Git: git init" -ForegroundColor White
Write-Host "  3. 添加远程仓库: git remote add origin https://github.com/zhuzhige123/obsidian---Tuanki.git" -ForegroundColor White
Write-Host "  4. 添加所有文件: git add ." -ForegroundColor White
Write-Host "  5. 提交: git commit -m `"refactor: complete opensource free version`"" -ForegroundColor White
Write-Host "  6. 强制推送: git push -f origin main" -ForegroundColor White
Write-Host ""

Write-Host "⚠️  重要提示:" -ForegroundColor Yellow
Write-Host "  • 此版本完全免费，所有功能开放" -ForegroundColor Yellow
Write-Host "  • 建议在推送前测试构建: npm install && npm run build" -ForegroundColor Yellow
Write-Host "  • 强制推送会覆盖远程仓库的历史记录" -ForegroundColor Yellow
Write-Host ""

Write-Host "="*70 -ForegroundColor Cyan
Write-Host "🎉 准备就绪！可以推送到 GitHub 了！" -ForegroundColor Green
Write-Host "="*70 -ForegroundColor Cyan
Write-Host ""

exit 0

