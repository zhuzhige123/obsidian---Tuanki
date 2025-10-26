# 🧹 Git 历史清理指南

本文档说明如何从 Git 历史中彻底清除私钥和激活码文件，为开源发布做准备。

---

## ⚠️ 重要警告

**在执行以下操作前**：
- ✅ 确保已完整备份项目
- ✅ 确保已保存私钥到安全位置
- ✅ 确保已保存所有激活码记录
- ✅ 通知团队成员即将进行重大变更
- ✅ 选择低峰时段操作

**操作后果**：
- ⚠️ Git 历史将被重写
- ⚠️ 所有远程分支需要强制推送
- ⚠️ 团队成员需要重新克隆仓库
- ⚠️ 不可逆操作，无法撤销

---

## 📋 清理步骤

### 步骤 0：前期准备

#### 0.1 完整备份

```powershell
# 创建项目完整备份
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = "D:\tuanki-backup-$timestamp"

Copy-Item -Path "D:\桌面\obsidian tuanki (3) (2) (5) (9) (1) (5)" -Destination $backupPath -Recurse

Write-Host "✅ 备份完成: $backupPath"
```

#### 0.2 提取私钥

```powershell
# 确保私钥已保存到安全位置
$privateKeyPath = "D:\tuanki-private\private-key.pem"

if (Test-Path $privateKeyPath) {
    Write-Host "✅ 私钥文件已存在: $privateKeyPath"
} else {
    Write-Host "❌ 请先保存私钥到: $privateKeyPath"
    exit 1
}
```

#### 0.3 记录当前激活码

```powershell
# 保存所有激活码记录
$activationBackup = "D:\tuanki-private\activation-codes-backup"
New-Item -ItemType Directory -Path $activationBackup -Force

# 复制所有激活码文件
Copy-Item "generated-*.json" $activationBackup -ErrorAction SilentlyContinue
Copy-Item "激活码*.txt" $activationBackup -ErrorAction SilentlyContinue
Copy-Item "codes-*.txt" $activationBackup -ErrorAction SilentlyContinue

Write-Host "✅ 激活码已备份到: $activationBackup"
```

---

### 步骤 1：安装 git-filter-repo

```powershell
# 使用 pip 安装
pip install git-filter-repo

# 验证安装
git filter-repo --version
```

**如果没有 pip**：
1. 安装 Python: https://www.python.org/downloads/
2. 确保安装时勾选 "Add Python to PATH"
3. 重新打开 PowerShell

---

### 步骤 2：清理敏感文件

```powershell
# 进入插件目录
cd "D:\桌面\obsidian tuanki (3) (2) (5) (9) (1) (5)\10-Project-Tuanki\anki-obsidian-plugin"

# 确认当前在正确的目录
git status
```

#### 2.1 清理私钥文件

```powershell
# 清理包含私钥的生成脚本
git filter-repo --path scripts/generate-activation-codes.cjs --invert-paths --force

Write-Host "✅ 已清理：scripts/generate-activation-codes.cjs"
```

#### 2.2 清理激活码文件

```powershell
# 清理所有激活码JSON文件
git filter-repo --path generated-activation-codes.json --invert-paths --force

# 清理第一批激活码文件
git filter-repo --path 激活码-发卡平台格式.txt --invert-paths --force
git filter-repo --path 激活码-带编号格式.txt --invert-paths --force

# 清理第二批激活码文件
git filter-repo --path 激活码-发卡平台格式-第2批.txt --invert-paths --force
git filter-repo --path 激活码-带编号格式-第2批.txt --invert-paths --force

Write-Host "✅ 已清理：激活码文件"
```

#### 2.3 清理敏感文档

```powershell
# 清理激活码使用说明
git filter-repo --path 激活码使用说明.md --invert-paths --force
git filter-repo --path 激活码密钥管理FAQ.md --invert-paths --force
git filter-repo --path 激活码数据.md --invert-paths --force

# 清理发卡平台说明
git filter-repo --path 发卡平台使用说明.md --invert-paths --force
git filter-repo --path 发卡平台使用说明-2025-10-14.md --invert-paths --force

# 清理内部安全指南
git filter-repo --path 开源安全指南.md --invert-paths --force

Write-Host "✅ 已清理：敏感文档"
```

