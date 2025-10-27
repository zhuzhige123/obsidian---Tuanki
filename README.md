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
2. 解压到 Vault 的 .obsidian/plugins/tuanki/ 目录
3. 重启 Obsidian
4. 在设置中启用插件

### 方式三：从源码构建

\\\ash
# 克隆仓库
git clone https://github.com/zhuzhige123/obsidian---Tuanki.git
cd obsidian---Tuanki

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build
\\\

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
\\\markdown
---start---
Q: 什么是间隔重复学习？
A: 间隔重复学习是一种学习技术，通过增加复习间隔来提高长期记忆效果。
---end---
\\\

#### 选择题
\\\markdown
---start---
## 地球的卫星是什么？
- 太阳
- [x] 月球
- 火星
- 金星
---end---
\\\

#### 挖空卡片
\\\markdown
---start---
FSRS 算法可以==精准预测==遗忘时间。
---end---
\\\

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
2. **创建功能分支** (\git checkout -b feature/AmazingFeature\)
3. **提交更改** (\git commit -m 'feat: add amazing feature'\)
4. **推送到分支** (\git push origin feature/AmazingFeature\)
5. **开启 Pull Request**

### 开发指南

\\\ash
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
\\\

### 项目结构

\\\
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
\\\

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
**A**: 数据存储在 Vault 的 .obsidian/plugins/tuanki/data.json 中，您可以随时备份此文件。

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
