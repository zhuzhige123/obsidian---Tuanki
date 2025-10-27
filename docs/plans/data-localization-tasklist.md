# Tuanki 数据本地化实施任务清单（完整版）

本文档是《数据本地化架构（提案 v1）》的执行清单，面向开发/测试/文档，按里程碑分解任务、产出物与验收标准。

---

## 总览（目标与边界）
- 目标：实现牌组级分片存储、会话月分片、原子写入与备份、公开会话读取API、统计读取窗口化；兼容迁移，保持单文件构建。
- 不做：远端同步/多设备冲突解决策略（依赖 Obsidian 自身同步），数据库引擎替换（如 SQLite）。

---

## M1：存储层基础改造（核心 API 与可靠性）
- 存储 API
  - [ ] 新增 `getStudySessions(range?: { since?: Date; until?: Date })`
  - [ ] 新增 `getDeckCards(deckId: string)`、`saveDeckCards(deckId: string, cards: Card[])`
  - [ ] 改造 `getCards(query?)`：优先走分片；未指明 deckId 时聚合遍历 `decks.json`
- 可靠性
  - [ ] 放宽 `hydrateDates`：兼容无毫秒/时区 ISO 格式
  - [ ] 分片写入原子性：`.tmp` 写入、`fsync`、`rename` 覆盖（能做到的情况下）
  - [ ] 牌组写入队列：同牌组写操作串行化
- Deck 索引
  - [ ] `decks/decks.json` 更新 `stats.cardCount`、`modified`
  - [ ] 工具函数：`updateDeckIndexStats(deckId, count)`
- 验收标准
  - [ ] 单元测试：`hydrateDates` 多种 ISO 样例解析正确
  - [ ] 5k 卡分组写入无冲突、数据一致
  - [ ] `getCards` 在 `deckId` 过滤与全量聚合两路径均正常

---

## M2：迁移工具与备份
- 迁移
  - [ ] 一次性迁移 `migrateFromMonolithCards()`：从 `cards/cards.json` 切分到 `decks/<deckId>/cards.json`
  - [ ] 迁移后旧文件重命名 `.bak`（可配置保留/删除）
  - [ ] 迁移进度与结果上报（卡片数、牌组数）
- 备份
  - [ ] 迁移前创建快照 `backups/<timestamp>/...`
  - [ ] 备份保留策略（最近 N 份，可配置）
- UI/命令
  - [ ] 命令面板：执行迁移 & 展示结果
  - [ ] 设置页：显隐迁移入口、备份保留数量设置
- 验收标准
  - [ ] 1/5/10k 卡迁移完成时间在预期范围内，无数据丢失
  - [ ] 断点/异常后可用备份回滚

---

## M3：学习会话月分片与统计改造
- 会话存储
  - [ ] `learning/sessions/YYYY-MM.json` 写入管道（新增/合并）
  - [ ] 可选索引 `learning/study-index.json`（记录可用月份、范围）
- 统计服务 `AnalyticsService`
  - [ ] 改造为使用 `getStudySessions(range)` 读取窗口期数据
  - [ ] （可选）部分统计按 deckId 调用 `getDeckCards(deckId)` 以减少 IO
- 仪表盘联动
  - [ ] 过滤器（时间范围/牌组）驱动统计仅读窗口 → 已实现的四图 + 新图（间隔增长/牌组对比）联动
- 验收标准
  - [ ] 近7/30/90/今年 切换响应 < 200ms（5k 卡/几月 sessions）
  - [ ] 牌组筛选只读相关分片，CPU/IO 开销可控

---

## M4：媒体导入/导出与引用管理
- 媒体归档
  - [ ] 规范：媒体随牌组存放于 `decks/<deckId>/media/{audio,images}`
  - [ ] 卡片 `customFields.attachments` 使用相对路径
- 导入
  - [ ] 解析媒体清单（或扫描目录），复制到目标目录，重写引用路径
  - [ ] 大牌组导入（几千媒体）进度反馈与错误收集
- 导出
  - [ ] 牌组级导出：`cards.json + media/` 打包
- 验收标准
  - [ ] 导入导出往返后引用完整有效
  - [ ] 重复导入去重策略明确（按文件名/哈希）

---

## M5：扩展与优化（按需）
- 时间分片（卡片）：
  - [ ] 当 `decks/<deckId>/cards.json` 超阈值（> 10–20MB 或 > 1–2 万卡）时，按年分片 `cards-YYYY.json`
  - [ ] 读写逻辑自动感知并合并
- NDJSON 评估：
  - [ ] 大规模追加/合并性能评估，必要时引入（保持单文件构建）
- 统计性能
  - [ ] 预计算索引与缓存（内存/文件）
- 验收标准
  - [ ] 50k 卡库下统计/管理可接受（具体阈值通过实测制定）

---

## 跨里程碑任务（持续）
- 文档
  - [ ] 更新《数据本地化架构》随实现同步
  - [ ] 使用手册：导入/迁移/导出/备份恢复指引
- 测试
  - [ ] 单元测试：存储、解析、迁移、原子写入
  - [ ] 集成测试：导入→学习→统计→导出
  - [ ] 性能测试：不同规模与过滤场景
- 质量与可观测
  - [ ] 日志与错误提示（用户可理解）
  - [ ] 验证数据一致性（计数、引用资源存在性）

---

## 具体开发清单（按文件）
- `src/data/storage.ts`
  - [ ] `hydrateDates` 放宽 ISO 解析
  - [ ] `getStudySessions(range)`（新增）
  - [ ] `getDeckCards/saveDeckCards`（新增，含原子写与写队列）
  - [ ] `getCards` 聚合分片/回退旧结构
  - [ ] `migrateFromMonolithCards`（新增）
  - [ ] `updateDeckIndexStats`（新增）
- `src/data/analytics.ts`
  - [ ] 改为依赖 `getStudySessions`、`getDeckCards`（必要场景），添加 deck 过滤
- `src/components/pages/AnalyticsDashboard.svelte`
  - [ ] 过滤器联动：时间/牌组 → 统计刷新（已初步实现）
  - [ ] 导出 CSV（已初步实现）、悬浮提示与键盘切换（待补）
- `src/components/settings/SettingsTab.ts`
  - [ ] 迁移入口与备份设置项
- `README.md` / `docs/plans/*.md`
  - [ ] 文档同步更新

---

## 验收（Definition of Done）
- 功能：按 M1–M3 必要功能全部可用，M4/M5 视规模按需迭代
- 性能：在 5k–10k 卡规模下，常用操作（筛选/统计/学习读写）响应 < 200–500ms
- 可靠性：写入原子、备份可回滚、迁移可重复执行且幂等
- 文档：开发与使用文档完整，迁移与恢复流程可操作