---

### 步骤 3：验证清理结果

#### 3.1 搜索私钥

```powershell
# 搜索私钥关键字
$privateKeyFound = git log --all --full-history --source -p | Select-String "BEGIN PRIVATE KEY"

if ($privateKeyFound) {
    Write-Host "❌ 警告：Git历史中仍包含私钥！"
    $privateKeyFound
} else {
    Write-Host "✅ 未发现私钥残留"
}
```

#### 3.2 搜索激活码

```powershell
# 搜索激活码文件
$activationFiles = git ls-files | Select-String "激活码|activation-code|generated-codes"

if ($activationFiles) {
    Write-Host "❌ 警告：仍有激活码文件！"
    $activationFiles
} else {
    Write-Host "✅ 未发现激活码文件"
}
```

#### 3.3 检查文件列表

```powershell
# 列出所有被跟踪的文件
git ls-files | Sort-Object

# 手动检查输出，确保没有敏感文件
```

---

### 步骤 4：推送到远程仓库

#### 4.1 如果是新仓库（推荐）

```powershell
# 创建新的远程仓库
# 1. 在 GitHub 创建新仓库（不要初始化）
# 2. 添加远程地址

git remote add origin https://github.com/你的用户名/tuanki.git

# 推送清理后的历史
git push -u origin main --force
```

#### 4.2 如果是现有仓库（需要强制推送）

```powershell
# ⚠️ 强制推送将覆盖远程历史
# ⚠️ 团队成员需要重新克隆

# 推送所有分支
git push origin --all --force

# 推送所有标签
git push origin --tags --force

Write-Host "✅ 已强制推送到远程仓库"
Write-Host "⚠️  团队成员需要重新克隆项目"
```

---

### 步骤 5：团队同步

如果有团队成员，通知他们：

```markdown
# 发送给团队的通知

⚠️ 重要：Git 历史已重写

为了开源发布，我们清理了 Git 历史中的敏感信息。

请按以下步骤更新本地仓库：

1. 备份本地未提交的更改
2. 删除旧的本地仓库
3. 重新克隆：
   git clone https://github.com/你的用户名/tuanki.git

原因：
- 移除了私钥和激活码文件
- Git 历史已重写，无法直接 pull

如有问题，请联系我。
```

---

## 🔍 全面安全检查

### 自动化检查脚本

创建 `scripts/security-check.ps1`：

```powershell
# Tuanki 安全检查脚本
Write-Host "🔍 开始安全检查..." -ForegroundColor Cyan

$errors = 0

# 检查1：搜索私钥
Write-Host "`n📋 检查1：搜索私钥..." -ForegroundColor Yellow
$privateKey = git grep -i "BEGIN PRIVATE KEY" 2>$null
if ($privateKey) {
    Write-Host "❌ 发现私钥！" -ForegroundColor Red
    $privateKey
    $errors++
} else {
    Write-Host "✅ 未发现私钥" -ForegroundColor Green
}

# 检查2：搜索私钥指纹
Write-Host "`n📋 检查2：搜索私钥指纹..." -ForegroundColor Yellow
$privateKeyFingerprint = git grep "MIIEvQIBADANBgkqhkiG9w0" 2>$null
if ($privateKeyFingerprint) {
    Write-Host "❌ 发现私钥指纹！" -ForegroundColor Red
    $privateKeyFingerprint
    $errors++
} else {
    Write-Host "✅ 未发现私钥指纹" -ForegroundColor Green
}

# 检查3：搜索激活码文件
Write-Host "`n📋 检查3：搜索激活码文件..." -ForegroundColor Yellow
$activationFiles = git ls-files | Select-String "激活码|activation-code|generated-codes"
if ($activationFiles) {
    Write-Host "❌ 发现激活码文件！" -ForegroundColor Red
    $activationFiles
    $errors++
} else {
    Write-Host "✅ 未发现激活码文件" -ForegroundColor Green
}

