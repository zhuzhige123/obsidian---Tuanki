# Tuanki 数据本地化架构（提案 v1）

本文档定义插件在本地（Obsidian Vault）中的数据落地方案，覆盖目录结构、数据模型、读写 API、性能与可靠性、媒体管理、备份与迁移、统计/分析、测试与落地计划。后续开发应以本方案为准逐步落地。

## 1. 设计目标
- 数据完全本地化：无需远端依赖，可被 Obsidian 同步/备份纳管
- 可扩展：单库 1–5 万卡可流畅读写、可滚动扩容
- 可维护：目录清晰、文件粒度适中，便于分模块导入导出
- 可恢复：强原子性写入、可回滚、自动备份、明确迁移路径
- 可观测：结构化、可校验；统计/分析易于派生

## 2. 顶层目录结构（示例）
```
<VAULT>/tuanki/
  decks/
    decks.json                  # 牌组索引（列表、计数、mtime）
    <deckId>/
      cards.json                # 该牌组全部卡片数组（分片策略见 §5）
      media/
        audio/*                 # 牌组内音频
        images/*                # 牌组内图片
  learning/
    sessions/
      2025-01.json             # 会话分片（月）
      2025-02.json
    study-index.json           # 可选：范围/统计索引（加速窗口查询）
  profile/
    user-profile.json          # 用户设置
  backups/
    2025-02-10T12-34-56.789Z/  # 备份快照（同结构）
      ...
```

说明：
- 牌组级分片：每个牌组一个 `cards.json`（数组），避免巨型全局文件。
- 学习会话月分片：`learning/sessions/YYYY-MM.json`，避免无限增长。
- 媒体与卡片同牌组目录，便于导入导出与移动。

## 3. 文件格式与 Schema
- 通用元字段：`_schemaVersion`（文件级）、`_generatedAt`（可选）
- decks/decks.json
```json
{
  "_schemaVersion": "1.0.0",
  "decks": [
    { "id": "deck_123", "name": "英语四级", "description": "", "category": "language",
      "created": "2025-02-01T10:00:00.000Z", "modified": "2025-02-10T08:00:00.000Z",
      "stats": { "cardCount": 3200, "mediaSizeBytes": 73400320 } }
  ]
}
```
- decks/<deckId>/cards.json（数组）
```json
{
  "_schemaVersion": "1.0.0",
  "deckId": "deck_123",
  "cards": [
    {
      "id": "card_001",
      "deckId": "deck_123",
      "front": "apple",
      "back": "苹果",
      "type": "basic",
      "tags": ["CET4"],
      "priority": 2,
      "created": "2025-02-01T10:00:00.000Z",
      "modified": "2025-02-10T08:00:00.000Z",
      "customFields": {
        "notes": "例句...",
        "attachments": ["media/audio/a001.mp3", "media/images/a001.jpg"]
      },
      "fsrs": {
        "due": "2025-02-15T00:00:00.000Z",
        "stability": 3.4,
        "difficulty": 6.8,
        "elapsedDays": 2,
        "scheduledDays": 4,
        "reps": 3,
        "lapses": 0,
        "state": 2,
        "lastReview": "2025-02-11T12:00:00.000Z",
        "retrievability": 0.86
      },
      "reviewHistory": [
        { "rating": 3, "state": 2, "due": "2025-02-15T00:00:00.000Z",
          "stability": 3.4, "difficulty": 6.8, "elapsedDays": 2, "lastElapsedDays": 1,
          "scheduledDays": 4, "review": "2025-02-11T12:00:00.000Z" }
      ],
      "stats": { "totalReviews": 3, "totalTime": 120, "averageTime": 40, "memoryRate": 0.87 }
    }
  ]
}
```
- learning/sessions/YYYY-MM.json
```json
{
  "_schemaVersion": "1.0.0",
  "yearMonth": "2025-02",
  "sessions": [
    { "id": "sess_abc", "deckId": "deck_123",
      "startTime": "2025-02-11T12:00:00.000Z", "endTime": "2025-02-11T12:20:00.000Z",
      "cardsReviewed": 60, "newCardsLearned": 10, "correctAnswers": 48, "totalTime": 1200,
      "cardReviews": [ { "cardId":"card_001", "rating":3, "responseTime": 3.5, "timestamp":"2025-02-11T12:01:02.000Z" } ] }
  ]
}
```

