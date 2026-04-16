# Weave (Weave)

<div align="center">

![Weave](https://img.shields.io/badge/Weave-Weave-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.7.8-green?style=for-the-badge)
![License](https://img.shields.io/badge/license-GPL--3.0-orange?style=for-the-badge)
![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-purple?style=for-the-badge)

</div>

Weave 是一款完全服务于 Obsidian 的学习工作流插件。插件内的主界面视图名为 Weave。

Weave 的核心目标是把三个环节串起来，形成可追溯、可验证、可复盘的闭环：

- 阅读牌组：阅读材料管理与增量阅读工作流
- 记忆牌组：基于 FSRS6 的主观记忆与复习调度
- 刷题牌组：由记忆卡片生成测试题并追踪客观表现（包含 EWMA 趋势追踪相关实现）

在这个闭环里，你产生的摘录笔记、记忆卡片、测试题目都可以通过块引用链接和回链进行定位，实现环环相扣。

最低支持的 Obsidian 版本：1.7.0

## 一段插件介绍

Weave,意为编织，一款以阅读牌组，记忆牌组，刷题牌组等三大核心功能为主体，分别使用TVP-DS,FSRS6,EWMA算法，完全服务于obsidian并随之全平台使用的颜值与实力并存的插件。其功能分别定位并应用于外部阅读材料转换为内部知识文档的环节，基于obsidian的md文件任意摘选生成记忆卡片进行主观记忆的过程，生成的记忆卡片又用来生成测试题并进行客观验证的结果。在这里，你所有生成的摘录笔记，记忆卡片，测试题目都可以通过块引用链接真正做到迹可循，环环相扣，相辅相成，旨在巩固和掌握你自己的obsdsidian知识网络体系。

在这里，你可以选中obsidian当将插件主界面视图移动到obsidian的侧边栏中，点击关联文档，可自动筛选显示当前编辑活动文档生成的摘录笔记，记忆卡片和相关测试题。可通过引入式牌组架构，一张卡片不再从属于单一牌组，它可以被多个牌组使用，你可以任意解散重组牌组，以此优化该牌组所有卡片的组成。以多数据源，多视图呈现你基于obsidian md文档导入或生成的阅读文档，记忆卡片，测试习题，并进行批量管理。也可以通过anki connect从anki中获取牌组卡片，或者将Weave中的卡片同步到anki，获取与导出的过程都进行了对应的内容格式的转换，以适配不同的编辑与预览环境。

而Weave，远不止于此。插件中的内容编辑器使用便是官方的编辑器，你可以在这里体验到所有应用于obsidian内容编辑场景的插件功能。也可以自动关联obsidian的知识图谱，明白当前阅读文档，记忆卡片在知识库双链视图中的定位。插件中的界面设计以obsidian主题变量为背景进行高度自定义的优化设计，所以你可以选择obsidian数以百计的不同主题装饰插件的所有界面。

同样，Weave，远不止于此！基于三大环环相扣，相辅相成的核心功能，图片遮罩，时间分散，渐进挖空 ，曲线图，热力图，负载图......应运而生。

由此，期待你的体验与支持！

## 基础功能与高级功能对比

| 模块 | 功能项 | 基础版（未激活） | 高级版（已激活） | 许可证控制ID | 备注 |
|---|---|---|---|---|---|
| 总览 | Weave 主界面与基础导航 | 可用 | 可用 | 无 | 主要入口 |
| 记忆牌组 | 学习与复习调度（FSRS6） | 可用 | 可用 | 无 | 基础能力 |
| 牌组学习 | 牌组学习（Deck Study） | 可用 | 可用 | 无 | 基础能力 |
| 卡片管理 | 表格视图（Table） | 可用 | 可用 | 无 | 默认视图 |
| 卡片管理 | 网格视图（Grid View） | 不可用 | 可用 | `grid-view` | 无权限会降级为表格并提示激活 |
| 卡片管理 | 时间线视图（Timeline View） | 不可用 | 可用 | `timeline-view` | 无权限会保持普通网格布局并提示激活 |
| 卡片管理 | 看板视图（Kanban View） | 不可用 | 可用 | `kanban-view` | 无权限会降级为表格并提示激活 |
| 牌组分析 | 牌组分析模态窗（曲线、负荷等） | 不可用 | 可用 | `deck-analytics` | 当前统计分析主要承载入口 |
| 增量阅读 | 增量阅读（IR 标注笔记体系） | 不可用 | 可用 | `incremental-reading` | 主要用于阅读材料管理与增量阅读工作流 |
| 题库系统 | 刷题/题库（Question Bank） | 不可用 | 可用 | `question-bank` | 测试会话与表现追踪等 |
| 批量解析 | 批量解析系统 | 不可用 | 可用 | `batch-parsing` | 自动解析、映射与触发 |
| AI | AI 智能助手 | 不可用或隐藏入口 | 可用 | `ai-assistant` | 以当前页面实现为准 |
| 挖空学习 | 渐进式挖空（Progressive Cloze） | 不可用 | 可用 | `progressive-cloze` | 以当前功能入口为准 |
| 溯源 | 查看原文/查看来源上下文（View Source） | 可用 | 可用 | 无 | 完全免费，不做限制 |

## 安装

### 方式一：社区插件市场（暂未上架）

1. 打开 Obsidian 设置
2. 进入社区插件
3. 关闭安全模式
4. 搜索 Weave
5. 安装并启用

### 方式二：手动安装

1. 下载发布包中的文件：
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `sql-wasm.wasm`（如发布包包含）
   - `versions.json`（建议一并复制，用于版本兼容信息）
2. 复制到：

   `.obsidian/plugins/weave/`

3. 重启 Obsidian 并启用插件

## 快速开始

1. 打开 Weave 视图
   - 可通过功能区图标或命令面板
2. 打开设置
   - 配置数据路径、牌组与相关功能开关
3. 从一个闭环开始
   - 导入阅读材料并制作摘录
   - 从 Markdown 内容创建记忆卡片
   - 开始学习与复习
   - 从卡片生成测试并开始测试会话

## 数据目录与同步

项目中将数据分为两类路径：

1. Vault 数据（建议跨设备同步）
   - 数据根目录：`weave/`
   - 包含记忆（`weave/memory/`）、增量阅读（`weave/incremental-reading/`）、考试题库（`weave/question-bank/`）等学习状态与调度状态

2. 插件目录数据（建议本地保存，不参与同步）
   - 根目录：`.obsidian/plugins/weave/`
   - 包含 `state/`（本地状态，如 `user-profile.json`、`import-mappings.json`、`study-session.json`、`local-storage.json`、`quality-inbox.json`）、`cache/`（缓存/索引/迁移元数据）、日志、备份

增量阅读在处理后也可以输出可读的 Markdown 到可见目录（默认在 `weave/incremental-reading/IR`，可在设置中调整）。

## 信息披露

### 付费说明
- 核心学习功能可免费使用。
- 部分高级功能需要有效的付费激活码才能解锁。
- 激活高级功能时需要提供邮箱地址，用于许可证绑定和跨设备校验。

### 网络使用
- **AI 助手**：连接用户自行配置的 AI API 接口。实际发送的数据取决于用户操作和所选服务商。
- **许可证激活/验证**：连接插件许可证服务。请求中可能包含激活码、绑定邮箱、派生设备指纹和平台信息。
- **AnkiConnect**：仅通过 `localhost` 连接本地 Anki，不会把 Anki 数据发送到公共远程服务器。

### 文件访问
- 插件会读取和写入当前 Obsidian 仓库内的 Markdown、附件、卡片数据和学习状态。
- 插件也会在 `.obsidian/plugins/weave/` 下保存本地状态、缓存、备份和日志。
- 除非用户主动使用联网功能，否则仓库内容不会上传到外部服务。

### 遥测、广告与源代码
- 插件不包含广告。
- 插件不包含面向产品运营分析的客户端遥测。
- 当前仓库包含用于审核与发布的客户端源代码；私钥、服务端凭证和其他真正敏感的密钥不会包含在客户端仓库中。

## 许可证

本项目基于 [GPL-3.0-or-later](LICENSE) 协议。

如需支持与反馈：

- Email: tutaoyuan8@outlook.com
- Issues: https://github.com/zhuzhige123/obsidian---Weave/issues

## 开发

```
npm install
npm run dev
```

注意：

- 开发模式使用 Vite watch 构建流程。
- 如果 `.env` 中的 `OBSIDIAN_VAULT_PATH` 指向某个 Obsidian 仓库下的 `.obsidian` 目录，`npm run dev` 会自动把桌面端开发产物同步到 `plugins/weave/`，用于测试仓库热重载。
- 桌面端开发会先写入项目内的 `.desktop-hot-reload/` 暂存目录，再以原子方式同步到目标插件目录，避免 Obsidian 正在读取插件文件时出现半写入状态。

## 更多文档

- 发布流程：`docs/RELEASE_GUIDE.md`
- 图片遮罩：`docs/IMAGE_MASK_GUIDE.md`
