---
name: obsidian-plugin-versioning
description: 为 Obsidian 插件执行安全、规范的版本升级与发布元数据同步。用于修改 manifest.json、package.json、versions.json、package-lock.json、release workflow、BRAT 安装兼容性、或从主插件拆分为独立插件后校验版本链与仓库身份是否一致。
---

# Obsidian Plugin Versioning

为 Obsidian 插件做版本更新时，优先保证「发布元数据一致」和「仓库身份一致」。不要只改一个文件，也不要把依赖锁文件的内部格式误判为插件发布版本。

## 先区分两类版本

1. 发布版本。
- 由 `manifest.json` 的 `version` 决定。
- 通常要求与 `package.json` 的 `version` 保持一致。
- 如果仓库带 `versions.json`，新版本必须补一条 `插件版本 -> minAppVersion` 映射。

2. 依赖锁版本。
- `package-lock.json` 顶层的 `version` 和根包 `packages[""]` 的 `name/version` 是仓库包身份，不是 Obsidian 安装索引。
- `lockfileVersion` 是 npm 锁文件格式版本，不是插件版本，不能因为它是 `3` 就怀疑发版号异常。

## 标准版本升级流程

1. 先更新发布链。
- 同步修改 `manifest.json` 的 `version`。
- 同步修改 `package.json` 的 `version`。
- 同步修改 `versions.json`，补上新版本到 `minAppVersion` 的映射。

2. 再同步仓库身份。
- 如果插件是从别的仓库或主插件拆分出来的，检查 `package-lock.json` 顶层 `name/version` 和 `packages[""]` 的 `name/version` 是否还残留旧项目身份。
- 如果残留旧身份，运行 `npm install --package-lock-only --ignore-scripts` 重新生成锁文件元数据。

3. 最后检查发布自动化。
- 确认 release workflow、校验脚本、复制脚本读取的是当前插件自己的 `manifest.json`、`package.json`、`versions.json`。
- 确认 tag 校验、release 产物校验、`dist/manifest.json` 校验都以当前仓库版本为准。

## BRAT 与 Obsidian 兼容判断

1. 判断 BRAT / 手动安装是否受影响时，优先看发布产物。
- `main.js`
- `manifest.json`
- `styles.css`
- `versions.json`（如果仓库使用它）

2. 不要把 `package-lock.json` 当成 BRAT 安装阻塞项。
- BRAT 和 Obsidian 社区插件安装主要依赖 release 资产与 `manifest.json`。
- 锁文件错误通常不会直接让 BRAT 安装失败。
- 但锁文件里的旧项目身份会误导维护者、污染 CI 心智模型，并在独立插件拆分后制造长期维护风险。

## 拆分独立插件时的强规则

如果一个阅读器、IR、或子插件是从主插件拆分出来的，默认执行下面检查：

1. 仓库名称、`package.json` 名称、`manifest.json` 插件 `id` 是否已经代表独立插件。
2. `package-lock.json` 顶层 `name/version` 是否仍然指向旧主插件。
3. release workflow 是否还引用旧目录、旧 tag 规则、旧资产路径。
4. 文档里「手动安装 / BRAT 安装 / 发布文件列表」是否仍然写着旧插件名或旧路径。

只要第 2 项有残留，就建议修正，因为这是「代码能跑但仓库身份漂移」的典型长期问题。

## 推荐判断顺序

当用户问「版本这样改是否合理、是否符合 Obsidian 规范、是否影响 BRAT」时，按这个顺序回答：

1. `manifest.json` / `package.json` / `versions.json` 是否一致。
2. release workflow 和 release 校验脚本是否以这套版本链为准。
3. `package-lock.json` 问题究竟是「锁文件格式正常」还是「仓库身份残留异常」。
4. BRAT 是否真的读取这个文件，还是只会间接受到 release 产物影响。

## 默认建议

- 如果版本链已经正确，而锁文件仍残留旧主插件身份，强烈建议一并同步锁文件。
- 如果只是 `lockfileVersion` 看起来和插件版本不同，不要误报问题。
- 如果没有自动化版本升级脚本，且这个仓库经常发版，强烈建议补一个统一版本脚本，至少覆盖 `manifest.json`、`package.json`、`versions.json`、`package-lock.json` 和发布前校验。

## 社区插件提交元数据（manifest.description）

官方社区验证机器人会拒绝 `manifest.json` 的 `description` 中出现 **Obsidian**（任意大小写，含子串匹配）或中文 **黑曜石**。界面报错可能显示「黑曜石」，那是中文 UI 对 `Obsidian` 的翻译，不代表你写了中文；但若描述里真的写了「黑曜石」同样会被拒。

### 强规则

1. `manifest.json` → `description`：**禁止** `obsidian` / `Obsidian` / `黑曜石`（任意位置，不限整词）。
2. `package.json` → `description`：与 manifest 保持同一句话（manifest 可有句末 `.`，npm 侧通常无句点）；同样禁止上述字样。
3. 改描述时优先用「在库中 / 在笔记里 / 用记忆牌组」等说法，不要写「在 Obsidian 中」。
4. **扫描对象要对**：Preview tag / SHA 扫 `0.8.7` 或 `6e689a1` 会一直失败（旧 release 仍带 `in Obsidian`）；应用 **Preview branch scan → `main`**，或发新 tag（如 `0.8.8`）后再扫 tag。

### 推荐措辞（Weave 当前基线）

```text
Enhance knowledge learning and memory consolidation with memory decks and practice quiz decks.
```

### 发版前本地守门

```bash
npm run audit:obsidian-release
```

脚本 `scripts/audit-obsidian-release.cjs` 会检查：manifest/package 描述不含 Obsidian、两者语义一致、版本链与 release 资产等。社区提 PR 前务必跑通。

## 相关文档（必读）

- `docs/RELEASE_GUIDE.md` — 预览扫描 vs 正式发版、版本号何时 bump、release 产物约定
- `docs/technical/OBSIDIAN_PLUGIN_IMPLEMENTATION_STANDARD.md` §8.4 — 审核红线总表

发版前：若只是反复跑官方预览扫描，不要为每次试错都递增 `manifest.json` 版本；见 RELEASE_GUIDE「先说结论」。
