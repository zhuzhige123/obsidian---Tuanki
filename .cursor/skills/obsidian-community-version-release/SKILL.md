---
name: obsidian-community-version-release
description: >-
  为 Weave 主插件（id=weave）同步 Obsidian 社区市场版本元数据并发布 GitHub Release。
  用于发版、更新版本号、推送社区插件更新、sync manifest、仅同步版本元数据而不提交开发代码、
  修复市场仍显示旧版本、或同步 public/versions.json 时。仓库 zhuzhige123/obsidian---Weave。
---

# Obsidian 社区插件版本发布（Weave）

本 skill 以 **Weave 主插件仓库根目录**（含 `manifest.json` 的目录）为工作目录。

## 仓库常量

| 项 | 值 |
|----|-----|
| 插件 ID | `weave` |
| GitHub | `zhuzhige123/obsidian---Weave` |
| 远程 / 默认分支 | `origin` / `main` |
| 常见本地分支 | `wip-main-sync`（push 时用 `wip-main-sync:main`） |

## 官方更新机制

Obsidian **不会**随每次 push 自动更新市场。必须同时满足：

1. **`main` 上 `manifest.json.version`** → 客户端识别最新版本
2. **GitHub Release（tag = 版本号）** → 安装文件来源
3. **Community 自动审核通过**

首次上架后 **无需** 再向 `obsidian-releases` 提 PR。

## 版本文件（4 处必须一致）

| 文件 | 作用 |
|------|------|
| `manifest.json` | `version` + `minAppVersion` |
| `package.json` | 仅 `version` 字段需与 manifest 一致 |
| `versions.json` | `"x.y.z": "<minAppVersion>"` |
| **`public/versions.json`** | 必须与 `versions.json` **完全相同**（`.github/workflows/release.yml` 强制校验） |

升版后先同步 public：

```bash
node scripts/sync-public-versions.cjs
```

## 推送安全

- **不要提交** `cloud-license-service/`（后端服务）
- **不要提交** 私钥、激活码工具、`docs/`、`backend/` 等 `.gitignore` 已排除内容
- 完整发版提交时：`git add -A` 后 `git reset -- cloud-license-service`

---

## 模式 A：仅同步版本元数据（WIP 暂不提交）

适用：本地有大量未提交改动，但需要 Obsidian 立刻识别新版本。

```bash
node scripts/sync-obsidian-community-version.cjs
node scripts/sync-obsidian-community-version.cjs --version 0.8.10
node scripts/sync-obsidian-community-version.cjs --push-ref wip-main-sync:main
node scripts/sync-obsidian-community-version.cjs --dry-run
```

或 npm：

```bash
npm run sync:obsidian-version
```

脚本会：stash WIP → 基于 `origin/main` 只改 4 个版本文件 → push → 恢复原分支与 stash。

**禁止**在此 commit 中包含 `src/`、依赖或脚本路径变更。

---

## 模式 B：完整发版（含代码）

**顺序不可颠倒**：先 push 带新版本号的 `main`，再 push tag。

```bash
# 1. 升版并同步 public/versions.json
#    编辑 manifest.json / package.json / versions.json
node scripts/sync-public-versions.cjs

# 2. 检查
npm run test
npm run lint:obsidian

# 3. 提交（排除 cloud-license-service）
git add -A
git reset -- cloud-license-service
git commit -m "Release 0.8.10: ..."

# 4. push main
git push origin wip-main-sync:main
# 或当前分支：git push origin HEAD:main

# 5. 打 tag 触发 release.yml
git tag 0.8.10
git push origin 0.8.10
```

Release workflow 上传：`main.js`、`manifest.json`、`styles.css`（含 GitHub attestation）。

**不要**手动上传 Release 资产。

---

## 发版后验证

```bash
curl -s https://raw.githubusercontent.com/zhuzhige123/obsidian---Weave/main/manifest.json
```

- `version` = 目标版本
- GitHub Actions Release 成功
- [Community 后台](https://community.obsidian.md/account/profile) 该版本审核「完工」
- Obsidian 客户端 → 社区插件 → 检查更新

---

## 检查清单

```
- [ ] manifest / package / versions 版本一致
- [ ] public/versions.json 与 versions.json 完全相同
- [ ] origin/main manifest.version = 目标版本
- [ ] GitHub Release tag = 版本号，3 个资产齐全
- [ ] 未误提交 cloud-license-service
- [ ] Community 审核通过
```

---

## 常见错误

| 现象 | 原因 | 处理 |
|------|------|------|
| 市场仍显示旧版本 | `main` manifest 未更新 | 模式 A |
| Release CI 失败 | `public/versions.json` 未同步 | `npm run sync:public-versions` |
| tag 与 manifest 不一致 | 升版遗漏 | 对齐后重打 tag |
| 先 tag 后 push main | 顺序错误 | 先 push main 再 tag |

---

## 关联插件（EPUB 阅读器）

独立仓库 `weave-epub-reader`（`zhuzhige123/obsidian-weave-reader`）有独立 skill 与 `scripts/sync-obsidian-community-version.cjs`，版本链含 3 个文件（无 `public/versions.json`）。

---

## 相关 skill

- **obsidian-plugin-versioning**：版本链、`package-lock` 身份
- **weave-public-push-guard**：公开推送安全
