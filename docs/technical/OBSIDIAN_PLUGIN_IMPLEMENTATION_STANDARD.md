# Weave Obsidian 插件实现标准

> **状态**: 技术规范
>
> **适用仓库**: `10-Project-Tuanki/anki-obsidian-plugin`

---

## 1. 目标

本规范用于约束 Weave 在 Obsidian 插件环境中的实现方式。

它主要解决三类问题：

- AI 或人工实现时没有优先使用 Obsidian 官方 API，结果做出不够原生、兼容性差的实现
- 数据、缓存、索引、路径、样式边界混乱，导致同步问题、主题兼容问题或审核问题
- 代码虽然“能跑”，但在 Obsidian 官方审核、自定义主题、深浅色模式、移动端或未来维护中不稳

这份文档是前瞻性实现标准，不是历史修复记录。  
历史审核修复记录见：

- `docs/obsidian-review-compliance.md`

---

## 2. 核心原则

### 2.1 原生优先

能用 Obsidian 官方 API 和原生 UI 原语解决的，就不要先造自定义替代物。

优先级默认如下：

1. Obsidian 官方 API / 原生 UI
2. 在原生 UI 外包一层轻量适配
3. 只有在原生能力明显不够时，才做自定义实现

### 2.2 质量高于照搬旧结构

当前仓库已有结构不是绝对正确。

如果发现现有实现不合理、重复、脆弱、难维护，允许进行更优的结构调整，但前提是：

- 不破坏当前功能
- 不破坏界面体验
- 不破坏主题兼容
- 不破坏数据路径约定
- 不破坏 Obsidian 审核兼容性

### 2.3 宿主兼容性优先

Weave 不是独立网站，而是运行在 Obsidian 里的插件。

因此实现时默认要优先考虑：

- Obsidian 原生交互习惯
- 社区主题兼容
- 深色 / 浅色模式
- 官方审核规则
- 移动端和桌面端差异

---

## 3. UI 与 API 选择规则

### 3.1 优先使用的 Obsidian 原生能力

遇到下面这些需求时，优先考虑对应 Obsidian 原生能力：

| 需求 | 优先方案 |
|---|---|
| 普通弹窗 / 表单弹窗 / 确认弹窗 | `Modal` |
| 搜索建议 / 文件建议 / 快速选择 | `SuggestModal` / `FuzzySuggestModal` |
| 右键动作、上下文动作、轻量操作列表 | `Menu` |
| 通知反馈 | `Notice` |
| 设置页结构 | `PluginSettingTab` / `Setting` |
| 图标 | Obsidian 图标工具，如 `setIcon` / `addIcon` |
| 文件、目录、前台编辑、回收站 | `Vault` / `FileManager` / `Editor` |
| 网络请求 | `requestUrl` |
| 轻量悬浮帮助 / 宿主内悬浮交互 | 优先贴近 Obsidian 已有交互模式，在原生容器上做轻量扩展，而不是手搓全局浮层系统 |

默认不优先：

- 浏览器原生 `prompt()` / `alert()` / `confirm()`
- 为简单场景额外造一套完全自定义浮层系统
- 为常见菜单场景重写一套与 Obsidian 风格完全不同的右键菜单

### 3.2 文件列表、菜单、模态窗、建议菜单、浮窗

如果需求本身与 Obsidian 已有交互模型高度一致，应优先贴近 Obsidian：

- 文件或目录选择：优先考虑建议菜单、模态选择器、现有文件视图上下文
- 操作菜单：优先考虑 `Menu`
- 普通输入或确认：优先考虑 `Modal`
- 设置页分组：优先考虑 `Setting`
- 图标与动作提示：优先考虑 Obsidian 图标工具和宿主已有提示模式
- 轻量悬浮辅助 UI：优先考虑不会脱离宿主风格的轻量扩展，而不是自建全局 tooltip / popover 框架

只有在这些原生能力明显不足时，才扩展自定义 UI。

### 3.3 自定义 UI 的边界

允许自定义 UI，但应满足：

