# 父子卡片功能设计草案

> **版本**: v0.1 草案  
> **日期**: 2025-10-26  
> **状态**: 设计阶段  
> **目标版本**: Tuanki v0.9.0

---

## 📋 目录

- [一、功能概述](#一功能概述)
- [二、核心概念定义](#二核心概念定义)
- [三、理论依据](#三理论依据)
- [四、牌组结构设计](#四牌组结构设计)
- [五、核心功能流程](#五核心功能流程)
- [六、界面设计](#六界面设计)
- [七、技术要点](#七技术要点)
- [八、数据结构变更](#八数据结构变更)
- [九、实施计划](#九实施计划)

---

## 一、功能概述

### 1.1 设计目标

在现有的Tuanki卡片系统基础上，新增**父子卡片层级系统**，支持将完整的知识点拆分为符合**最小信息原则**的多个子卡片，以提高记忆效率。

### 1.2 核心特性

- ✅ **AI智能拆分**：利用已集成的AI服务，自动将复杂知识点拆分为最小信息单元
- ✅ **牌组自动配对**：每个父卡片牌组自动对应一个子卡片牌组
- ✅ **层级隔离**：父卡片与子卡片不能存在于同一牌组中
- ✅ **双向链接**：支持卡片间的@语法关联，自动维护反向链接
- ✅ **源信息继承**：子卡片完全继承父卡片的Obsidian来源文档和块链接
- ✅ **灵活转换**：支持子卡片升级为父卡片，父卡片降级为子卡片

### 1.3 使用场景

**场景1：学习完整知识点**
```
用户从Obsidian笔记中创建了一张关于"现在完成时"的综合卡片，
包含定义、用法、例句等多个知识点。

通过AI拆分功能：
父卡片（综合）→ 子卡片1（定义）+ 子卡片2（构成）+ 子卡片3（用法）

复习时：
- 父卡片作为"概览卡片"偶尔复习，保持整体理解
- 子卡片作为"细节卡片"频繁复习，强化记忆
```

**场景2：知识体系构建**
```
用户将一本书的章节摘要制作成父卡片，
然后针对每个重点概念拆分为子卡片。

形成知识树：
第一章-父卡片
├── 概念A-子卡片
├── 概念B-子卡片
└── 概念C-子卡片

通过@语法建立横向联系：
概念A-子卡片中引用 @[概念B-子卡片]，形成知识网络。
```

---

## 二、核心概念定义

### 2.1 父卡片（Parent Card）

**定义**：包含完整知识点的卡片，可以被拆分为多个子卡片。

**特征**：
- 内容相对完整和全面
- 可以独立理解和复习
- 可以有0个或多个子卡片
- 存储在"父卡片牌组"中

**元数据标记**：
```typescript
metadata.cardRelation.isParent = true
metadata.cardRelation.childCardIds = [子卡片UUID列表]
```

### 2.2 子卡片（Child Card）

**定义**：从父卡片拆分出来的、符合最小信息原则的独立卡片。

**特征**：
- 内容精简，聚焦单一知识点
- 完全继承父卡片的源文档信息
- 有且仅有一个父卡片
- 存储在"子卡片牌组"中

**元数据标记**：
```typescript
parentCardId = "父卡片UUID"
metadata.cardRelation.isParent = false
metadata.cardRelation.derivationMetadata = {
  method: 'ai-split' | 'manual',
  splitTimestamp: "...",
  ...
}
```

### 2.3 父子牌组配对

**定义**：每个父卡片牌组自动配对一个子卡片牌组，用于存储该父牌组中卡片拆分的所有子卡片。

**命名规则**：
```
父卡片牌组名称：英语学习-父卡片
对应子卡片牌组：英语学习-子卡片

父卡片牌组名称：历史知识点-父卡片
对应子卡片牌组：历史知识点-子卡片
```

**关系示意**：
```
牌组目录结构：
📁 语言学习（目录层级的父牌组）
  📦 英语语法-父卡片（deckType: 'parent-deck'）
    🃏 现在完成时【父卡片】
    🃏 过去完成时【父卡片】
  
  📦 英语语法-子卡片（deckType: 'child-deck'）
    🃏 现在完成时-定义【子卡片】
    🃏 现在完成时-用法【子卡片】
    🃏 现在完成时-例句【子卡片】
    🃏 过去完成时-定义【子卡片】
    🃏 过去完成时-例句【子卡片】
```

**注意**：这里的"父子配对"与Obsidian的目录层级（`parentId`字段）是**两个独立的维度**，不会冲突。

---

## 三、理论依据

### 3.1 最小信息原则（Minimum Information Principle）

**来源**：SuperMemo创始人Piotr Woźniak的"20 Rules of Formulating Knowledge"

**核心论点**：
> "The material you learn must be formulated in the simplest way possible. Simplicity does not have to imply losing information and skipping the difficult part."

学习材料应该以最简单的方式呈现。简化不意味着丢失信息，而是通过拆解降低单次记忆负荷。

**应用到本设计**：
- 父卡片 = 完整知识点（便于理解上下文）
- 子卡片 = 最小信息单元（便于记忆和复习）

### 3.2 短期记忆容量限制（Miller's Law, 1956）

**研究结论**：人类短期记忆容量为 **7±2个信息单元**

**应用启示**：
- 单张卡片应包含3-5个关键信息点以内
- AI拆分时建议生成3-7张子卡片

### 3.3 卡片盒笔记法（Zettelkasten Method）

**核心原则**：**原子化笔记**（Atomic Notes）- 每张卡片只包含一个概念

**与本设计的契合**：
- 父卡片 = 主题笔记（包含多个概念）
- 子卡片 = 原子化笔记（单一概念）
- @语法链接 = 建立知识网络

### 3.4 认知负荷理论（Cognitive Load Theory）

**核心观点**：学习材料应避免产生过多的外在认知负荷

**设计体现**：
- 父子卡片分别存储在不同牌组 → 避免复习时的信息重复干扰
- 子卡片内容精简 → 降低单次复习的认知负荷

---

## 四、牌组结构设计

### 4.1 牌组类型扩展

在现有`DeckType`枚举基础上新增两种类型：

```typescript
type DeckType = 
  | 'mixed'           // 混合牌组（现有）
  | 'choice-only'     // 选择题专用（现有）
  | 'video-course'    // 视频课程（现有）
  | 'parent-deck'     // 🆕 父卡片牌组
  | 'child-deck';     // 🆕 子卡片牌组
```

### 4.2 牌组验证规则

| 牌组类型 | 允许的卡片 | 验证条件 |
|---------|-----------|---------|
| `parent-deck` | 仅父卡片 | `card.metadata?.cardRelation?.isParent === true` |
| `child-deck` | 仅子卡片 | `card.parentCardId !== undefined` |
| `mixed` | 非父子卡片 | 无`parentCardId`且非`isParent` |

**验证时机**：
- 创建卡片时
- 移动卡片时
- 导入卡片时
- 升降级转换时

### 4.3 牌组配对机制

#### 自动创建配对牌组

**触发时机**：创建父卡片牌组时

**流程**：
```
1. 用户创建牌组"英语语法-父卡片"，选择类型为 parent-deck
2. 系统自动检测名称后缀
3. 自动创建对应的"英语语法-子卡片"牌组，类型为 child-deck
4. 在牌组元数据中建立配对关系：
   父牌组.metadata.pairedChildDeck = 子牌组ID
   子牌组.metadata.pairedParentDeck = 父牌组ID
```

#### 查找配对牌组的逻辑

```typescript
// 伪代码
function findPairedDeck(deck: Deck): Deck | null {
  if (deck.deckType === 'parent-deck') {
    // 优先查找元数据中的配对ID
    if (deck.metadata.pairedChildDeck) {
      return getDecks(deck.metadata.pairedChildDeck);
    }
    // 否则按命名规则查找
    const childDeckName = deck.name.replace('-父卡片', '-子卡片');
    return findDeckByName(childDeckName);
  }
  
  if (deck.deckType === 'child-deck') {
    // 反向查找
    if (deck.metadata.pairedParentDeck) {
      return getDeck(deck.metadata.pairedParentDeck);
    }
    const parentDeckName = deck.name.replace('-子卡片', '-父卡片');
    return findDeckByName(parentDeckName);
  }
  
  return null;
}
```

---

## 五、核心功能流程

### 5.1 AI拆分父卡片

**入口**：父卡片详情页或卡片列表右键菜单

**完整流程**：

```
┌─────────────────────────────────────────────────────────┐
│ 1. 用户操作                                              │
│    - 打开父卡片详情                                       │
│    - 点击"🤖 AI拆分"按钮                                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. AI分析                                               │
│    - 显示加载提示："AI正在分析知识点..."                  │
│    - 调用 AIService.splitParentCard()                   │
│    - 分析卡片内容，识别独立知识点                         │
│    - 生成建议的子卡片数量和内容                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. 预览模态窗                                            │
│    - 显示父卡片内容（只读）                               │
│    - 显示AI生成的子卡片列表（可编辑）                     │
│    - 每张子卡片显示置信度                                 │
│    - 用户可以：                                          │
│      • 编辑子卡片内容                                     │
│      • 取消勾选不需要的子卡片                             │
│      • 点击"重新生成"按钮                                │
│      • 调整拆分数量                                      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 4. 用户确认                                              │
│    - 点击"确认并保存"按钮                                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 5. 自动保存                                              │
│    - 查找当前父卡片所在牌组的配对子牌组                   │
│    - 如果不存在配对子牌组，提示创建                       │
│    - 创建子卡片，设置：                                   │
│      • parentCardId = 父卡片UUID                         │
│      • sourceFile = 父卡片.sourceFile（完全继承）         │
│      • sourceBlock = 父卡片.sourceBlock                  │
│      • sourceRange = 父卡片.sourceRange                  │
│      • deckId = 配对子牌组ID                             │
│    - 更新父卡片的 childCardIds 列表                      │
│    - 建立父子关系元数据                                   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 6. 完成提示                                              │
│    - 显示："已成功拆分为 N 张子卡片"                      │
│    - 提供快捷操作：                                       │
│      • 查看子卡片列表                                     │
│      • 跳转到子卡片牌组                                   │
└─────────────────────────────────────────────────────────┘
```

### 5.2 子卡片升级为父卡片

**触发条件**：用户发现某个子卡片内容足够复杂，需要进一步拆分

**流程**：

```
┌─────────────────────────────────────────────────────────┐
│ 1. 用户操作                                              │
│    - 在子卡片牌组中选择一张子卡片                         │
│    - 右键菜单 → "升级为父卡片"                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. 系统检查                                              │
│    - 检查该子卡片是否已有子卡片                           │
│    - 如果已有 → 提示"该卡片已经是父卡片"并终止           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. 选择目标牌组                                          │
│    - 弹出对话框："将卡片移动到哪个父卡片牌组？"           │
│    - 列出所有 parent-deck 类型的牌组                     │
│    - 或提供"创建新父卡片牌组"选项                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 4. 执行升级                                              │
│    - 保留 parentCardId（用于历史追溯）                   │
│    - 设置 metadata.cardRelation.isParent = true         │
│    - 添加 metadata.cardRelation.childCardIds = []       │
│    - 记录升级信息：                                       │
│      • promotedFrom = 原父卡片UUID                       │
│      • promotedAt = 当前时间                            │
│    - 移动卡片到目标父卡片牌组                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 5. 完成提示                                              │
│    - "已升级为父卡片，现在可以对其进行拆分了"             │
└─────────────────────────────────────────────────────────┘
```

### 5.3 父卡片降级为子卡片

**触发条件**：用户发现某个父卡片过于简单，不需要独立存在

**流程**：

```
┌─────────────────────────────────────────────────────────┐
│ 1. 用户操作                                              │
│    - 在父卡片牌组中选择一张父卡片                         │
│    - 右键菜单 → "降级为子卡片"                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. 检查子卡片                                            │
│    - 查询该父卡片是否有子卡片                             │
│    - 如果有子卡片：                                       │
│      ┌─────────────────────────────────────────────┐   │
│      │ ⚠️ 警告对话框                                │   │
│      │ "该父卡片有 N 张子卡片，请选择处理方式："    │   │
│      │ ○ 将所有子卡片升级为父卡片                   │   │
│      │ ○ 解除父子关系（子卡片变为孤立卡片）         │   │
│      │ ○ 取消降级                                  │   │
│      └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. 选择新的父卡片                                        │
│    - 弹出搜索对话框："关联到哪个父卡片？"                 │
│    - 搜索框支持模糊搜索                                   │
│    - 显示候选父卡片列表                                   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 4. 选择目标牌组                                          │
│    - 自动推荐：新父卡片所在牌组的配对子牌组               │
│    - 或让用户选择其他 child-deck 类型牌组                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 5. 执行降级                                              │
│    - 设置 parentCardId = 新的父卡片UUID                  │
│    - 设置 metadata.cardRelation.isParent = false        │
│    - 清空 childCardIds（如果之前有子卡片已处理）          │
│    - 记录降级信息：                                       │
│      • demotedAt = 当前时间                             │
│      • previousChildCount = 原子卡片数量                │
│    - 移动卡片到目标子卡片牌组                             │
└─────────────────────────────────────────────────────────┘
```

### 5.4 删除父卡片

**流程**：

```
┌─────────────────────────────────────────────────────────┐
│ 1. 用户操作                                              │
│    - 选择父卡片 → 删除                                   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. 检查子卡片                                            │
│    - 查询该父卡片是否有子卡片                             │
│    - 如果有子卡片：                                       │
│      ┌─────────────────────────────────────────────┐   │
│      │ ⚠️ 确认对话框                                │   │
│      │ "该父卡片有 N 张衍生的子卡片，是否一并删除？" │   │
│      │                                             │   │
│      │ ○ 删除所有子卡片                            │   │
│      │ ○ 保留子卡片（解除父子关系）                │   │
│      │   ℹ️ 子卡片将保留来源文档和块链接            │   │
│      │      可继续在源文档中定位                    │   │
│      │ ○ 取消删除                                  │   │
│      └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. 执行操作                                              │
│    - 如果选择"删除所有"：                                │
│      • 递归删除所有子卡片                                │
│      • 删除父卡片                                        │
│    - 如果选择"保留子卡片"：                              │
│      • 清除所有子卡片的 parentCardId                     │
│      • 保留子卡片的 sourceFile、sourceBlock 等字段       │
│      • 删除父卡片                                        │
└─────────────────────────────────────────────────────────┘
```

**关键设计**：即使解除了父子关系，子卡片依然保留完整的源信息（`sourceFile`、`sourceBlock`、`sourceRange`），确保用户可以在Obsidian原始文档中定位和查看上下文。

---

## 六、界面设计

### 6.1 AI拆分预览模态窗

```
┌────────────────────────────────────────────────────────────────┐
│  🤖 AI智能拆分预览                                        [×] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  📄 原父卡片                                                   │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 正面: 现在完成时的用法                                     │ │
│  │ 背面: 现在完成时表示过去发生的动作对现在造成的影响...      │ │
│  │       构成：have/has + 过去分词                           │ │
│  │       用法1：表示已完成的动作                             │ │
│  │       用法2：表示持续到现在的状态                         │ │
│  │       例句：I have finished my homework.                 │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ✨ AI识别到 4 个独立知识点 (置信度: 89%)                     │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ✅ 子卡片 1 - 定义        [编辑] 置信度: 92%  │ │
│  │ ┌────────────────────────────────────────────────────┐   │ │
│  │ │ 正面: 什么是现在完成时？                            │   │ │
│  │ │ 背面: 现在完成时表示过去发生的动作对现在造成的影响   │   │ │
│  │ └────────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ✅ 子卡片 2 - 构成        [编辑] 置信度: 95%  │ │
│  │ ┌────────────────────────────────────────────────────┐   │ │
│  │ │ 正面: 现在完成时如何构成？                          │   │ │
│  │ │ 背面: have/has + 过去分词                          │   │ │
│  │ └────────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ✅ 子卡片 3 - 用法        [编辑] 置信度: 88%  │ │
│  │ ┌────────────────────────────────────────────────────┐   │ │
│  │ │ 正面: 现在完成时的主要用法？                        │   │ │
│  │ │ 背面: 1. 表示已完成的动作 2. 表示持续到现在的状态   │   │ │
│  │ └────────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ✅ 子卡片 4 - 例句        [编辑] 置信度: 85%  │ │
│  │ ┌────────────────────────────────────────────────────┐   │ │
│  │ │ 正面: I have finished my homework. （翻译）         │   │ │
│  │ │ 背面: 我已经完成了我的作业。                        │   │ │
│  │ └────────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ℹ️ 子卡片将自动保存到：英语语法-子卡片                        │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ 操作栏                                                  │   │
│  │ [🔄 重新生成] [⚙️ 调整数量 ▼] [取消] [✅ 确认并保存]    │   │
│  └────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

**交互说明**：
- 用户可以点击复选框取消勾选不需要的子卡片
- 点击"编辑"按钮可以修改子卡片内容
- 点击"重新生成"会重新调用AI分析
- 点击"调整数量"可以要求AI生成更多或更少的子卡片

### 6.2 卡片详情页 - 父子关系显示

```
┌────────────────────────────────────────────────────────────────┐
│  📄 卡片详情                                              [×] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  正面: 现在完成时的用法                                         │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 现在完成时表示过去发生的动作对现在造成的影响...            │ │
│  │ [完整内容显示]                                            │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  背面: [显示背面内容]                                          │
│                                                                │
│  ────────────────────────────────────────────────────────────  │
│                                                                │
│  📊 卡片信息                                                   │
│  • 所属牌组: 英语语法-父卡片                                   │
│  • 卡片类型: 父卡片 🔵                                        │
│  • 来源文档: 📝 英语笔记/现在完成时.md                         │
│  • 创建时间: 2025-10-20                                       │
│                                                                │
│  ────────────────────────────────────────────────────────────  │
│                                                                │
│  🌳 关联关系                                                   │
│                                                                │
│  ⬇️ 子卡片 (4张)                                [🤖 AI拆分]    │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 1. 📌 现在完成时-定义          [查看] [编辑] [删除关联]    │ │
│  │    稳定性: 8.5 | 下次复习: 2025-10-28                     │ │
│  │                                                            │ │
│  │ 2. 📌 现在完成时-构成          [查看] [编辑] [删除关联]    │ │
│  │    稳定性: 9.2 | 下次复习: 2025-11-05                     │ │
│  │                                                            │ │
│  │ 3. 📌 现在完成时-用法          [查看] [编辑] [删除关联]    │ │
│  │    稳定性: 7.3 | 下次复习: 2025-10-27                     │ │
│  │                                                            │ │
│  │ 4. 📌 现在完成时-例句          [查看] [编辑] [删除关联]    │ │
│  │    稳定性: 6.8 | 下次复习: 2025-10-26                     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ↔️ 关联卡片 (2张)                                             │
│  • 🔗 过去完成时 (2个反向引用)                                 │
│  • 🔗 英语时态总结                                             │
│                                                                │
│  ────────────────────────────────────────────────────────────  │
│                                                                │
│  [📝 编辑] [🗑️ 删除] [📋 复制] [🔗 分享] [关闭]              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 6.3 子卡片详情页 - 显示父卡片

```
┌────────────────────────────────────────────────────────────────┐
│  📄 卡片详情                                              [×] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  正面: 现在完成时如何构成？                                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ have/has + 过去分词                                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  背面: [显示背面内容]                                          │
│                                                                │
│  ────────────────────────────────────────────────────────────  │
│                                                                │
│  📊 卡片信息                                                   │
│  • 所属牌组: 英语语法-子卡片                                   │
│  • 卡片类型: 子卡片 🟢                                        │
│  • 来源文档: 📝 英语笔记/现在完成时.md (继承自父卡片)          │
│  • 创建时间: 2025-10-25 (AI拆分生成)                          │
│                                                                │
│  ────────────────────────────────────────────────────────────  │
│                                                                │
│  🌳 关联关系                                                   │
│                                                                │
│  ⬆️ 父卡片                                      [升级为父卡片]  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 🔵 现在完成时的用法                           [查看详情]   │ │
│  │    派生方式: AI拆分                                        │ │
│  │    拆分时间: 2025-10-25 14:30                             │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  👥 兄弟卡片 (同一父卡片下的其他子卡片)                         │
│  • 📌 现在完成时-定义                                          │
│  • 📌 现在完成时-用法                                          │
│  • 📌 现在完成时-例句                                          │
│                                                                │
│  ↔️ 关联卡片 (通过@语法关联的卡片)                              │
│  • 暂无                                                        │
│                                                                │
│  ────────────────────────────────────────────────────────────  │
│                                                                │
│  [📝 编辑] [🗑️ 删除] [📋 复制] [关闭]                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 6.4 @语法智能提示（编辑器内）

```
卡片内容编辑器：

┌────────────────────────────────────────────────────────────────┐
│  编辑卡片内容                                                   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  正面: 什么是过去完成时？                                       │
│                                                                │
│  背面: 过去完成时表示在过去某个时间或动作之前已经完成的动作。    │
│        它的构成与 @现在完                                       │
│                    └─────────────────────────┐                │
│                    [智能提示下拉列表]          │                │
│                    ┌───────────────────────┐ │                │
│                    │ 🃏 现在完成时-构成     │ │ ← 高亮当前选项 │
│                    │ 🃏 现在完成时-定义     │ │                │
│                    │ 🃏 现在完成时-用法     │ │                │
│                    │ 🃏 现在完成时的用法    │ │                │
│                    └───────────────────────┘ │                │
│                                              │                │
│                    [按 Enter 选择, ↑↓ 移动]   │                │
│                    ─────────────────────────┘                │
│                                                                │
│  [Ctrl+S 保存] [Esc 取消]                                       │
│                                                                │
└────────────────────────────────────────────────────────────────┘

选择后自动插入链接：

  背面: 过去完成时表示在过去某个时间或动作之前已经完成的动作。
        它的构成与 @[现在完成时-构成](tuanki://card/uuid-abc123) 相似。
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                   [渲染为带有下划线的链接样式，点击可跳转]
```

**实现要点**：
- 使用Obsidian的`EditorSuggest` API
- 触发字符：`@`
- 实时模糊搜索所有卡片
- 显示卡片的正面内容作为标题
- 选择后自动建立双向链接关系

### 6.5 牌组管理页 - 父子牌组配对

```
┌────────────────────────────────────────────────────────────────┐
│  📦 牌组管理                                                    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  [+ 新建牌组] [导入] [导出] [排序 ▼]                           │
│                                                                │
│  ────────────────────────────────────────────────────────────  │
│                                                                │
│  📁 语言学习 (目录)                                    [展开 ▼] │
│    │                                                            │
│    ├─ 📦 英语语法-父卡片 🔵 (12张)        [⚙️] [编辑] [删除]   │
│    │   ├─ 类型: 父卡片牌组                                      │
│    │   ├─ 配对子牌组: 英语语法-子卡片 → [跳转]                  │
│    │   └─ 新卡片: 3 | 复习: 5 | 学习中: 4                      │
│    │                                                            │
│    └─ 📦 英语语法-子卡片 🟢 (48张)        [⚙️] [编辑] [删除]   │
│        ├─ 类型: 子卡片牌组                                      │
│        ├─ 配对父牌组: 英语语法-父卡片 → [跳转]                  │
│        └─ 新卡片: 12 | 复习: 20 | 学习中: 16                   │
│                                                                │
│  ────────────────────────────────────────────────────────────  │
│                                                                │
│  📁 编程知识 (目录)                                    [展开 ▼] │
│    │                                                            │
│    ├─ 📦 JavaScript-父卡片 🔵 (8张)                            │
│    │   └─ 配对子牌组: JavaScript-子卡片                         │
│    │                                                            │
│    └─ 📦 JavaScript-子卡片 🟢 (32张)                           │
│        └─ 配对父牌组: JavaScript-父卡片                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**视觉标识**：
- 🔵 = 父卡片牌组
- 🟢 = 子卡片牌组
- 配对关系用 `→ [跳转]` 表示，点击可快速切换

### 6.6 创建牌组对话框

```
┌────────────────────────────────────────────────────────────────┐
│  ➕ 创建新牌组                                            [×] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  牌组名称: [________________________]                          │
│            例如: 英语语法                                       │
│                                                                │
│  牌组类型: [🔽 选择类型                    ]                   │
│            ┌────────────────────────────┐                     │
│            │ • 混合牌组 (默认)           │                     │
│            │ • 选择题专用                │                     │
│            │ • 视频课程                  │                     │
│            │ • 父卡片牌组 🔵 ← 选中      │                     │
│            │ • 子卡片牌组 🟢             │                     │
│            └────────────────────────────┘                     │
│                                                                │
│  ✨ 自动创建配对牌组                                            │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ☑️ 同时创建配对的子卡片牌组                                │ │
│  │    名称: 英语语法-子卡片 (自动生成)                        │ │
│  │                                                            │ │
│  │ ℹ️ 提示: 父卡片牌组和子卡片牌组成对存在，                  │ │
│  │         AI拆分的子卡片会自动保存到配对的子卡片牌组。        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  父级目录: [🔽 语言学习                   ]                    │
│                                                                │
│  描述 (可选): [_____________________________]                 │
│                                                                │
│  ────────────────────────────────────────────────────────────  │
│                                                                │
│  [取消] [创建牌组]                                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 七、技术要点

### 7.1 关系系统架构

**核心服务**：`CardRelationService`（已存在，需扩展）

**新增方法**：

```typescript
class CardRelationService {
  // 现有方法 (已实现)
  createRelation()
  getChildren()
  getParent()
  getCardFamily()
  validateRelation()
  detachChild()
  
  // 🆕 需要新增的方法
  promoteChildToParent(childCard: Card, targetDeckId: string): Promise<void>
  demoteParentToChild(parentCard: Card, newParentId: string, targetDeckId: string): Promise<void>
  handleParentDeletion(parentCard: Card, action: 'delete-all' | 'detach'): Promise<void>
  findPairedDeck(deck: Deck): Deck | null
  createPairedDeck(parentDeck: Deck): Promise<Deck>
}
```

### 7.2 AI服务扩展

**新增方法**：

```typescript
interface IAIService {
  // 现有方法
  generateCards()
  regenerateCard()
  testConnection()
  chat()
  
  // 🆕 新增卡片拆分方法
  splitParentCard(
    parentCard: Card,
    config: SplitConfig
  ): Promise<SplitResult>
}

interface SplitConfig {
  targetCount?: number;        // 期望拆分数量 (0=自动)
  minContentLength: number;    // 最小内容长度
  maxContentLength: number;    // 最大内容长度
  strategy: 'atomic' | 'hierarchical';  // 原子化 vs 层级化
  language: 'zh' | 'en';
  template: ParseTemplate;     // 使用的卡片模板
}

interface SplitResult {
  success: boolean;
  analysis: {
    suitable: boolean;          // 是否适合拆分
    reason: string;             // 理由
    confidence: number;         // 0-1
    identifiedPoints: string[]; // 识别的知识点
  };
  childCards: Array<{
    content: string;
    fields: Record<string, string>;
    confidence: number;
    rationale: string;          // AI拆分理由
  }>;
  error?: string;
}
```

**AI Prompt设计要点**：

```typescript
const systemPrompt = `
你是一个专业的知识拆解助手。你的任务是将复杂的知识点卡片拆分为符合"最小信息原则"的多个子卡片。

最小信息原则：
- 每张子卡片只包含一个独立的知识点
- 内容应该简洁明了，易于记忆
- 避免在单张卡片中包含多个概念

拆分策略：
1. 识别原卡片中的独立概念
2. 每个概念制作一张子卡片
3. 保持问答形式清晰
4. 建议拆分为3-7张子卡片

输出格式：JSON数组，每个元素包含：
- content: 卡片内容（Markdown格式）
- fields: { front: "问题", back: "答案" }
- confidence: 置信度 (0-1)
- rationale: 拆分理由
`;

const userPrompt = `
请将以下父卡片拆分为多个符合最小信息原则的子卡片：

父卡片内容：
${parentCard.content}

要求：
- 拆分为 ${targetCount || '3-7'} 张子卡片
- 每张子卡片聚焦一个知识点
- 保持原始语言风格
`;
```

### 7.3 牌组验证扩展

**扩展 `deck-validation.ts`**：

```typescript
// 新增验证函数
export function canAddCardToDeck(card: Card, deck: Deck): boolean {
  const deckType = deck.deckType;
  
  // 现有验证（选择题专用牌组）
  if (deckType === 'choice-only') {
    return card.type === 'multiple' || card.type === 'choice';
  }
  
  // 🆕 父卡片牌组验证
  if (deckType === 'parent-deck') {
    return card.metadata?.cardRelation?.isParent === true;
  }
  
  // 🆕 子卡片牌组验证
  if (deckType === 'child-deck') {
    return card.parentCardId !== undefined;
  }
  
  // 混合牌组：不能有父子关系的卡片
  if (deckType === 'mixed') {
    return !card.parentCardId && !card.metadata?.cardRelation?.isParent;
  }
  
  return true;
}

// 新增错误消息
export function getAddCardErrorMessage(card: Card, deck: Deck): string {
  if (deck.deckType === 'parent-deck' && !card.metadata?.cardRelation?.isParent) {
    return '该牌组仅接受父卡片。请先将该卡片升级为父卡片，或选择其他牌组。';
  }
  
  if (deck.deckType === 'child-deck' && !card.parentCardId) {
    return '该牌组仅接受子卡片。请先将该卡片降级为子卡片，或选择其他牌组。';
  }
  
  // ... 现有错误消息
}
```

### 7.4 @语法编辑器扩展

**使用Obsidian API实现**：

```typescript
// 注册自定义EditorSuggest
import { EditorSuggest, EditorPosition, Editor, EditorSuggestContext, EditorSuggestTriggerInfo } from 'obsidian';

export class CardMentionSuggester extends EditorSuggest<Card> {
  plugin: AnkiPlugin;
  
  constructor(plugin: AnkiPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }
  
  // 1. 定义触发条件
  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const beforeCursor = line.slice(0, cursor.ch);
    
    // 检查是否输入了 @
    const match = beforeCursor.match(/@([\w\u4e00-\u9fa5-]*)$/);
    
    if (match) {
      return {
        start: { line: cursor.line, ch: cursor.ch - match[0].length },
        end: cursor,
        query: match[1]  // @ 后面的查询文本
      };
    }
    
    return null;
  }
  
  // 2. 获取建议列表
  async getSuggestions(context: EditorSuggestContext): Promise<Card[]> {
    const query = context.query.toLowerCase();
    const allCards = await this.plugin.dataStorage.getAllCards();
    
    // 模糊搜索卡片
    return allCards.filter(card => {
      const frontText = card.fields?.front || card.content;
      return frontText.toLowerCase().includes(query);
    }).slice(0, 10);  // 限制10条结果
  }
  
  // 3. 渲染建议项
  renderSuggestion(card: Card, el: HTMLElement): void {
    const container = el.createDiv({ cls: 'tuanki-card-suggestion' });
    
    // 卡片图标
    const icon = container.createSpan({ cls: 'suggestion-icon' });
    icon.setText('🃏');
    
    // 卡片标题（正面内容）
    const title = container.createSpan({ cls: 'suggestion-title' });
    const frontText = card.fields?.front || card.content.slice(0, 50);
    title.setText(frontText);
    
    // 卡片类型标记
    if (card.metadata?.cardRelation?.isParent) {
      const badge = container.createSpan({ cls: 'suggestion-badge parent' });
      badge.setText('父');
    } else if (card.parentCardId) {
      const badge = container.createSpan({ cls: 'suggestion-badge child' });
      badge.setText('子');
    }
  }
  
  // 4. 选择建议
  selectSuggestion(card: Card, evt: MouseEvent | KeyboardEvent): void {
    const { context } = this;
    
    // 构建卡片链接
    const cardTitle = card.fields?.front || card.content.slice(0, 30);
    const cardLink = `@[${cardTitle}](tuanki://card/${card.uuid})`;
    
    // 替换文本
    context.editor.replaceRange(
      cardLink,
      context.start,
      context.end
    );
    
    // 🆕 自动建立双向链接关系
    // 需要获取当前正在编辑的卡片ID
    const currentCard = this.plugin.getCurrentEditingCard();
    if (currentCard) {
      this.plugin.relationService.createBidirectionalLink(
        currentCard.uuid,
        card.uuid
      );
    }
  }
}
```

**注册Suggester**：

```typescript
// 在 main.ts 的 onload() 中
async onload() {
  // ... 其他初始化
  
  // 注册卡片@语法提示
  this.registerEditorSuggest(new CardMentionSuggester(this));
}
```

### 7.5 源信息继承机制

**完全继承策略**：

```typescript
async function createChildCard(parentCard: Card, childData: ChildCardData): Promise<Card> {
  const childCard: Card = {
    // ... 基础字段
    
    // 🆕 完全继承源信息
    sourceFile: parentCard.sourceFile,          // 源文档路径
    sourceBlock: parentCard.sourceBlock,        // 块引用ID
    sourceRange: parentCard.sourceRange,        // 精确位置
    sourceExists: parentCard.sourceExists,      // 源是否存在
    
    // 如果有标注源，也继承
    annotationSources: parentCard.annotationSources
      ? [...parentCard.annotationSources]  // 深拷贝
      : undefined,
    
    // 标记为派生
    metadata: {
      cardRelation: {
        isParent: false,
        level: (parentCard.metadata?.cardRelation?.level || 0) + 1,
        derivationMetadata: {
          method: DerivationMethod.AI_SPLIT,
          splitTimestamp: new Date().toISOString(),
          originalContentHash: hashContent(parentCard.content),  // 记录父卡片内容哈希
          preservedFields: ['sourceFile', 'sourceBlock', 'sourceRange']
        }
      }
    },
    
    // 设置父卡片关系
    parentCardId: parentCard.uuid
  };
  
  return childCard;
}
```

**关键点**：
- 即使父卡片被删除，子卡片依然保留完整的`sourceFile`、`sourceBlock`等字段
- 用户可以通过这些字段在Obsidian中定位原始文档
- `originalContentHash`用于检测父卡片是否被修改，提示用户同步子卡片

---

## 八、数据结构变更

### 8.1 DeckType 枚举扩展

```typescript
// src/data/types.ts

export type DeckType = 
  | 'mixed'           // 混合牌组（无父子卡片）
  | 'choice-only'     // 选择题专用
  | 'video-course'    // 视频课程
  | 'parent-deck'     // 🆕 父卡片牌组
  | 'child-deck';     // 🆕 子卡片牌组
```

### 8.2 Deck 接口扩展

```typescript
// src/data/types.ts

export interface Deck {
  // ... 现有字段
  
  // 🆕 牌组配对关系
  metadata: {
    // 如果是父卡片牌组，指向配对的子卡片牌组
    pairedChildDeck?: string;  // 子牌组ID
    
    // 如果是子卡片牌组，指向配对的父卡片牌组
    pairedParentDeck?: string;  // 父牌组ID
    
    // ... 其他元数据
    [key: string]: unknown;
  };
}
```

### 8.3 Card 接口扩展（双向链接）

```typescript
// src/data/types.ts

export interface Card {
  // ... 现有字段
  
  // 🆕 双向链接系统（v0.9）
  linkedCards?: {
    // @语法提及的卡片
    mentions: string[];  // 被@提及的卡片UUIDs
    
    // 反向引用（谁引用了这张卡片）
    backlinks: string[];  // 自动维护
  };
  
  // 注意：parentCardId 已存在，保持不变
}
```

### 8.4 CardRelationMetadata 扩展

```typescript
// src/services/relation/types.ts

export interface CardRelationMetadata {
  isParent: boolean;
  childCardIds?: string[];
  level: number;
  siblingIndex?: number;
  derivationMetadata?: DerivationMetadata;
  learningStrategy?: LearningStrategy;
  relationStatus?: RelationStatus;
  
  // 🆕 升降级记录
  promotionHistory?: {
    promotedFrom?: string;  // 从哪张父卡片升级而来
    promotedAt?: string;    // 升级时间
  };
  
  demotionHistory?: {
    demotedAt?: string;     // 降级时间
    previousChildCount?: number;  // 降级前有多少子卡片
  };
}
```

---

## 九、实施计划

### 9.1 阶段划分

#### **阶段1：基础数据结构（1-2天）**
- [ ] 扩展`DeckType`枚举
- [ ] 扩展`Deck.metadata`支持配对关系
- [ ] 扩展`Card.linkedCards`支持双向链接
- [ ] 数据库迁移脚本（兼容现有数据）

#### **阶段2：牌组管理（2-3天）**
- [ ] 实现配对牌组自动创建逻辑
- [ ] 扩展`deck-validation.ts`验证规则
- [ ] 实现`findPairedDeck()`和`createPairedDeck()`方法
- [ ] UI：创建牌组对话框新增父子牌组选项
- [ ] UI：牌组列表显示配对关系

#### **阶段3：关系服务扩展（2-3天）**
- [ ] 实现`promoteChildToParent()`方法
- [ ] 实现`demoteParentToChild()`方法
- [ ] 实现`handleParentDeletion()`方法
- [ ] 实现双向链接管理方法
- [ ] 单元测试

#### **阶段4：AI拆分功能（3-4天）**
- [ ] 实现`IAIService.splitParentCard()`接口
- [ ] 设计AI拆分Prompt
- [ ] 实现拆分分析逻辑
- [ ] UI：AI拆分预览模态窗组件
- [ ] 集成到卡片详情页
- [ ] 测试不同类型卡片的拆分效果

#### **阶段5：@语法编辑器（3-4天）**
- [ ] 实现`CardMentionSuggester`类
- [ ] 注册`EditorSuggest`到Obsidian
- [ ] 实现卡片搜索和过滤
- [ ] 实现建议项渲染
- [ ] 实现选择后自动建立双向链接
- [ ] 样式优化（CSS）
- [ ] 测试编辑器兼容性

#### **阶段6：UI界面完善（2-3天）**
- [ ] 卡片详情页显示父子关系
- [ ] 卡片详情页显示关联卡片
- [ ] 升降级操作菜单
- [ ] 删除父卡片确认对话框
- [ ] 视觉标识（父卡片🔵、子卡片🟢）
- [ ] 响应式设计

#### **阶段7：测试与优化（2-3天）**
- [ ] 端到端测试
- [ ] 性能测试（大量卡片场景）
- [ ] 边界情况测试
- [ ] 用户体验优化
- [ ] 文档编写

### 9.2 总时长估算

**开发时间**: 15-22天  
**测试与优化**: 3-5天  
**总计**: 18-27天（约3-4周）

### 9.3 风险评估

| 风险项 | 影响程度 | 缓解措施 |
|-------|---------|---------|
| AI拆分质量不稳定 | 高 | 提供手动编辑，支持重新生成 |
| @语法与Obsidian编辑器冲突 | 中 | 严格遵循Obsidian API规范 |
| 数据迁移问题 | 中 | 保持向后兼容，提供迁移工具 |
| 性能问题（大规模卡片） | 低 | 使用索引和缓存优化 |
| 用户理解成本 | 中 | 提供引导教程和示例 |

---

## 十、参考文献

1. **Woźniak, P. A.** (1999-2023). *Effective learning: Twenty rules of formulating knowledge*. SuperMemo.com.

2. **Miller, G. A.** (1956). *The magical number seven, plus or minus two: Some limits on our capacity for processing information*. Psychological Review, 63(2), 81–97.

3. **Ahrens, S.** (2017). *How to Take Smart Notes: One Simple Technique to Boost Writing, Learning and Thinking*. Sönke Ahrens.

4. **Sweller, J.** (1988). *Cognitive load during problem solving: Effects on learning*. Cognitive Science, 12(2), 257-285.

5. **Obsidian API Documentation**. https://docs.obsidian.md/

6. **FSRS Algorithm** (Freespaced Repetition Scheduler). https://github.com/open-spaced-repetition/fsrs4anki

---

## 附录A：术语表

| 术语 | 英文 | 定义 |
|-----|------|-----|
| 父卡片 | Parent Card | 包含完整知识点的卡片，可被拆分为多个子卡片 |
| 子卡片 | Child Card | 从父卡片拆分的、符合最小信息原则的卡片 |
| 父卡片牌组 | Parent Deck | 只能存放父卡片的牌组（deckType: 'parent-deck'） |
| 子卡片牌组 | Child Deck | 只能存放子卡片的牌组（deckType: 'child-deck'） |
| 牌组配对 | Deck Pairing | 每个父卡片牌组自动对应一个子卡片牌组 |
| 最小信息原则 | Minimum Information Principle | 将学习材料拆分为最小、独立的信息单元 |
| @语法 | @Mention Syntax | 在编辑器中输入@引用其他卡片的语法 |
| 双向链接 | Bidirectional Link | 卡片间的互相引用关系 |
| 升级 | Promote | 将子卡片转换为父卡片 |
| 降级 | Demote | 将父卡片转换为子卡片 |
| 源信息 | Source Information | 卡片的Obsidian来源文档、块链接等溯源信息 |

---

## 附录B：常见问题（FAQ）

**Q1: 父子卡片与目录层级的区别？**

A: 完全不同的两个概念：
- 目录层级：牌组的文件夹组织结构（通过`parentId`字段实现）
- 父子卡片：卡片之间的知识层级关系（通过`parentCardId`字段实现）

**Q2: 子卡片升级为父卡片后，原来的父子关系会消失吗？**

A: 不会。升级后会保留`parentCardId`字段用于历史追溯，但同时添加`isParent: true`标记，允许该卡片拥有自己的子卡片。

**Q3: AI拆分的质量如何保证？**

A: 三重保障：
1. AI生成时显示置信度分数
2. 用户在预览模态窗中可以编辑内容
3. 提供"重新生成"功能，可以多次尝试

**Q4: 如果不想使用父子卡片功能，会影响现有使用吗？**

A: 完全不影响。父子卡片是可选功能：
- 现有的混合牌组继续正常工作
- 不创建父子牌组就不会涉及相关功能
- 所有现有数据保持兼容

**Q5: @语法链接和父子关系有什么区别？**

A:
- 父子关系：纵向的层级结构（拆分关系）
- @语法链接：横向的关联关系（相关知识点）

两者可以同时存在，互不冲突。

---

**文档结束**

> 本文档为设计草案，具体实现细节可能根据开发过程中的实际情况进行调整。

