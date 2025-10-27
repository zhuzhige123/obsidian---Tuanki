# ============================================
# Tuanki 安全检查脚本
# ============================================
# 用途：在开源发布前检查是否存在敏感信息泄露
# 使用：powershell -ExecutionPolicy Bypass -File scripts/security-check.ps1
# ============================================

Write-Host "`n" -NoNewline
Write-Host "="*70 -ForegroundColor Cyan
Write-Host "🔍 Tuanki 安全检查脚本 v2.0" -ForegroundColor Cyan
Write-Host "="*70 -ForegroundColor Cyan
Write-Host ""

$errors = 0
$warnings = 0
$startTime = Get-Date

# ============================================
# 检查1：搜索私钥
# ============================================
Write-Host "📋 检查1：搜索私钥..." -ForegroundColor Yellow
Write-Host "   检查 Git 仓库中是否包含私钥..." -NoNewline

try {
    $privateKey = git grep -i "BEGIN PRIVATE KEY" 2>$null
    if ($privateKey) {
        Write-Host " ❌" -ForegroundColor Red
        Write-Host "   发现私钥！这是严重的安全问题！" -ForegroundColor Red
        Write-Host $privateKey -ForegroundColor Red
        $errors++
    } else {
        Write-Host " ✅" -ForegroundColor Green
    }
} catch {
    Write-Host " ⚠️  无法执行 Git 命令" -ForegroundColor Yellow
    $warnings++
}

# ============================================
# 检查2：搜索私钥指纹
# ============================================
Write-Host "`n📋 检查2：搜索私钥指纹..." -ForegroundColor Yellow
Write-Host "   检查私钥的特征字符串..." -NoNewline

try {
    $privateKeyFingerprint = git grep "MIIEvQIBADANBgkqhkiG9w0" 2>$null
    if ($privateKeyFingerprint) {
        Write-Host " ❌" -ForegroundColor Red
        Write-Host "   发现私钥指纹！" -ForegroundColor Red
        Write-Host $privateKeyFingerprint -ForegroundColor Red
        $errors++
    } else {
        Write-Host " ✅" -ForegroundColor Green
    }
} catch {
    Write-Host " ⚠️  无法执行检查" -ForegroundColor Yellow
    $warnings++
}

# ============================================
# 检查3：搜索激活码文件
# ============================================
Write-Host "`n📋 检查3：搜索激活码文件..." -ForegroundColor Yellow
Write-Host "   检查是否跟踪了激活码文件..." -NoNewline

try {
    $activationFiles = git ls-files | Select-String "激活码|activation-code|generated-codes|codes-plain|codes-numbered"
    if ($activationFiles) {
        Write-Host " ❌" -ForegroundColor Red
        Write-Host "   发现激活码文件！" -ForegroundColor Red
        $activationFiles | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
        $errors++
    } else {
        Write-Host " ✅" -ForegroundColor Green
    }
} catch {
    Write-Host " ⚠️  无法执行检查" -ForegroundColor Yellow
    $warnings++
}

# ============================================
# 检查4：搜索旧的生成脚本
# ============================================
Write-Host "`n📋 检查4：搜索旧的生成脚本..." -ForegroundColor Yellow
Write-Host "   检查是否跟踪了包含私钥的脚本..." -NoNewline

try {
    $oldScript = git ls-files | Select-String "generate-activation-codes.cjs$"
    if ($oldScript) {
        Write-Host " ❌" -ForegroundColor Red
        Write-Host "   发现旧脚本（包含私钥）！" -ForegroundColor Red
        $oldScript | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
        $errors++
    } else {
        Write-Host " ✅" -ForegroundColor Green
    }
} catch {
    Write-Host " ⚠️  无法执行检查" -ForegroundColor Yellow
    $warnings++
}

# ============================================
# 检查5：搜索敏感文档
# ============================================
Write-Host "`n📋 检查5：搜索敏感文档..." -ForegroundColor Yellow
Write-Host "   检查是否跟踪了内部文档..." -NoNewline

try {
    $sensitiveDocs = git ls-files | Select-String "激活码使用说明|激活码密钥|发卡平台使用说明|开源安全指南"
    if ($sensitiveDocs) {
        Write-Host " ❌" -ForegroundColor Red
        Write-Host "   发现敏感文档！" -ForegroundColor Red
        $sensitiveDocs | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
        $errors++
    } else {
        Write-Host " ✅" -ForegroundColor Green
    }
} catch {
    Write-Host " ⚠️  无法执行检查" -ForegroundColor Yellow
    $warnings++
}

# ============================================
# 检查6：验证 .gitignore
# ============================================
Write-Host "`n📋 检查6：验证 .gitignore..." -ForegroundColor Yellow

$gitignoreRules = @(
    "scripts/generate-activation-codes.cjs",
    "*.pem",
    "*.key",
    "*private-key*",
    "generated-*.json",
    "codes-*.txt",
    "激活码*"
)

if (Test-Path ".gitignore") {
    $gitignoreContent = Get-Content .gitignore -Raw
    $missing = @()

    foreach ($rule in $gitignoreRules) {
        # 使用模糊匹配
        $pattern = $rule -replace '\*', '.*' -replace '\.', '\.'
        if ($gitignoreContent -notmatch $pattern) {
            $missing += $rule
        }
    }

    if ($missing.Count -gt 0) {
        Write-Host "   ❌ .gitignore 缺少以下规则：" -ForegroundColor Red
        $missing | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
        $errors++
    } else {
        Write-Host "   ✅ .gitignore 配置完整" -ForegroundColor Green
    }
} else {
    Write-Host "   ❌ .gitignore 文件不存在！" -ForegroundColor Red
    $errors++
}