> 备注：所有 Date 用 ISO 字符串存储；加载时统一 hydrate。

## 4. 读写与 API（对外不变、内部路由）
- `getCards(query?)`
  - 若 `query.deckId` 指定：只读 `decks/<deckId>/cards.json`
  - 未指定：遍历 `decks.json` 列表，按需逐个加载（可分页/限流）
- `saveCard(card)`
  - 路由至 `decks/<deckId>/cards.json`，内存修改→写临时文件→原子替换
- `deleteDeck(deckId)`
  - 删除 `decks/<deckId>/` 整个目录（含媒体与 cards.json），并更新 `decks.json`
- `getStudySessions(range?)`
  - 替代外部直接读私有文件：根据时间范围只读窗口期分片
- 统计/分析 `AnalyticsService`
  - 使用公开 API（`getCards/getStudySessions`），禁止访问存储私有方法

## 5. 分片策略与扩展
- 牌组分片：每组一个 `cards.json`（首选）
  - 阈值：当该文件 > ~10–20MB 或卡片数 > ~1–2 万，可“按时间再分片”
    - `decks/<deckId>/cards-2025.json`、`cards-2026.json` …（读取时合并）
- 学习会话分片：按月（固定）
- 未来可选：NDJSON（行级追加）或 SQLite（仅在极限规模才考虑）

## 6. 媒体管理
- 归属：所有媒体随牌组目录存放，卡片 `customFields.attachments` 记录相对路径
- 导入：解析清单（或扫描目录）→ 复制至 `media/` → 重写引用路径
- 导出：打包 `cards.json + media/`

## 7. 可靠性与原子性
- 写入流程：`cards.json.tmp` → `fsync` → `rename` 覆盖 → 写入 `decks.json` 的统计信息
- 备份：
  - 自动：导入前、升级前、每日首次写入（可配置）
  - 保留：最近 N 份（默认 10）
- 回滚：任一写失败→回退到备份快照

## 8. 校验与迁移
- 运行时校验（轻量）：
  - 加载后验证关键字段存在与类型范围（如 `fsrs.difficulty ∈ [0,10]`）
  - 日期统一 `new Date()` 验证可用
- 文件级版本：`_schemaVersion`，在 `readJsonFile` 后执行最小迁移（如字段改名、默认值修补）
- 迁移脚本（一次性）：
  - 从旧 `cards/cards.json` 切分到 `decks/<deckId>/cards.json`
  - 重建 `decks.json` 计数与媒体体积

## 9. 性能与并发
- 仅按需加载（deckId/时间窗筛选）
- 分片写入减少冲突；同一牌组写入串行化（简易写锁或队列）
- 统计默认读窗口数据；全量统计分步聚合

## 10. 构建与约束
- 禁用代码切割：Vite `inlineDynamicImports: true`、`cssCodeSplit: false`（已配置）
- 组件懒初始化（进入视口再渲染）而非代码分割

## 11. 安全与隐私
- 默认本地存储；尊重 Obsidian 同步策略
- 文本与媒体按原样存放，不做额外收集

## 12. 测试计划（要点）
- 小/中/大规模数据（1k/10k/50k 卡）的读取、筛选、统计性能
- 原子写入中断恢复（模拟崩溃）
- 备份创建与修剪
- 导入/导出一致性（含媒体）
- 迁移脚本幂等性

## 13. 落地路线图
- M1：存储层改造（牌组分片 & 公共 `getStudySessions`）、hydrate 放宽、schema 版本
- M2：迁移脚本与一次性迁移工具、备份策略完善
- M3：学习会话月分片落地、统计读取走窗口与 deck 过滤
- M4：媒体导入/导出管道与 UI 托盘
- M5：大规模数据优化（时间分片/NDJSON 可选）

---

### 附：关键 API（草案）
```ts
// AnkiDataStorage 公开接口补充
getStudySessions(range?: { since?: Date; until?: Date }): Promise<StudySession[]>;
getDeckCards(deckId: string): Promise<Card[]>; // 仅读一个牌组
saveDeckCards(deckId: string, cards: Card[]): Promise<void>; // 原子写回

// 迁移
migrateFromMonolithCards(): Promise<{ movedDecks: number; movedCards: number }>;
```