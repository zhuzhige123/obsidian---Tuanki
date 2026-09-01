# Weave Deck

[简体中文](#中文文档) | [English](#english-documentation)

![weave-series-banner-og](https://github.com/user-attachments/assets/a52c0875-9296-4dfd-bf94-114a225f2972)

![weave-series-banner-trinity](https://github.com/user-attachments/assets/8f748341-bb83-4cf9-b020-d8cd18a2aa92)

![weave-plugin-banner-deck](https://github.com/user-attachments/assets/2bd06511-2e12-4719-a4ae-64e590040986)

![weave-plugin-banner-deck](https://github.com/user-attachments/assets/767fd9be-6a9f-454b-8109-55a0b8c1adec)

**在 Obsidian 中完成「摘录 → 制卡 → 复习 → 测试 → 溯源」的学习闭环**

**Complete the learning loop in Obsidian: Excerpt → Cards → Review → Test → Trace**

---

## 中文文档

### 插件介绍

Obsidian Weave插件系列包含Weave Deck，Weave epub reader，Weave incremental reading三款插件，有且仅有三款。该系列完全服务于obsidian，围绕在obsidian中长期学习而诞生。

而Weave Deck插件为该系列的最重要的插件，功能内容最多，应用覆盖面最广。它能够帮助你基于obsidian的md内容生成记忆卡片保存在独立的deck牌组文件中，避免污染源文档又能集中管理，并通过生成的溯源链接进行溯源定位，关联筛选显示基于该文档生成了哪些重要的记忆卡片，摘录卡片等。也支持将生成的各类题目卡片组建为试卷并进行测试。以便于你更好的记忆巩固，测试验证是否掌握的该内容。



最低 Obsidian 版本：**1.7.0**

围绕 **摘录 → 制卡 → FSRS6 复习 → 测验验证 → 溯源重组** 的学习闭环设计：卡片与源笔记分离存储，复习与测验时仍可回到原文语境。

### 基础体验与高级支持

对照以插件内激活提示为准：**基础体验永久可用**；**高级支持**为可选买断。下表按能力类别列出当前版本功能划分（与插件内「基础使用 / 高级功能」展示一致）。**分析图表**按对象分为两类：**记忆牌组**（`.wdeck`，FSRS 复习）与 **考试题组**（`.qbank`，刷题与测验），互不混用。


| 类别 | 能力 | 基础体验 | 高级支持 |
| --- | --- | --- | --- |
| **平台** | 全平台（Windows / macOS / Linux / iOS / Android） | ✅ | ✅ |
| **学习与卡片** | **FSRS6** 间隔复习、牌组学习、撤销评分、兄弟卡智能分散 | ✅ | ✅ |
| | 问答 / 普通挖空 / 填空题 / 选择题（单选、多选） | ✅ | ✅ |
| | 填空题输入模式（学习时输入作答、即时判分） | ✅ | ✅ |
| | 回顾型摘录笔记与回忆型记忆卡片 | ✅ | ✅ |
| | 渐进式挖空 | 🔒 | ✅ |
| | 图片遮罩（图像挖空与遮盖练习） | 🔒 | ✅ |
| **制卡与溯源** | Obsidian 原生卡片编辑（Markdown / 公式 / 社区渲染） | ✅ | ✅ |
| | 从当前活动文档制卡、带溯源链接回跳 | ✅ | ✅ |
| | 查看原文、学习来源信息栏 | ✅ | ✅ |
| | 多来源溯源（Markdown 块引用、Canvas 节点、EPUB CFI†） | ✅ | ✅ |
| **记忆牌组** | 正式牌组、引用式牌组（卡片可归属多个牌组） | ✅ | ✅ |
| | 涌现牌组（按标签与规则自动聚合） | 🔒 | ✅ |
| | 牌组记忆率徽章、牌组背景图 | 🔒 | ✅ |
| | **分析图表 · 记忆保持率** | ✅ | ✅ |
| | **分析图表 · 牌组画像、卡片数量、标签难度、负荷预测、学习校准、复习时机** | 🔒 | ✅ |
| **考试题组** | 题库系统、模拟考试 | 🔒 | ✅ |
| | 文档测验（从 Markdown 解析题目开考，可写回统计） | ✅ | ✅ |
| | **分析图表 · EWMA 掌握度曲线**（含历史平均、目标线、置信度） | 🔒 | ✅ |
| **管理视图** | 表格视图（筛选、排序、批量管理） | ✅ | ✅ |
| | 网格视图、瀑布流布局、看板视图、时间线视图（完整筛选、分组、排序）‡ | 🔒 | ✅ |
| | Markdown 牌组视图（`weave-decks` 代码块嵌入） | 🔒 | ✅ |
| | 当前文档筛选（侧边栏随活动笔记实时筛选） | 🔒 | ✅ |
| | 关联卡片（同源 / 同笔记 / 关联网络） | 🔒 | ✅ |
| **AI 与导入** | AI 制卡、AI 智能助手（自备 API，费用自理） | ✅ | ✅ |
| | 解析预览导入 | ✅ | ✅ |
| | 卡片解析配置（分隔符号与正则模板，供解析预览使用） | 🔒 | ✅ |
| | CSV 导入 | ✅ | ✅ |
| | APKG 导入 / 导出（离线迁移，非实时同步） | ✅ | ✅ |
| | 数据备份与恢复（Vault 备份槽、整库导出） | ✅ | ✅ |
| **公开 API** | `getOfficialAPI()`（WeaveDomainAPI，供第三方 Obsidian 插件集成） | ✅ | ✅ |
| | 记忆卡片：新建 `createCard`、批量导入 `importCards`、更新 / 删除、列出 / 查询 | ✅ | ✅ |
| | 记忆牌组：新建 `createDeck`、查找 / 列出 / 更新 / 删除 | ✅ | ✅ |
| | 批量移动 `moveCards`、只改正文 `updateCardContent`（保留 FSRS 复习进度） | ✅ | ✅ |
| | 考试题组：新建 `createQuestionBank`、引用加入 `addCardsToQuestionBank`、批量出卷 `importExamQuestions` | 🔒 | ✅ |
| | 能力探测 `getInfo()`（`apiVersion` 与 `capabilities` 字段） | ✅ | ✅ |
| **阅读工作流** | 渐进性阅读工作流入口（Weave 体系；可安装独立插件） | 🔒 | ✅ |


> 图例：✅ 已包含 · 🔒 需启用高级支持
>
> † EPUB CFI 溯源需安装 [Weave EPUB Reader](https://github.com/zhuzhige123/obsidian-weave-reader)。
>
> ‡ 未激活时，**卡片管理页**的网格视图、**牌组学习页**的看板视图可能**限时开放**；**移动端卡片管理页**的时间线视图在基础体验中可用。具体以插件内标注为准。

- **启用高级支持**：在插件设置中激活（邮箱绑定校验）；已激活 **Weave EPUB Reader** 高级支持时，可按产品规则继承授权。
- **买断制**：一次激活、长期使用（具体以仓库内许可条款为准），非强制订阅。

### 公开 API（第三方集成）

Weave 向其它 Obsidian 插件开放 **WeaveDomainAPI**，通过 `app.plugins.plugins["weave"].getOfficialAPI()` 获取。请通过 API 写入卡片与牌组，**不要**直接改写 Vault 内的 `.wdeck` / `.qbank` 文件。

常用能力包括：

- **记忆卡片**：`createCard` 新建单卡；`importCards` 批量导入（支持 `ensureDeck` 自动建组、去重跳过）
- **记忆牌组**：`createDeck` 新建牌组；`listDecks` / `findDeck` 查询；`updateDeck` / `deleteDeck` 维护
- **批量操作**：`moveCards` 批量移动（保留复习进度）；`deleteCards` 批量删除；`updateCardContent` 只改正文
- **考试题组**：`createQuestionBank` 新建题组；`addCardsToQuestionBank` 引用已有卡片；`importExamQuestions` 批量写入记忆牌组并挂到题组（适合 AI 出卷）
- **集成前探测**：`getInfo()` 返回 `apiVersion` 与 `capabilities`，避免假设未发布字段

集成说明见开发文档 `docs/WEAVE_OFFICIAL_API_GUIDE.md`（类型真源：`src/services/weave-domain/types.ts`）。

### 生态协同（可选）

除上表所列 Deck 本体能力外，还可与系列内其它插件及社区工具协作，扩展阅读与制卡来源。


| 插件 / 能力 | 作用 |
| --- | --- |
| [Weave EPUB Reader](https://github.com/zhuzhige123/obsidian-weave-reader) | 沉浸式阅读、摘录制卡、书籍锚点回跳 |
| 增量阅读（Weave 体系） | 阅读队列与章节排期 |
| PDF++、Excalidraw、Media Extended、Mind Map 等 | 把 PDF / 绘图 / 视频时间戳 / 脑图接入同一套复习闭环 |

### 安装

#### 方式一：社区插件（推荐）

1. 打开 **设置 → 社区插件 → 浏览**（必要时关闭「限制模式」）
2. 搜索 **Weave Deck**，安装并启用

#### 方式二：手动安装

1. 将 `main.js`、`manifest.json`、`styles.css` 复制到 `.obsidian/plugins/weave/`
2. 若需 **Legacy APKG 导入**，另附 `sql-wasm.wasm`
3. 重启 Obsidian 并启用插件

### 快速开始

1. 从侧边栏打开 Weave Deck 视图，初始化卡片库（`weave/memory/` 等）
2. 可选：配置 OpenAI 兼容 API，用于 AI 制卡
3. 从 Markdown 或 EPUB 摘录，创建记忆卡片并开始复习
4. 可选：把卡片管理放到侧边栏，开启「关联当前活动文档」，边写笔记边看已沉淀的卡片

### 数据与同步

**建议同步（位于 Vault）**：`weave/memory/`（`.wdeck`）、`weave/question-bank/`（`.qbank`）、相关 Markdown 与附件。

**通常不需跨设备同步**：`.obsidian/plugins/weave/` 下的缓存与本地状态。多端学习请优先同步 Vault 内容。

⚠️ 除非你清楚影响，请勿批量重命名或删除 `.wdeck` / `.qbank` 文件。

### 隐私与网络

- 学习数据**默认保存在本地 Vault**，不会主动上传库内容。
- **高级支持激活**可能访问许可证服务，详见仓库隐私说明。
- **AI 功能**调用你自行配置的第三方 API；**APKG** 用于离线导入旧卡包 / 导出牌组，不依赖本机 Anki 常驻连接。

### 常见问题

#### 1. 与 EPUB 阅读器、增量阅读的关系？

**Weave 可独立使用**：在 Markdown 中制卡、FSRS 复习、题库等不强制安装其它插件。安装 [Weave EPUB Reader](https://github.com/zhuzhige123/obsidian-weave-reader) 后，可在书中摘录、制卡并带书籍锚点跳回原文；增量阅读负责阅读队列与章节排期。阅读器高级支持可与 Weave 授权联动。三者**分工协作**，可按需安装。

#### 2. 卡片与摘录能否全平台同步？

**支持。** 卡片库与相关笔记在 Vault 内，会随 Obsidian Sync、iCloud、网盘同步 Vault 等方式在桌面与移动端保持一致（见 [数据与同步](#数据与同步)）。

#### 3. 是否支持导出 / 备份数据？

**支持。** 可将牌组导出为 **APKG**；`.wdeck`、`.qbank` 及关联 Markdown 均在库内，也可自行复制或通过插件数据管理备份。**数据完全本地化**，由你掌控备份策略。

#### 4. 为何提供高级支持？

用于**支持持续开发**，让团队能长期投入、打磨复习与测验细节。**基础体验免费**，已覆盖 FSRS 复习、多形态卡片、溯源、AI 制卡（自备 API）、表格视图、文档测验、记忆牌组「记忆保持率」分析、公开 API 建卡/建组/批量导入、APKG 互通等核心学习闭环；其余记忆牌组分析图表、网格 / 瀑布流 / 看板 / 时间线视图、涌现牌组、考试题组与题组分析、Markdown 嵌入、渐进式挖空等可按需启用高级支持。

#### 5. 是订阅还是买断？

**买断制**（一次激活、长期使用），非按月订阅。

#### 6. 为何目前仅支持中英？

**Weave 功能模块多、界面文案量大**，完整本地化需要持续投入。当前优先保证**简体中文**与**英文**的质量与更新及时性；其它界面语言将**逐步补充**，感谢理解。

### 许可证与作者

源码基于 [GPL-3.0-or-later](LICENSE) 发布。

- **Issues**：[GitHub Issues](https://github.com/zhuzhige123/obsidian---Weave/issues)
- **授权联系**：[tutaoyuan8@outlook.com](mailto:tutaoyuan8@outlook.com)

### 开发

环境要求：Node.js 16+、npm

```bash
npm install
npm run dev
npm run build
```

---

## English Documentation

### Introduction

The Obsidian Weave plugin series includes **exactly three** plugins: Weave Deck, Weave EPUB Reader, and Weave Incremental Reading. The series is built entirely for Obsidian and designed for long-term learning inside Obsidian.

Weave Deck is the core plugin of the series—with the richest feature set and the widest coverage. It helps you turn Obsidian Markdown into memory cards stored in separate deck files, so source notes stay clean while cards stay centrally managed. Source-trace links jump back to the original context, and related filters show which important memory cards and excerpt cards were created from a given document. You can also assemble question cards into exams for testing—so you can consolidate memory and verify whether you have truly mastered the material.

Minimum Obsidian version: **1.7.0**

Built around the learning loop **excerpt → cards → FSRS6 review → assessment → trace & reorganize**: cards are stored separately from source notes, so you can still jump back to original context during review and testing.

### Essential experience and Premium support

Aligned with the in-plugin activation prompt: **essential experience stays free**; **Premium support** is optional buy-once. The table below lists current capabilities by category (matching the in-plugin “Essential / Premium” presentation). **Analytics charts** are split by target: **memory decks** (`.wdeck`, FSRS review) and **exam question banks** (`.qbank`, practice and testing)—they are not mixed.


| Category | Capability | Essential | Premium |
| --- | --- | --- | --- |
| **Platform** | All platforms (Windows / macOS / Linux / iOS / Android) | ✅ | ✅ |
| **Study & cards** | **FSRS6** spaced review, deck study, undo rating, sibling dispersion | ✅ | ✅ |
| | Q&A / cloze / fill-in / multiple choice (single / multi) | ✅ | ✅ |
| | Fill-in input mode (type answers while studying, instant grading) | ✅ | ✅ |
| | Review excerpt notes and recall memory cards | ✅ | ✅ |
| | Progressive cloze | 🔒 | ✅ |
| | Image masks (image cloze and cover practice) | 🔒 | ✅ |
| **Creation & trace** | Native Obsidian card editing (Markdown / math / community renderers) | ✅ | ✅ |
| | Create cards from the active document with trace links back to source | ✅ | ✅ |
| | View source and study source info bar | ✅ | ✅ |
| | Multi-source tracing (Markdown block refs, Canvas nodes, EPUB CFI†) | ✅ | ✅ |
| **Memory decks** | Formal decks and reference-based decks (cards can belong to multiple decks) | ✅ | ✅ |
| | Emergent decks (auto-clustered from tags and rules) | 🔒 | ✅ |
| | Deck memory-rate badges and deck background images | 🔒 | ✅ |
| | **Analytics · memory retention** | ✅ | ✅ |
| | **Analytics · deck profile, card quantity, tag difficulty, load forecast, learning calibration, review timing** | 🔒 | ✅ |
| **Exam question banks** | Question bank system and mock exams | 🔒 | ✅ |
| | Document quiz (parse questions from Markdown, run a quiz, optionally write stats back) | ✅ | ✅ |
| | **Analytics · EWMA mastery curve** (historical average, target line, confidence) | 🔒 | ✅ |
| **Management views** | Table view (filter, sort, bulk manage) | ✅ | ✅ |
| | Grid, masonry, Kanban, and Timeline views (full filter, group, sort)‡ | 🔒 | ✅ |
| | Markdown deck views (`weave-decks` code block embeds) | 🔒 | ✅ |
| | Active-document filter (sidebar updates with the active note) | 🔒 | ✅ |
| | Related cards (same source / same note / relation network) | 🔒 | ✅ |
| **AI & import** | AI card creation and AI assistant (bring your own API) | ✅ | ✅ |
| | Parse-preview import | ✅ | ✅ |
| | Card parsing configuration (separators and regex templates for parse preview) | 🔒 | ✅ |
| | CSV import | ✅ | ✅ |
| | APKG import / export (offline migration, not live sync) | ✅ | ✅ |
| | Backup and restore (vault backup slots and full-library export) | ✅ | ✅ |
| **Public API** | `getOfficialAPI()` (WeaveDomainAPI for third-party Obsidian plugins) | ✅ | ✅ |
| | Memory cards: `createCard`, bulk `importCards`, update / delete, list / query | ✅ | ✅ |
| | Memory decks: `createDeck`, find / list / update / delete | ✅ | ✅ |
| | Bulk `moveCards`, content-only `updateCardContent` (keeps FSRS progress) | ✅ | ✅ |
| | Exam banks: `createQuestionBank`, `addCardsToQuestionBank`, bulk `importExamQuestions` | 🔒 | ✅ |
| | Capability probe `getInfo()` (`apiVersion` and `capabilities`) | ✅ | ✅ |
| **Reading workflow** | Incremental reading workflow entry (Weave family; optional standalone plugin) | 🔒 | ✅ |


> Legend: ✅ included · 🔒 requires Premium support
>
> † EPUB CFI tracing requires [Weave EPUB Reader](https://github.com/zhuzhige123/obsidian-weave-reader).
>
> ‡ Without activation, **grid view** on the card-management page and **Kanban view** on the deck-study page may be **limited-time access**; **Timeline view** on mobile card management is available in the essential experience. See in-plugin labels for details.

- **Enable Premium support**: Activate in settings (email binding). EPUB Reader Premium may inherit per product rules.
- **Buy-once** licensing, not a forced subscription.

### Public API (third-party integration)

Weave exposes **WeaveDomainAPI** to other Obsidian plugins via `app.plugins.plugins["weave"].getOfficialAPI()`. Write cards and decks through the API—**do not** edit `.wdeck` / `.qbank` files in the vault directly.

Common capabilities:

- **Memory cards**: `createCard` for a single card; `importCards` for bulk import (`ensureDeck` auto-create, optional duplicate skip)
- **Memory decks**: `createDeck` to create; `listDecks` / `findDeck` to query; `updateDeck` / `deleteDeck` to maintain
- **Bulk operations**: `moveCards` (keeps review progress); `deleteCards`; `updateCardContent` for content-only edits
- **Exam question banks**: `createQuestionBank`; `addCardsToQuestionBank` to reference existing cards; `importExamQuestions` to bulk-write memory cards and attach them to a bank (great for AI-generated exams)
- **Before integrating**: `getInfo()` returns `apiVersion` and `capabilities`—do not assume unpublished fields

See `docs/WEAVE_OFFICIAL_API_GUIDE.md` in the development repository (type source: `src/services/weave-domain/types.ts`).

### Ecosystem (optional)

Beyond Deck itself, you can extend reading and card-creation sources with other plugins in the series and the community.


| Plugin / capability | Role |
| --- | --- |
| [Weave EPUB Reader](https://github.com/zhuzhige123/obsidian-weave-reader) | Immersive reading, excerpts, book-anchor jumps |
| Incremental Reading (Weave family) | Reading queue and chapter scheduling |
| PDF++, Excalidraw, Media Extended, Mind Map, etc. | Bring PDFs, drawings, video timestamps, and mind maps into the same review loop |

### Installation

#### Option 1: Community plugins (recommended)

1. **Settings → Community plugins → Browse** (disable Restricted mode if needed)
2. Search for **Weave Deck**, install, and enable

#### Option 2: Manual installation

1. Copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/weave/`
2. Add `sql-wasm.wasm` if you need **Legacy APKG import**
3. Restart Obsidian and enable the plugin

### Quick start

1. Open the Weave Deck view and initialize the card library (`weave/memory/`, etc.)
2. Optional: configure an OpenAI-compatible API for AI card creation
3. Excerpt from Markdown or EPUB, create memory cards, and start reviewing
4. Optional: put card management in the sidebar and enable “filter by active document”

### Data and sync

**Recommended sync (in vault)**: `weave/memory/` (`.wdeck`), `weave/question-bank/` (`.qbank`), related Markdown and attachments.

**Usually local**: cache under `.obsidian/plugins/weave/`. Prefer syncing vault content across devices.

⚠️ Do not bulk-rename or delete `.wdeck` / `.qbank` files unless you understand the impact.

### Privacy and network

- Learning data **stays in your local vault** by default and is not uploaded.
- **Premium support activation** may contact the license service; see the privacy notes in this repository.
- **AI** uses your own third-party API; **APKG** is for offline legacy import / deck export (no always-on Anki connection).

### FAQ

#### 1. How does this relate to the EPUB reader and Incremental Reading?

**Weave works standalone** for Markdown cards, FSRS review, and question banks. With [Weave EPUB Reader](https://github.com/zhuzhige123/obsidian-weave-reader), you can excerpt in books and jump back via book anchors; Incremental Reading handles reading queues and chapter scheduling. Licensing may be shared per product rules. They are **complementary**, not hard dependencies.

#### 2. Can cards and excerpts sync across platforms?

**Yes.** Decks and notes in the vault follow your Obsidian sync setup (see [Data and sync](#data-and-sync)).

#### 3. Can I export or back up data?

**Yes.** Export decks as **APKG**; `.wdeck`, `.qbank`, and related Markdown also live in the vault under your control. **Data is fully local** unless you use networked features you configure.

#### 4. Why is Premium support paid?

It **funds ongoing development** so the team can keep polishing review and assessment details. The **essential experience is free**—FSRS review, multiple card types, traceability, AI card creation (your API), table view, document quiz, memory-deck retention analytics, public API create/import/bulk flows, APKG interchange, and the core learning loop. Enable Premium for the remaining memory-deck analytics, grid / masonry / Kanban / Timeline views, emergent decks, exam banks and bank analytics, Markdown embeds, progressive cloze, and more.

#### 5. Subscription or buy-once?

**Buy-once** activation, not a monthly subscription.

#### 6. Why are only Chinese and English supported for now?

**Weave has a large feature surface and a heavy UI translation load**—full localization takes ongoing effort. We currently prioritize **Simplified Chinese** and **English** for quality and timely updates; **additional interface languages will be added gradually**. Thank you for your understanding.

### License and author

Released under [GPL-3.0-or-later](LICENSE).

- **Issues**: [GitHub Issues](https://github.com/zhuzhige123/obsidian---Weave/issues)
- **Licensing**: [tutaoyuan8@outlook.com](mailto:tutaoyuan8@outlook.com)

### Development

Requires Node.js 16+ and npm:

```bash
npm install
npm run dev
npm run build
```