- 不是为了绕过原生 API
- 不是重复已有 Obsidian 组件能力
- 不会破坏原生交互感
- 不会因样式优先级过高影响 Obsidian 其他界面

### 3.4 文件、frontmatter、删除、网络的默认实现顺序

当任务涉及文件、元数据、删除、网络时，默认顺序应是：

1. 优先考虑 `Vault`
2. 需要改 frontmatter 时优先考虑 `FileManager.processFrontMatter`
3. 需要删除文件时优先考虑 `FileManager.trashFile`
4. 需要发请求时优先考虑 `requestUrl`
5. 只有在官方 API 不覆盖、且数据逻辑上属于插件本地缓存/索引/临时文件时，才直接使用底层 `adapter`

也就是说：

- 用户资产优先走 Obsidian 业务 API
- 插件本地辅助数据才更适合直接走插件目录和底层文件能力
- 不要为了图省事，把所有事情都降级成原始文件读写

---

## 4. 结构优化与重构边界

### 4.1 可以突破现有结构

如果以下情况成立，可以不受当前结构限制：

- 当前实现明显重复
- 当前实现跨层级耦合严重
- 当前实现路径不符合 Obsidian 最佳实践
- 当前实现不利于主题适配或审核合规
- 当前实现导致维护成本持续升高

### 4.2 但必须控制风险

重构或重设计时必须同时检查：

- 用户可见行为是否变化
- 原有命令、入口、菜单、模态、视图是否被破坏
- 数据读写路径是否被错误迁移
- CSS 是否开始污染宿主界面
- 深浅色模式下是否出现不可读文本

重构不是目标，稳定升级才是目标。

---

## 5. 数据存放规则

### 5.1 Vault 数据

应放在 Obsidian 仓库中的数据：

- 卡片数据
- 学习记录
- 牌组数据
- 增量阅读相关主数据
- 用户希望同步、备份、重建后仍然存在的数据
- 即使插件重装也应保留的数据

这些数据应视为：

- 用户资产
- 可同步数据
- 可重建业务数据

### 5.2 插件目录数据

应放在插件安装目录或插件配置目录中的数据：

- 索引
- 缓存
- 临时文件
- 运行时快照
- 可重建派生数据
- 本地日志
- 本地性能缓存
- 不应参与同步的局部状态

典型例子：

- `.wdeck` 缓存索引
- 重建后即可恢复的搜索索引
- 会话级临时文件
- 诊断日志
- 宿主本地 UI 缓存

### 5.3 路径规则

不要硬编码 `.obsidian`。

应使用实际配置目录能力，例如：

- `Vault.configDir`
- 项目里已有的动态路径函数

如果一个文件在逻辑上属于“本地辅助状态”而不是“用户核心学习数据”，默认不要把它写进 vault 主数据区。

---

## 6. 样式与主题规则

### 6.1 优先用 Obsidian CSS 变量

默认优先：

- `var(--background-primary)`
- `var(--background-secondary)`
- `var(--text-normal)`
- `var(--text-muted)`
- `var(--interactive-accent)`
- 以及 Obsidian 提供的其他组件变量

不要优先使用硬编码颜色。

#### 默认设计语言补充

- 默认采用扁平化、无凸起、无边框的设计语言
- 普通信息区、分栏、标签栏、工具栏、筛选栏、次级导航默认不要做成悬浮卡片
- 卡片顶部标题条、UUID/属性条、标签式信息块默认也不要做成带圆角描边的胶囊块、悬浮块或二次卡片层
- 优先通过留白、层级、轻量背景差异和激活态表达结构
- 除非确有交互或可读性需求，不要为了包住标题或属性而额外套一层外框、浅投影或凸起底板
- 若必须使用边框或阴影，必须服务于分隔、反馈或可读性，而不是装饰

### 6.1.1 变量选择要语义正确，不要叠加无价值回退链

当样式目标已经很明确时，应直接使用对应语义变量，不要为了“看起来更稳”叠加多层 fallback。

例如：

