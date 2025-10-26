# 🤝 贡献指南

感谢您对 Tuanki 项目的关注！我们欢迎各种形式的贡献。

---

## 🎯 贡献方式

### 1. 代码贡献

#### 开发环境设置

\\\ash
# 克隆项目
git clone https://github.com/你的用户名/tuanki.git
cd tuanki

# 安装依赖
npm install

# 启动开发服务器
npm run dev
\\\

#### 代码规范

- **TypeScript**: 使用严格模式，避免 \ny\ 类型
- **Svelte 5**: 使用 Runes 模式 (\\\, \\\, \\\)
- **命名**: 使用 camelCase（变量/函数）和 PascalCase（组件/类）
- **注释**: 复杂逻辑必须添加注释
- **提交信息**: 遵循 Conventional Commits 规范

#### 提交流程

1. Fork 项目
2. 创建功能分支：\git checkout -b feature/amazing-feature\
3. 提交更改：\git commit -m 'feat: add amazing feature'\
4. 推送分支：\git push origin feature/amazing-feature\
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

\\\
<type>(<scope>): <subject>

<body>

<footer>
\\\

### Type 类型

- \eat\: 新功能
- \ix\: Bug 修复
- \docs\: 文档更新
- \style\: 代码格式调整
- \efactor\: 重构代码
- \	est\: 测试相关
- \chore\: 构建过程或辅助工具

### 示例

\\\
feat(card): 添加卡片批量编辑功能

- 实现多选卡片
- 添加批量操作菜单
- 支持批量修改标签和牌组

Closes #123
\\\

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

\\\ash
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
\\\

### 项目结构

\\\
src/
├── components/     # Svelte 组件
├── services/       # 业务逻辑服务
├── utils/          # 工具函数
├── types/          # TypeScript 类型定义
└── main.ts         # 插件入口
\\\

### 关键模块

- \src/utils/licenseManager.ts\: 激活码验证
- \src/services/fsrs/\: FSRS 算法实现
- \src/components/study/\: 学习界面
- \src/services/data/\: 数据管理

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
