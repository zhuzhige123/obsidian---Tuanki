# ✅ 开源准备清单

本文档提供完整的开源发布检查清单，确保安全、专业地将 Tuanki 插件开源。

---

## 📋 总览

**目标**: 安全地将 Tuanki 开源，保护私钥和激活码系统，同时通过 Obsidian 官方审核。

**预计时间**: 2-4 小时

**关键原则**:
- ✅ 私钥绝对不能泄露
- ✅ 已售出激活码继续有效
- ✅ 验证逻辑可以公开
- ✅ 文档清晰专业

---

## 🔒 第一阶段：安全清理（最高优先级）

### 1.1 备份

```markdown
□ 完整备份项目到：D:\tuanki-backup-[日期]
□ 私钥备份到：D:\tuanki-private\private-key.pem
□ 激活码记录备份到：D:\tuanki-private\activation-codes-backup\
□ 至少3份备份：本地 + 移动硬盘 + 加密云盘
□ 验证备份完整性和可访问性
```

**验证命令**:
```powershell
Test-Path "D:\tuanki-backup-*"
Test-Path "D:\tuanki-private\private-key.pem"
Test-Path "D:\tuanki-private\activation-codes-backup"
```

### 1.2 Git 历史清理

```markdown
□ 安装 git-filter-repo：pip install git-filter-repo
□ 清理私钥文件：scripts/generate-activation-codes.cjs
□ 清理激活码文件：generated-*.json, codes-*.txt, 激活码*.txt
□ 清理敏感文档：激活码使用说明.md, 发卡平台说明.md 等
□ 运行安全检查：git grep -i "BEGIN PRIVATE KEY"
□ 运行安全检查：git ls-files | grep "激活码"
□ 验证清理结果：0个私钥，0个激活码文件
```

**参考文档**: [Git 历史清理指南](./GIT_CLEANUP.md)

### 1.3 .gitignore 配置

```markdown
□ 添加私钥文件规则：*.pem, *.key, *private-key*
□ 添加激活码文件规则：generated-*.json, codes-*.txt, 激活码*
□ 添加旧脚本规则：scripts/generate-activation-codes.cjs
□ 测试 .gitignore：尝试 add 敏感文件（应被忽略）
□ 提交 .gitignore 更新
```

---

## 📝 第二阶段：代码和文档准备

### 2.1 激活码系统重构

```markdown
□ 创建新脚本：scripts/generate-activation-codes-secure.cjs
□ 测试新脚本：生成1个激活码
□ 验证兼容性：测试新激活码能否激活
□ 验证向后兼容：测试老激活码仍然有效
□ 更新脚本文档注释
□ 删除或标记废弃旧脚本
```

**测试命令**:
```powershell
# 测试生成
node scripts/generate-activation-codes-secure.cjs 1 --key-file="D:\tuanki-private\private-key.pem"

# 在插件中测试激活
# 1. 使用新生成的激活码
# 2. 使用之前的老激活码
# 两者都应该成功
```

### 2.2 文档创建

```markdown
□ 创建 docs/PRIVATE_KEY_SETUP.md（私钥设置指南）
□ 创建 docs/ACTIVATION_SYSTEM.md（技术文档）
□ 创建 docs/GIT_CLEANUP.md（清理指南）
□ 创建 docs/OPEN_SOURCE_CHECKLIST.md（本清单）
□ 更新 README.md（添加激活码说明）
□ 创建 CONTRIBUTING.md（贡献指南）
□ 创建 SECURITY.md（安全政策）
□ 检查所有文档的链接是否正确
```

### 2.3 README 更新

在 `README.md` 中添加：

```markdown
## 💎 激活码系统

Tuanki 采用基础功能免费，高级功能付费的模式。

### 免费功能
- ✅ 卡片创建和编辑
- ✅ FSRS6 智能算法
- ✅ 数据导入导出
- ✅ Anki 单向同步

### 高级功能（需要激活码）
- 💎 AI 智能制卡
- 💎 批量制卡
- 💎 高级统计分析
- 💎 多视图模式
- 💎 Tuanki 标注系统

### 购买激活码
- 早鸟价：¥46（限时）
- 正式价：¥64
- [立即购买](您的发卡平台链接)

### 技术细节
- 采用 RSA-2048 数字签名
- 完全离线验证
- 隐私保护（不上传数据）
- 开源透明（验证逻辑可审计）

详见：[激活码系统技术文档](./docs/ACTIVATION_SYSTEM.md)

## 🤝 贡献

欢迎贡献代码、文档和建议！

贡献者可获得免费的高级功能访问权，详见 [CONTRIBUTING.md](./CONTRIBUTING.md)
```

