# 🧹 Obsidian插件缓存清理指南

## 📋 问题描述

当插件代码更新后，Obsidian可能仍然使用缓存的旧版本，导致界面显示不正确。这是因为Obsidian会缓存插件的JavaScript代码以提高性能。

## 🔧 完整清理步骤

### 步骤1：关闭Obsidian
```bash
# 完全关闭Obsidian应用程序
# 确保没有Obsidian进程在后台运行
```

### 步骤2：清理插件目录
```bash
# 删除插件输出目录中的所有文件
Remove-Item -Path "D:\桌面\obsidian luman\.obsidian\plugins\tuanki\*" -Recurse -Force
```

### 步骤3：清理Obsidian缓存
```bash
# Windows路径示例
# 清理Obsidian应用数据缓存
Remove-Item -Path "$env:APPDATA\obsidian\*cache*" -Recurse -Force -ErrorAction SilentlyContinue

# 清理Obsidian本地数据缓存
Remove-Item -Path "$env:LOCALAPPDATA\obsidian\*cache*" -Recurse -Force -ErrorAction SilentlyContinue
```

### 步骤4：清理Vault特定缓存
```bash
# 清理Vault中的缓存文件
Remove-Item -Path "D:\桌面\obsidian luman\.obsidian\workspace*" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "D:\桌面\obsidian luman\.obsidian\cache" -Recurse -Force -ErrorAction SilentlyContinue
```

### 步骤5：重新构建插件
```bash
# 在插件目录中重新构建
cd "d:\桌面\obsidian tuanki (3) (2) (5)\10-Project-Tuanki\anki-obsidian-plugin"
npm run build
```

### 步骤6：重启Obsidian
```bash
# 重新启动Obsidian
# 打开对应的Vault
# 检查插件是否正确加载
```

## 🎯 验证步骤

### 1. 检查插件文件
确认以下文件已正确生成：
- `D:\桌面\obsidian luman\.obsidian\plugins\tuanki\main.js`
- `D:\桌面\obsidian luman\.obsidian\plugins\tuanki\styles.css`
- `D:\桌面\obsidian luman\.obsidian\plugins\tuanki\manifest.json`

### 2. 检查文件时间戳
确认文件的修改时间是最新的（刚刚构建的时间）

### 3. 检查插件状态
在Obsidian中：
1. 打开设置 → 社区插件
2. 找到Tuanki插件
3. 确认插件状态为"已启用"
4. 如果需要，先禁用再重新启用

### 4. 检查FSRS设置界面
1. 打开插件设置
2. 进入FSRS6设置
3. 确认只显示三个标签页：基础设置、权重参数、变更历史

## 🚨 如果问题仍然存在

### 方法1：强制重新加载插件
1. 在Obsidian中禁用Tuanki插件
2. 关闭Obsidian
3. 删除插件目录：`D:\桌面\obsidian luman\.obsidian\plugins\tuanki`
4. 重新构建并复制插件文件
5. 重启Obsidian
6. 重新启用插件

### 方法2：使用开发者工具
1. 在Obsidian中按 `Ctrl+Shift+I` 打开开发者工具
2. 在Console中执行：`location.reload(true)` 强制刷新
3. 或者在Network标签页中勾选"Disable cache"

### 方法3：检查插件版本
确认manifest.json中的版本号是否正确更新，如果需要可以手动增加版本号。

## 📊 常见问题

### Q: 为什么会出现缓存问题？
A: Obsidian为了提高性能会缓存插件的JavaScript代码，特别是在开发模式下频繁更新时。

### Q: 如何避免缓存问题？
A: 
1. 每次更新后完全重启Obsidian
2. 使用开发模式时定期清理缓存
3. 更新manifest.json中的版本号

### Q: 缓存清理是否会影响其他插件？
A: 清理Obsidian全局缓存可能会影响其他插件的加载速度，但不会影响功能。

## 🎉 成功标志

当缓存清理成功后，您应该看到：
- FSRS6设置界面只显示3个标签页（不再有"智能优化"）
- 插件加载速度可能稍慢（因为缓存被清理）
- 所有功能正常工作

---

**注意**：请按照步骤顺序执行，确保每一步都完成后再进行下一步。