- 普通边框、分割线、区域分界线：优先 `var(--background-modifier-border)`
- 只有在明确是 hover 态边框时，才使用 `var(--background-modifier-border-hover)`
- 不要把分割线默认写成 `divider-color -> hover border -> normal border -> text-faint` 这类链式回退
- 只是表达区域分界时，优先把线附着在容器自身的 `border-top` / `border-bottom` 或语义等价的容器边界表达上，不要为了一条线额外插入零高度空元素

原则是：

- 先选对变量，再看主题表现
- 如果表现不对，优先检查是否变量选错、结构选错、层次表达方式选错
- 不要用多层 fallback 掩盖变量选择错误
- 不要为了局部“显得出来”就额外混入不相干的文本色、强调色或自定义调色逻辑

只有当宿主或当前主题明确约定了某个专用变量，且该变量就是当前语义目标时，才允许使用该专用变量。

官方文档也明确建议插件利用内置 CSS 变量来做“原生感”和主题兼容：

- `About styling`
- `CSS variables`

### 6.2 避免高风险样式实现

尽量避免：

- 大范围全局 CSS import
- 会污染宿主界面的第三方样式重置
- 高优先级全局选择器
- 动态创建并注入 `<style>`
- 大量 `element.style.xxx = ...`
- 依赖硬编码 `z-index`、硬编码背景色、硬编码文字色

这里“尽量别用 import”应理解为：

- 尽量避免导入会污染宿主界面的全局样式资源
- 尽量避免导入高侵入第三方 UI 样式体系
- 尽量避免导入会提高优先级并覆盖 Obsidian 原生界面的样式

这**不是**禁止正常的 TypeScript 模块 import。

优先使用：

- `styles.css`
- 作用域清晰的 class
- 明确限定在 Weave 根容器下的样式
- 必须运行时变化时再用 CSS 变量或安全样式更新方式

### 6.2.1 不要复用宿主保留类名

插件内部容器不要随手命名成宿主已经广泛使用的类名，例如：

- `workspace`
- `view`
- `menu`
- `modal`
- `popover`

这类名字即使组件样式本身是局部作用域，也仍可能被 Obsidian 或社区主题的全局选择器误伤。

原则是：

- 插件内部 class 优先使用明确前缀或语义名，例如 `weave-ai-page`、`weave-card-toolbar`
- 如果某层只是为了补一个边距、背景或包裹作用而存在，应先检查它是否真的必要
- 如果样式问题来源于多包了一层无语义容器，优先删除容器，不要靠再换一层颜色变量去掩盖

### 6.3 深色 / 浅色模式适配

每次做 UI 改动时，至少要检查：

- 深色模式文字是否看得清
- 浅色模式文字是否看得清
- hover / selected / active 状态是否可辨识
- 图标在两种模式下是否可见
- 半透明背景、边框、阴影是否在任一模式下失真

默认不要假设：

- 页面一定是深色
- 页面一定是浅色
- 某个主题一定存在高对比背景

---

## 7. import 与样式污染规则

这里的“尽量别用 import”在本项目中应理解为：

- 尽量避免引入会污染 Obsidian 宿主界面的全局样式资源
- 尽量避免引入高优先级或高侵入性的第三方 UI 样式体系
- 尽量避免让导入的样式覆盖 Obsidian 本地界面

这并不是禁止正常的 TypeScript 模块 import。  
禁止的是会导致宿主界面异常的样式性、全局性、侵入性导入。

因此默认建议：

- 正常的 TS 模块 import 可以使用
- 但全局样式 import 要克制
- 第三方样式系统要谨慎
- 自定义样式必须限制作用范围

---

## 8. 官方审核与本地验证

### 8.1 官方依据

Obsidian 官方当前明确提供了：

- 提交插件文档
- 自检清单
- 自动验证机器人流程

从官方文档看，提交到 `obsidianmd/obsidian-releases` 后，PR 会先经过自动验证：

- `Ready for review` 表示自动验证通过
- `Validation failed` 表示需要先修复问题

### 8.2 本仓库本地预检

本项目当前已有一条相关命令：

```bash
npm run lint:obsidian
```

它应被视为：

- 本地 Obsidian 审核前预检
- UI/API/路径/样式规则的本地守门

推荐验证顺序：