检查清单：
```markdown
□ 添加激活码系统说明
□ 列出免费和付费功能
□ 添加购买链接
□ 说明技术架构
□ 提及贡献者福利
□ 更新安装说明
□ 更新功能列表
□ 检查所有链接
```

---

## 🔍 第三阶段：安全审查

### 3.1 自动化安全检查

```markdown
□ 创建 scripts/security-check.ps1
□ 运行安全检查脚本
□ 修复所有发现的问题
□ 重新运行直到0个错误
```

**运行检查**:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/security-check.ps1
```

### 3.2 手动代码审查

```markdown
□ 搜索代码中的 TODO/FIXME/HACK 注释
□ 检查是否有硬编码的测试数据
□ 检查是否有调试日志泄露信息
□ 验证所有 console.log 都是合适的
□ 检查是否有临时测试代码
```

**搜索命令**:
```powershell
git grep -i "TODO"
git grep -i "FIXME" 
git grep -i "HACK"
git grep -i "test.*password"
git grep -i "debug.*key"
```

### 3.3 依赖审查

```markdown
□ 检查 package.json 中的依赖
□ 移除不必要的开发依赖
□ 更新过时的依赖
□ 运行 npm audit（修复安全漏洞）
□ 验证所有依赖的许可证兼容性
```

**审查命令**:
```powershell
npm outdated
npm audit
npm audit fix
```

---

## 🚀 第四阶段：GitHub 发布

### 4.1 GitHub 仓库设置

```markdown
□ 创建新的 GitHub 仓库（如果还没有）
□ 设置仓库描述：Obsidian 间隔重复学习插件，基于 FSRS6 算法
□ 添加主题标签：obsidian, obsidian-plugin, spaced-repetition, fsrs
□ 设置许可证：MIT License
□ 启用 Issues
□ 启用 Discussions（可选）
□ 创建 .github/ISSUE_TEMPLATE/（Issue 模板）
□ 创建 .github/PULL_REQUEST_TEMPLATE.md（PR 模板）
```

### 4.2 推送代码

```markdown
□ 添加远程仓库：git remote add origin <URL>
□ 推送 main 分支：git push -u origin main
□ 推送所有标签：git push --tags
□ 验证 GitHub 上没有敏感文件
□ 在 GitHub 上手动搜索私钥关键字
□ 在 GitHub 上检查文件列表
```

### 4.3 GitHub 仓库完善

```markdown
□ 添加 README badges（构建状态、许可证等）
□ 添加 .github/workflows/（CI/CD，可选）
□ 设置 GitHub Pages（文档站点，可选）
□ 添加 CHANGELOG.md（版本历史）
□ 添加 LICENSE 文件
□ 创建 Release（v1.0.0）
```

---

## 📦 第五阶段：Obsidian 官方市场提交

### 5.1 前置要求

```markdown
□ GitHub 仓库必须公开
□ 包含 manifest.json
□ 包含 main.js（编译后）
□ 包含 styles.css（如果有）
□ 包含 README.md
□ 代码质量通过基本检查
□ 无明显的安全问题
```

### 5.2 manifest.json 检查

```markdown
□ id: 唯一且符合规范
□ name: 清晰的插件名称
□ version: 语义化版本号（如 1.0.0）
□ minAppVersion: 最低 Obsidian 版本
□ description: 简洁的功能描述
□ author: 作者信息
□ authorUrl: GitHub 或个人网站
□ isDesktopOnly: 根据实际情况设置
```

### 5.3 提交流程

```markdown
□ Fork https://github.com/obsidianmd/obsidian-releases
□ 在 community-plugins.json 添加插件信息
□ 创建插件目录：community-plugins/tuanki/
□ 添加 manifest.json, main.js, styles.css
□ 提交 Pull Request
□ 在 PR 描述中说明插件功能和特点
□ 等待官方审核和反馈
□ 根据反馈进行修改
```

**提交信息模板**:
```markdown
# Add Tuanki Plugin

