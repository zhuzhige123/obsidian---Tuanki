# Weave (Weave)

<div align="center">

![Weave](https://img.shields.io/badge/Weave-Weave-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.8.2-green?style=for-the-badge)
![License](https://img.shields.io/badge/license-GPL--3.0-orange?style=for-the-badge)
![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-purple?style=for-the-badge)

</div>

Weave 是一款面向 Obsidian 的学习工作流插件，专注于把阅读摘录、记忆卡片与测试练习串成一条可追溯、可复盘的学习闭环。

主插件当前聚焦两类核心能力：

- 记忆牌组：基于 FSRS6 的主观记忆与复习调度
- 刷题牌组：由记忆卡片生成测试题并追踪客观表现（包含 EWMA 趋势追踪）

你在 Weave 中生成的卡片、测试题和来源信息都可以通过块引用与回链定位，方便回看知识来源、重组牌组和复盘学习结果。

最低支持的 Obsidian 版本：1.7.0

## 适合谁

- 希望在 Obsidian 内完成“摘录 -> 制卡 -> 复习 -> 测试”闭环的人
- 希望让卡片、题目和来源文档保持可追溯关系的人
- 需要在 Obsidian 与 Anki 之间同步卡片的人

## 核心能力

- 记忆卡片学习：支持基于 FSRS6 的复习调度
- 题库与测试：从记忆卡片生成测试题并追踪表现
- 引入式牌组：卡片不必绑定单一牌组，可灵活解散与重组
- 卡片管理：支持表格、网格、看板等多种管理视图
- 来源定位：可从卡片或题目回到原始内容上下文
- AnkiConnect 集成：支持与本地 Anki 互通

## 关于增量阅读独立插件

从 `0.8.0` 之后开始，**增量阅读已逐步拆分为独立的 Obsidian 插件方向**。  
当前这个 Weave 主插件 README 只介绍主插件本体的能力，不再把增量阅读作为主插件核心能力来介绍。

## 基础版与高级版

说明：
- `✅` 表示可用
- `❌` 表示不包含
- `⚠️` 表示基础版会降级为免费替代路径，或仅保留有限入口

快速理解：
- 免费版已经覆盖主界面、记忆卡片学习、FSRS6 复习、基础牌组学习、表格管理与来源回看，足够完成核心学习闭环。
- 高级版主要增强题库刷题、牌组分析、高级视图、批量解析、渐进式挖空与 AI 辅助等进阶能力。

| 功能 | 免费版 | 高级版 | 说明 |
|---|---|---|---|
| Weave 主界面与基础导航 | ✅ | ✅ | 插件主入口 |
| 记忆卡片学习与 FSRS6 复习调度 | ✅ | ✅ | 主体学习能力 |
| 牌组学习（Deck Study） | ✅ | ✅ | 基础学习流程 |
| 表格视图（Table） | ✅ | ✅ | 默认管理视图 |
| 查看原文 / 来源上下文（View Source） | ✅ | ✅ | 完全免费，不做限制 |
| 网格视图（Grid View） | ⚠️ | ✅ | 免费版会回退到表格视图并提示激活 |
| 时间线视图（Timeline View） | ⚠️ | ✅ | 免费版保持普通网格布局并提示激活 |
| 看板视图（Kanban View） | ⚠️ | ✅ | 免费版会回退到表格视图并提示激活 |
| 牌组分析（曲线、负荷等） | ❌ | ✅ | 高级版提供完整分析入口 |
| 刷题 / 题库（Question Bank） | ❌ | ✅ | 包含测试会话与表现追踪 |
| 图片遮罩（Image Occlusion） | ❌ | ✅ | 用于视觉遮挡类记忆训练 |
| 批量解析系统 | ❌ | ✅ | 用于自动解析、映射与触发 |
| AI 智能助手 | ⚠️ | ✅ | 免费版可能隐藏入口或不可用，以当前实现为准 |
| 渐进式挖空（Progressive Cloze） | ❌ | ✅ | 高级版增强学习能力 |

## 安装

大多数用户只需要这三个核心文件：
- `main.js`
- `manifest.json`
- `styles.css`

只有在你需要 `旧版 APKG 导入` 时，才需要额外放入 `sql-wasm.wasm`。

### 方式一：社区插件市场

1. 打开 Obsidian 设置
2. 进入社区插件
3. 关闭安全模式
4. 搜索 Weave
5. 安装并启用

说明：
- 社区市场安装默认只依赖上面的三件套。
- `旧版 APKG 导入` 属于可选增强能力；社区市场安装默认不包含它所需的 `sql-wasm.wasm` 运行时资源。

### 方式二：手动安装

1. 下载三件套：
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. 如需使用 `旧版 APKG 导入`，再额外下载：
   - `sql-wasm.wasm`
3. 复制到：

   `.obsidian/plugins/weave/`

4. 重启 Obsidian 并启用插件

补充说明：
- 不需要旧版 APKG 导入时，只复制三件套即可正常使用插件主体功能。
- `versions.json` 是仓库发布与版本兼容映射文件，不是社区市场安装所需运行时文件。

## 快速开始

1. 打开 Weave 视图
   - 可通过功能区图标或命令面板
2. 打开设置
   - 配置数据路径、牌组与相关功能开关
3. 从一个闭环开始
   - 从 Markdown 内容创建记忆卡片
   - 开始学习与复习
   - 从卡片生成测试并开始测试会话

## 默认数据保存位置

Weave 默认会把正式学习数据保存在当前 Obsidian 仓库中的 `weave/` 目录下。

常见位置：
- 记忆牌组数据：`weave/memory/`
- 考试题组数据：`weave/question-bank/`
- 插件本地缓存与状态：`.obsidian/plugins/weave/`

文件格式说明：
- `.wdeck`：记忆牌组文件格式，用于保存正式牌组的结构与归属信息。
- `.qbank`：考试题组文件格式，每个考试题组对应一个独立的 `.qbank` 文件。
- Markdown 与附件：你在仓库里原本就有的笔记、图片、音频等内容，仍然按 Obsidian 原生方式保存和引用。

补充说明：
- `weave/` 下主要保存需要长期保留的学习数据。
- `.obsidian/plugins/weave/` 下主要保存缓存、本地状态、日志与其他可重建的插件运行数据。
- 除非你明确知道自己在做什么，否则不建议手动批量改名、移动或删除 `.wdeck` 与 `.qbank` 文件。

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