1. `npm run lint:obsidian`
2. `npm run check`
3. `npm run test`

如果改动主要涉及：

- UI
- 菜单
- 模态窗
- 文件路径
- 存储
- 样式
- Obsidian API

则默认应优先跑 `npm run lint:obsidian`。

### 8.3 当前仓库实践提醒

本仓库已经有：

- `eslint.obsidian.config.mjs`
- `docs/obsidian-review-compliance.md`

因此后续 AI 或人工修改时，不应再忽略 Obsidian 审核兼容性。

### 8.4 高频审核红线

结合 Obsidian 官方当前的提交文档与 self-critique checklist，后续实现默认要特别注意这些高频问题：

- 不要硬编码 `.obsidian`，应使用 `Vault.configDir`
- 不要用 JS 或 HTML 直接写大量样式
- 不要用 `fetch` / `axios.get` 替代 `requestUrl`
- 不要优先使用 `Adapter` API 处理本应由 `Vault` / `FileManager` 负责的用户数据
- 不要用 `vault.delete` 直接删文件，应遵守用户删除偏好
- 不要手写 frontmatter 读改写，优先使用 `processFrontMatter`
- 不要覆盖 Obsidian 核心样式，应把样式限制在自己的类名或容器下
- 不要给命令设置默认快捷键，除非有非常强的理由
- UI 文案、设置项、按钮文本应尽量贴近 Obsidian 原生大小写与风格
- `manifest.json` 的 `description`（及与之对齐的 `package.json` `description`）**不得**出现 `Obsidian` / `obsidian` / `黑曜石`；社区验证机器人会直接拒绝。界面可能显示「黑曜石」实为英文规则的中文翻译。勿扫旧 tag/旧 SHA（如 `0.8.7` / `6e689a1`）。发版前运行 `npm run audit:obsidian-release`

### 8.1 移动端贴底 UI 与 Obsidian 底栏

桌面端通常**没有**始终显示的 Obsidian 底部功能栏；移动/平板则有 `.mobile-toolbar` 等宿主底栏。

凡 `position: fixed; bottom: 0`、workspace 级贴底预览层、页内底栏，在 `body.is-mobile` / `body.is-phone` 下须用 `mobile-modal-bounds` 写入的 `--weave-workspace-bottom-offset`（回退 `--weave-modal-bottom` → `env(safe-area-inset-bottom)`），并加少量 `var(--weave-mobile-fixed-bottom-gap, 4px)` 缓冲。**禁止**以固定 `48px` / `60px` 作为主方案。

流程与参考实现见 `docs/technical/skills/weave-mobile-workspace-chrome/SKILL.md`。

---

## 9. 本仓库的执行要求

以后在 Weave 仓库中处理 Obsidian 插件任务时，默认执行要求如下：

1. 优先查找是否已有 Obsidian 原生 API 可直接使用
2. 判断当前结构是否需要优化，但不为了重构而重构
3. 文件、frontmatter、删除、网络优先走 Obsidian 官方 API
4. 明确数据属于 vault 还是插件目录
5. 避免样式污染宿主界面
6. 尽量使用 Obsidian 颜色变量
7. 检查深色与浅色模式可读性
8. 尽可能运行 `npm run lint:obsidian`
9. 移动端新增贴底 UI 时对照 `weave-mobile-workspace-chrome` skill，避免与 Obsidian 底栏重叠
10. 发布前主动对照官方 self-critique checklist 与提交流程要求

---

## 10. 参考依据

时间基准：`2026-04-15`

- Obsidian 官方插件自检清单  
  https://docs.obsidian.md/oo/plugin
- Obsidian 官方提交插件文档  
  https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin
- Obsidian 官方 CSS 变量与样式说明  
  https://docs.obsidian.md/Reference/CSS%20variables/About%20styling
- Obsidian 官方 Modal 变量页  
  https://docs.obsidian.md/Reference/CSS%20variables/Components/Modal
- Obsidian 官方 sample plugin  
  https://github.com/obsidianmd/obsidian-sample-plugin
- Obsidian 官方 API 类型仓库  
  https://github.com/obsidianmd/obsidian-api