Tuanki 是一个强大的间隔重复学习插件，为 Obsidian 带来现代化的记忆卡片学习体验。

## 主要特性
- 基于 FSRS6 算法的智能调度
- 现代化的用户界面（Cursor 风格）
- 完整的卡片管理系统
- 数据导入导出
- Anki 兼容

## 技术栈
- Svelte 5（Runes 模式）
- TypeScript（严格模式）
- UnoCSS

## 文档
- README: [链接]
- 技术文档: [链接]
- 用户指南: [链接]

请审核，谢谢！
```

---

## ✅ 第六阶段：最终验证

### 6.1 功能测试

```markdown
□ 测试基础功能（创建、编辑、学习）
□ 测试激活流程（新激活码）
□ 测试激活流程（老激活码）
□ 测试高级功能解锁
□ 测试数据导入导出
□ 测试在不同 Obsidian 版本
□ 测试在不同操作系统（Windows/Mac/Linux）
```

### 6.2 文档验证

```markdown
□ 所有链接都有效
□ 代码示例都正确
□ 截图是最新的
□ 安装说明清晰易懂
□ 无拼写错误
□ 格式统一
```

### 6.3 社区准备

```markdown
□ 准备发布公告
□ 准备介绍文章/视频
□ 准备FAQ文档
□ 设置社区支持渠道（GitHub Issues/讨论组）
□ 准备用户反馈收集机制
```

---

## 📊 发布后任务

### 短期（1周内）

```markdown
□ 监控 GitHub Issues
□ 回复用户问题
□ 收集反馈和建议
□ 修复紧急 Bug
□ 更新文档（基于反馈）
```

### 中期（1个月内）

```markdown
□ 分析用户使用数据
□ 优先处理高频问题
□ 发布 Bug 修复版本
□ 完善文档和教程
□ 建立社区贡献者关系
```

### 长期（持续）

```markdown
□ 定期更新功能
□ 保持与 Obsidian 同步
□ 培养社区
□ 发展插件生态
□ 规划下一阶段功能
```

---

## 🚨 紧急响应计划

### 如果发现私钥泄露

```markdown
1. □ 立即生成新的密钥对
2. □ 更新客户端公钥（支持多版本）
3. □ 发布紧急更新（24小时内）
4. □ 通知所有用户
5. □ 为现有用户重新生成激活码
6. □ 发布公告说明情况
7. □ 调查泄露原因
8. □ 加固安全措施
```

### 如果发现严重 Bug

```markdown
1. □ 评估影响范围
2. □ 创建 hotfix 分支
3. □ 快速修复并测试
4. □ 发布修复版本
5. □ 通知受影响用户
6. □ 更新文档和公告
```

---

## 📞 资源和支持

### 官方文档
- Obsidian 插件开发：https://docs.obsidian.md/Plugins
- Obsidian 社区插件提交：https://github.com/obsidianmd/obsidian-releases

### 内部文档
- [私钥设置指南](./PRIVATE_KEY_SETUP.md)
- [激活码系统技术文档](./ACTIVATION_SYSTEM.md)
- [Git 历史清理指南](./GIT_CLEANUP.md)

### 联系方式
- 📧 技术支持：tutaoyuan8@outlook.com
- 🐛 Bug 报告：GitHub Issues
- 💬 功能建议：GitHub Discussions

---

## ✅ 最终确认

在公开仓库前，确认以下所有项：

```markdown
□ 私钥已从 Git 历史中完全移除
□ 激活码文件已从 Git 历史中完全移除
□ 运行安全检查脚本：0 个错误
□ .gitignore 配置完整
□ 所有文档已创建并检查
□ README 清晰专业
□ 测试激活系统正常工作
□ 老激活码仍然有效（保护现有用户）
□ GitHub 仓库配置完成
□ 已备份所有敏感信息
□ 团队成员已通知（如适用）

我确认已完成所有检查项，可以安全开源。

签名：_______________  日期：_______________
```

---

**最后更新**: 2025年10月26日
**清单版本**: v2.0
**预计完成时间**: 2-4 小时