# ============================================
# 检查7：私钥备份
# ============================================
Write-Host "`n📋 检查7：私钥备份..." -ForegroundColor Yellow
Write-Host "   检查私钥是否已安全备份..." -NoNewline

$privateKeyPath = "D:\tuanki-private\private-key.pem"
if (Test-Path $privateKeyPath) {
    Write-Host " ✅" -ForegroundColor Green
    Write-Host "   私钥位置: $privateKeyPath"
} else {
    Write-Host " ⚠️ " -ForegroundColor Yellow
    Write-Host "   警告：未找到私钥备份" -ForegroundColor Yellow
    Write-Host "   请确保已将私钥保存到安全位置" -ForegroundColor Yellow
    $warnings++
}

# ============================================
# 检查8：搜索硬编码的测试数据
# ============================================
Write-Host "`n📋 检查8：搜索硬编码的测试数据..." -ForegroundColor Yellow
Write-Host "   检查代码中是否有测试激活码..." -NoNewline

try {
    $testData = git grep -i "eyJ1c2VySWQiOiJ1c2VyXzE3NjAwMTEz" 2>$null
    if ($testData) {
        Write-Host " ⚠️ " -ForegroundColor Yellow
        Write-Host "   发现疑似测试激活码" -ForegroundColor Yellow
        $warnings++
    } else {
        Write-Host " ✅" -ForegroundColor Green
    }
} catch {
    Write-Host " ⚠️  无法执行检查" -ForegroundColor Yellow
}

# ============================================
# 检查9：搜索 TODO/FIXME
# ============================================
Write-Host "`n📋 检查9：搜索未完成的代码标记..." -ForegroundColor Yellow
Write-Host "   检查是否有 TODO/FIXME 标记..." -NoNewline

try {
    $todoCount = (git grep -i "TODO\|FIXME\|HACK" 2>$null | Measure-Object).Count
    if ($todoCount -gt 0) {
        Write-Host " ⚠️  ($todoCount 个)" -ForegroundColor Yellow
        Write-Host "   建议在发布前处理 TODO/FIXME 标记" -ForegroundColor Yellow
        $warnings++
    } else {
        Write-Host " ✅" -ForegroundColor Green
    }
} catch {
    Write-Host " ⚠️  无法执行检查" -ForegroundColor Yellow
}

# ============================================
# 检查10：Git 历史深度搜索
# ============================================
Write-Host "`n📋 检查10：Git 历史深度搜索..." -ForegroundColor Yellow
Write-Host "   检查历史提交中是否有敏感信息..." -NoNewline

try {
    $historyCheck = git log --all --full-history --source -p 2>$null | Select-String "BEGIN PRIVATE KEY" | Measure-Object
    if ($historyCheck.Count -gt 0) {
        Write-Host " ❌" -ForegroundColor Red
        Write-Host "   Git 历史中仍包含私钥！" -ForegroundColor Red
        Write-Host "   必须运行 git filter-repo 清理历史" -ForegroundColor Red
        $errors++
    } else {
        Write-Host " ✅" -ForegroundColor Green
    }
} catch {
    Write-Host " ⚠️  无法执行历史检查" -ForegroundColor Yellow
    $warnings++
}

# ============================================
# 总结报告
# ============================================
$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

Write-Host "`n" -NoNewline
Write-Host "="*70 -ForegroundColor Cyan
Write-Host "📊 检查结果总结" -ForegroundColor Cyan
Write-Host "="*70 -ForegroundColor Cyan
Write-Host ""

Write-Host "⏱️  检查耗时: $([math]::Round($duration, 2)) 秒"
Write-Host "❌ 错误: $errors 个" -ForegroundColor $(if ($errors -gt 0) { "Red" } else { "Green" })
Write-Host "⚠️  警告: $warnings 个" -ForegroundColor $(if ($warnings -gt 0) { "Yellow" } else { "Green" })
Write-Host ""

if ($errors -eq 0 -and $warnings -eq 0) {
    Write-Host "✅ 恭喜！所有检查通过，可以安全开源！" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 下一步操作：" -ForegroundColor Cyan
    Write-Host "   1. 查看 docs/OPEN_SOURCE_CHECKLIST.md"
    Write-Host "   2. 创建 GitHub 仓库"
    Write-Host "   3. 推送代码到 GitHub"
    Write-Host "   4. 提交 Obsidian 官方市场审核"
    exit 0
} elseif ($errors -eq 0) {
    Write-Host "⚠️  检查通过，但有 $warnings 个警告需要注意" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "💡 建议：" -ForegroundColor Cyan
    Write-Host "   - 处理上述警告项"
    Write-Host "   - 再次运行安全检查"
    Write-Host "   - 查看 docs/OPEN_SOURCE_CHECKLIST.md"
    exit 0
} else {
    Write-Host "❌ 发现 $errors 个错误，必须修复后才能开源！" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔧 修复建议：" -ForegroundColor Cyan
    Write-Host "   1. 查看上述错误详情"
    Write-Host "   2. 参考 docs/GIT_CLEANUP.md 清理 Git 历史"
    Write-Host "   3. 更新 .gitignore 文件"
    Write-Host "   4. 重新运行安全检查"
    Write-Host ""
    Write-Host "📚 相关文档：" -ForegroundColor Cyan
    Write-Host "   - docs/GIT_CLEANUP.md"
    Write-Host "   - docs/PRIVATE_KEY_SETUP.md"
    Write-Host "   - docs/OPEN_SOURCE_CHECKLIST.md"
    exit 1
}

Write-Host "`n" -NoNewline
Write-Host "="*70 -ForegroundColor Cyan
Write-Host ""





