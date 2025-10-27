# 🎯 Tuanki - Obsidian 智能记忆卡片插件

<div align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-0.15.0+-purple.svg)](https://obsidian.md)
[![GitHub Stars](https://img.shields.io/github/stars/zhuzhige123/obsidian---Tuanki?style=social)](https://github.com/zhuzhige123/obsidian---Tuanki)

**为 Obsidian 打造的现代化间隔重复学习插件**

基于科学的 FSRS6 算法 | 优雅的 Svelte 5 界面 | 开源代码 + 付费许可证

[快速开始](#-快速开始) · [功能特性](#-核心功能) · [商业模式](#-商业模式说明) · [安装指南](#-安装) · [购买许可证](#-购买许可证)

</div>

---

## 💎 商业模式说明

Tuanki 采用 **开源代码 + 付费许可证** 的商业模式。

### 为什么代码开源但需要许可证？

1. **透明度与信任** - 所有代码开源，接受社区审计，确保安全和质量
2. **遵循规范** - 符合 Obsidian 官方插件市场要求
3. **商业支持** - 许可证收入支持持续开发、维护和技术支持
4. **社区贡献** - 欢迎开源贡献，活跃贡献者可获得免费许可证

这种模式类似于 Sublime Text、JetBrains 系列产品，代码可见但需要许可证激活高级功能。

### 免费功能（无需许可证）

基础功能对所有用户完全免费：

- ✅ **卡片创建和编辑** - 支持多种卡片类型
- ✅ **FSRS6 智能算法** - 科学的间隔重复调度
- ✅ **基础学习统计** - 学习进度和记忆率
- ✅ **数据导入导出** - JSON、CSV 格式支持
- ✅ **Anki 数据同步** - 从 Anki 导入数据
- ✅ **APKG 文件导入** - 快速迁移学习内容
- ✅ **基础表格视图** - 高效管理所有卡片

### 高级功能（需要许可证）

购买许可证后解锁所有高级功能：

- 💎 **AI 智能制卡** - 使用 AI 批量生成高质量卡片
- 💎 **批量操作** - 高效的批量编辑和管理工具
- 💎 **高级统计分析** - 详细的学习数据分析、热力图、趋势图
- 💎 **网格视图** - 美观的卡片网格展示
- 💎 **看板视图** - 看板式学习管理
- 💎 **时间线视图** - 基于时间轴的学习规划
- 💎 **Tuanki 标注系统** - 基于文档标注快速创建卡片
- 💎 **卢曼卡片 ID** - 构建知识网络
- 💎 **所有未来高级功能** - 终身免费更新

### 许可证技术说明

- **加密方式**: RSA-2048 数字签名
- **验证方式**: 完全离线验证，保护隐私
- **开源透明**: 验证逻辑完全开源，可审计
- **公钥公开**: 公钥包含在代码中是安全的（RSA 加密原理）
- **隐私保护**: 不上传任何用户数据

---

## ✨ 特色亮点

### 🧠 智能学习算法
- **FSRS6 算法**: 基于大量学习数据训练的智能调度系统
- **自适应学习**: 根据个人表现动态调整复习间隔
- **科学记忆建模**: 准确预测遗忘时间，优化学习效率

### 🎨 现代化界面
- **Cursor 风格设计**: 精致的视觉风格，注重细节
- **响应式布局**: 完美适配各种屏幕尺寸
- **流畅动画**: 基于 Svelte 5 的高性能交互
- **主题集成**: 无缝融入 Obsidian 的主题系统

### 🔒 隐私优先
- **本地存储**: 所有数据存储在本地 Vault
- **离线使用**: 无需网络连接
- **开源透明**: 代码完全开源，接受社区审计

---

## 🚀 核心功能

### 📝 卡片创建与编辑
- **多种卡片类型**: 基础卡片、选择题、填空题、图片遮挡等
- **Markdown 支持**: 完整的 Markdown 语法支持
- **智能解析**: 自动识别卡片类型和内容
- **批量创建**: 高效的批量制卡工具

### 📊 学习与复习
- **智能调度**: FSRS6 算法精准预测复习时间
- **多种视图**: 卡片表格、网格视图、看板视图
- **学习统计**: 详细的学习数据分析和可视化
- **自定义模板**: 灵活的卡片模板系统

### 🔄 数据管理
- **Anki 同步**: 完整的 Anki 数据导入导出
- **APKG 导入**: 支持导入 Anki 卡片包
- **JSON/CSV 导出**: 方便的数据备份和迁移

### 🤖 AI 辅助（需配置 API Key）
- **AI 智能制卡**: 使用 AI 批量生成高质量卡片
- **多服务商支持**: OpenAI、Claude、本地模型等
- **智能格式化**: 自动优化卡片内容和格式

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

```bash
# 克隆仓库
git clone https://github.com/zhuzhige123/obsidian---Tuanki.git
cd obsidian---Tuanki

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build
```

---

## 📖 快速开始

### 1. 创建第一张卡片

在 Obsidian 笔记中使用卡片标记：

```markdown
---start---
Q: 什么是间隔重复学习？
A: 间隔重复学习是一种学习技术，通过增加复习间隔来提高长期记忆效果。
---end---
```

### 2. 开始学习

1. 点击侧边栏的 Tuanki 图标
2. 选择要学习的牌组
3. 点击「开始学习」
4. 根据记忆情况选择难度

### 3. 查看统计

在统计页面查看学习进度、记忆曲线等数据。

---

## 💰 购买许可证

### 价格

- 💰 **正式价**: ¥64（终身许可，一次购买永久使用）
- 🎁 **早鸟优惠**: ¥46（限时）

### 购买方式

[点击购买许可证](mailto:tutaoyuan8@outlook.com?subject=购买%20Tuanki%20许可证)

或发送邮件到：tutaoyuan8@outlook.com

### 许可证特权

- ✅ 解锁所有高级功能
- ✅ 终身免费更新
- ✅ 优先技术支持
- ✅ 参与新功能内测
- ✅ 支持项目持续发展

---

## 🤝 贡献

我们欢迎所有形式的贡献！

### 贡献者福利

活跃贡献者可以获得 **免费的许可证**！

- **代码贡献**: 修复 Bug、新功能开发
- **文档贡献**: 翻译文档、编写教程
- **社区贡献**: 解答问题、测试反馈

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)

### 如何贡献

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 🛠️ 技术栈

- **前端框架**: Svelte 5 + TypeScript
- **样式系统**: UnoCSS + CSS Variables
- **算法核心**: FSRS6 间隔重复算法
- **构建工具**: Vite + 热重载开发
- **测试框架**: Vitest

---

## 📝 常见问题

### Q: 为什么代码开源还要收费？

**A**: Tuanki 采用"开源代码 + 商业许可证"模式。代码开源是为了透明度和符合 Obsidian 规范，许可证收入用于支持持续开发和维护。这是软件行业的成熟商业模式（如 Sublime Text、JetBrains）。

### Q: 我可以修改代码绕过许可证验证吗？

**A**: 技术上可以，我们不会阻止。但是：
- 破解版无法获得官方技术支持
- 破解版无法接收自动更新
- 购买许可证支持项目发展
- 正版用户享受无缝升级体验

### Q: 数据存储在哪里？

**A**: 所有数据都存储在您的 Obsidian Vault 中，完全本地化，保护您的隐私。

### Q: 如何备份数据？

**A**: 数据存储在 Vault 的 `.obsidian/plugins/tuanki/data.json` 中，您可以随时备份此文件。

### Q: 支持移动端吗？

**A**: 目前主要针对桌面端优化，移动端支持正在开发中。

更多问题请查看 [LICENSE_FAQ.md](./LICENSE_FAQ.md)

---

## 📞 联系方式

- **开发者邮箱**: tutaoyuan8@outlook.com
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