# 检查4：验证 .gitignore
Write-Host "`n📋 检查4：验证 .gitignore..." -ForegroundColor Yellow
$gitignoreRules = @(
    "scripts/generate-activation-codes.cjs",
    "*.pem",
    "*.key",
    "generated-*.json",
    "codes-*.txt",
    "激活码*"
)

$gitignoreContent = Get-Content .gitignore
$missing = @()

foreach ($rule in $gitignoreRules) {
    if ($gitignoreContent -notmatch [regex]::Escape($rule)) {
        $missing += $rule
    }
}

if ($missing.Count -gt 0) {
    Write-Host "❌ .gitignore 缺少规则！" -ForegroundColor Red
    $missing
    $errors++
} else {
    Write-Host "✅ .gitignore 配置完整" -ForegroundColor Green
}

# 检查5：私钥文件存在性
Write-Host "`n📋 检查5：私钥备份..." -ForegroundColor Yellow
$privateKeyPath = "D:\tuanki-private\private-key.pem"
if (Test-Path $privateKeyPath) {
    Write-Host "✅ 私钥已备份: $privateKeyPath" -ForegroundColor Green
} else {
    Write-Host "⚠️  警告：未找到私钥备份" -ForegroundColor Yellow
}

# 总结
Write-Host "`n" + "="*60 -ForegroundColor Cyan
if ($errors -eq 0) {
    Write-Host "✅ 安全检查通过！可以安全开源" -ForegroundColor Green
} else {
    Write-Host "❌ 发现 $errors 个问题，请先修复" -ForegroundColor Red
}
Write-Host "="*60 -ForegroundColor Cyan
```

运行检查：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/security-check.ps1
```

---

## 🚨 常见问题

### Q1: git-filter-repo 失败

**错误**: `git-filter-repo: command not found`

**解决**:
```powershell
# 方法1：重新安装
pip uninstall git-filter-repo
pip install git-filter-repo

# 方法2：手动下载
# 从 https://github.com/newren/git-filter-repo 下载
# 放到 PATH 中
```

### Q2: "not a fresh clone" 错误

**错误**: `Refusing to destructively overwrite repo history`

**解决**:
```powershell
# 添加 --force 参数
git filter-repo --path 文件名 --invert-paths --force
```

### Q3: 清理后仓库大小没变

**原因**: Git 的 reflog 和 packed objects 仍保留数据

**解决**:
```powershell
# 清理 reflog
git reflog expire --expire=now --all

# 垃圾回收
git gc --prune=now --aggressive

# 查看仓库大小
du -sh .git
```

### Q4: 团队成员无法 pull

**原因**: Git 历史已重写

**解决**: 必须重新克隆，无法通过 pull 更新
```powershell
# 错误的做法
git pull # ❌ 会失败

# 正确的做法
rm -rf 项目目录
git clone https://github.com/你的用户名/tuanki.git
```

---

## ✅ 清理完成检查清单

```markdown
□ 已完整备份项目
□ 已保存私钥到 D:\tuanki-private\
□ 已备份所有激活码记录
□ 已安装 git-filter-repo
□ 已清理 generate-activation-codes.cjs
□ 已清理所有激活码文件
□ 已清理敏感文档
□ 运行安全检查脚本（0个错误）
□ git grep 未发现私钥
□ git ls-files 未发现激活码文件
□ 已推送到远程仓库
□ 已通知团队成员（如适用）
□ 验证 GitHub 仓库中无敏感信息
```

---

## 🔗 下一步

清理完成后：
1. ✅ 查看 [开源准备清单](./OPEN_SOURCE_CHECKLIST.md)
2. ✅ 更新 README 和文档
3. ✅ 准备提交 Obsidian 官方市场
4. ✅ 公开 GitHub 仓库

---

**最后更新**: 2025年10月26日
**文档版本**: v2.0

