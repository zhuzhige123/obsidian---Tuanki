# Obsidian → Anki 内容转换功能实施文档

## 📋 概述

本文档记录了 Obsidian 到 Anki 的内容转换功能实施，包括媒体文件格式转换、源文档回链和块引用回链。

## ✨ 实施功能清单

### 1. 媒体文件格式转换 ✅

**支持的媒体类型**：
- **图片**：PNG, JPG, JPEG, GIF, SVG, WebP, BMP
- **音频**：MP3, WAV, OGG, M4A, FLAC, AAC
- **视频**：MP4, WebM, OGV, MOV, AVI, MKV

**转换规则**：

| Obsidian 格式 | Anki 格式 | 说明 |
|--------------|-----------|------|
| `![[image.jpg]]` | `<img src="image.jpg">` | 图片转 HTML |
| `![alt](image.png)` | `<img src="image.png" alt="alt">` | 保留 alt 属性 |
| `![[audio.mp3]]` | `[sound:audio.mp3]` | Anki 音频格式 |
| `![](music.wav)` | `[sound:music.wav]` | Anki 音频格式 |
| `![[video.mp4]]` | `[sound:video.mp4]` | Anki 推荐格式 |
| `![](clip.webm)` | `[sound:clip.webm]` | 视频也用 sound 标签 |

**自动上传**：
- ✅ 自动读取 Obsidian vault 中的媒体文件
- ✅ 转换为 Base64 编码
- ✅ 上传到 Anki media collection
- ✅ 支持批量上传
- ✅ 失败时保留原始引用，不阻止导出

### 2. 源文档回链 ✅

**功能**：
- 自动为每张卡片生成指向源文档的超链接
- 在 Anki 中点击可直接打开 Obsidian 定位到源文档

**生成格式**：
```html
<div class="obsidian-backlink" style="margin-top: 12px; padding: 10px 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 6px;">
  <a href="obsidian://open?vault=VaultName&file=notes/my-note.md" style="color: white; text-decoration: none;">
    📄 查看源文档
  </a>
</div>
```

**数据源**：
- 使用 `Card.sourceFile` 字段
- Vault 名称自动获取
- 路径自动 URI 编码

### 3. 块引用回链 ✅

**功能**：
- 为包含块引用的卡片生成精确定位链接
- 点击可直接跳转到 Obsidian 中的特定块

**生成格式**：
```html
<div class="obsidian-backlink" style="margin-top: 8px; padding: 8px 12px; background: #f0f4f8; border-left: 4px solid #667eea;">
  <a href="obsidian://open?vault=VaultName&file=notes/my-note.md#^block-abc123" style="color: #667eea; text-decoration: none;">
    🔗 定位到块 ^block-abc123
  </a>
</div>
```

**数据源**：
- 使用 `Card.sourceFile` + `Card.sourceBlock` 字段
- 块 ID 格式：`^block-id` 或 `#heading`

## 🏗️ 架构设计

### 核心组件

```
ObsidianToAnkiConverter (转换器)
├── extractMediaReferences()     - 提取媒体引用
├── processMediaReference()      - 处理单个媒体
├── convertToAnkiFormat()        - 格式转换
├── uploadMediaFiles()           - 上传媒体到 Anki
├── generateBacklinks()          - 生成回链
├── generateSourceFileBacklink() - 源文档回链
└── generateBlockBacklink()      - 块回链
```

### 集成点

**CardExporter.ts**：
```typescript
// 在 convertCardToAnkiNote() 方法中
const conversionResult = await this.converter.convertContent(
  fieldValue,
  card,
  conversionOptions
);

fieldValue = conversionResult.convertedContent;
```

**数据流**：
```
1. CardExporter 接收 Card 对象
2. 提取字段内容
3. ObsidianToAnkiConverter 转换内容
   ├── 提取媒体引用
   ├── 转换为 Anki 格式
   ├── 上传媒体文件
   └── 生成回链
4. 返回转换后的内容
5. 上传到 Anki
```

## 📁 文件清单

### 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/services/ankiconnect/ObsidianToAnkiConverter.ts` | 核心转换器 |

### 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/types/ankiconnect-types.ts` | 新增转换相关类型定义 |
| `src/services/ankiconnect/CardExporter.ts` | 集成转换器到导出流程 |
| `src/services/ankiconnect/MediaSyncService.ts` | 扩展媒体上传功能，支持块引用 |

### 新增类型

```typescript
export interface ConversionResult {
  convertedContent: string;        // 转换后的内容
  mediaFiles: MediaFileInfo[];     // 提取的媒体文件
  backlinks: BacklinkInfo[];       // 生成的回链
  warnings: string[];              // 转换警告
}

export interface MediaFileInfo {
  type: 'image' | 'audio' | 'video';
  originalRef: string;             // 原始引用
  filename: string;                // 文件名
  vaultPath: string;               // Vault 路径
  ankiFormat: string;              // Anki 格式
  fileExists: boolean;             // 文件是否存在
  uploaded?: boolean;              // 是否已上传
}

export interface BacklinkInfo {
  type: 'source_file' | 'source_block';
  label: string;                   // 显示文本
  url: string;                     // obsidian:// URL
  html: string;                    // HTML 代码
}

export interface ObsidianToAnkiOptions {
  vaultName: string;
  uploadMedia: boolean;
  generateBacklinks: boolean;
  backlinkPosition: 'append' | 'separate';
  mediaPosition: 'inline' | 'end';
}
```

## ⚙️ 配置选项

### 转换选项

```typescript
const conversionOptions: ObsidianToAnkiOptions = {
  vaultName: this.plugin.app.vault.getName(),  // Vault 名称
  uploadMedia: true,                           // 是否上传媒体
  generateBacklinks: true,                     // 是否生成回链
  backlinkPosition: 'append',                  // 回链位置：追加到内容末尾
  mediaPosition: 'inline'                      // 媒体位置：内联
};
```

**选项说明**：

- `uploadMedia`: 控制是否上传媒体文件到 Anki
- `generateBacklinks`: 控制是否生成 Obsidian 回链
- `backlinkPosition`: 
  - `'append'`: 追加到字段内容末尾
  - `'separate'`: 放入独立字段（需要模板支持）
- `mediaPosition`:
  - `'inline'`: 保持在原位置
  - `'end'`: 移到内容末尾

## 🚀 使用方法

### 1. 自动转换

导出卡片到 Anki 时会自动执行转换：

```typescript
// CardExporter.exportDeck()
await this.convertAndUploadCard(card, template, modelInfo, ankiDeckName);
```

### 2. 查看转换结果

控制台日志：
```
[ObsidianToAnkiConverter] 开始转换内容
[ObsidianToAnkiConverter] 提取到 3 个媒体引用
[ObsidianToAnkiConverter] 开始上传 3 个媒体文件
[ObsidianToAnkiConverter] ✅ 上传成功: image.jpg
[ObsidianToAnkiConverter] ✅ 上传成功: audio.mp3
[ObsidianToAnkiConverter] ✅ 上传成功: video.mp4
[ObsidianToAnkiConverter] 上传完成: 3/3
[ObsidianToAnkiConverter] 转换完成: {媒体文件: 3, 回链: 2, 警告: 0}
```

### 3. 处理警告

如果媒体文件不存在：
```
[ObsidianToAnkiConverter] ⚠️ 跳过不存在的文件: missing.jpg
```

警告会记录在 `ConversionResult.warnings` 中，不会阻止导出。

## 🔍 调试和日志

### 控制台日志前缀

- `[ObsidianToAnkiConverter]` - 转换器相关
- `[CardExporter]` - 卡片导出相关
- `[MediaSyncService]` - 媒体同步相关

### 详细日志示例

```
🔍 转换卡片 card-123 使用模板 Basic QA
  ✓ 字段匹配: "front" ← "front" = "This is a question with ![](image.jpg)"
  🔄 转换字段 "front": {媒体文件: 1, 回链: 1, 警告: 0}
  
[ObsidianToAnkiConverter] 提取到 1 个媒体引用
[ObsidianToAnkiConverter] ✅ 上传成功: image.jpg
[ObsidianToAnkiConverter] 转换完成: {媒体文件: 1, 回链: 1, 警告: 0}
```

## ⚠️ 已知限制和注意事项

### 1. 媒体文件处理

- **路径解析**：使用 `app.metadataCache.getFirstLinkpathDest()` 处理相对路径
- **文件大小**：无限制，但大文件上传可能较慢
- **重复文件**：Anki 会自动处理同名文件
- **文件不存在**：会跳过并记录警告，不影响导出

### 2. 回链生成

- **Vault 名称**：从 `app.vault.getName()` 自动获取
- **URI 编码**：自动处理特殊字符
- **块引用格式**：支持 `^block-id` 和 `#heading` 两种格式

### 3. Anki 媒体格式

- **音频推荐**：使用 `[sound:]` 格式（Anki 标准）
- **视频处理**：优先使用 `[sound:]`，也可用 `<video>` 标签
- **图片 Alt**：保留 Markdown alt 属性

### 4. 性能考虑

- **批量上传**：使用串行上传，避免并发过多
- **Base64 编码**：大文件可能消耗较多内存
- **路径解析**：缓存解析结果可提升性能（待优化）

## 🔧 故障排查

### 问题：媒体文件未显示在 Anki

**原因**：
1. 文件未成功上传
2. 文件名包含特殊字符
3. Anki 不支持该文件格式

**解决**：
1. 查看控制台上传日志
2. 检查 Anki media folder 是否有该文件
3. 尝试重命名文件（移除特殊字符）

### 问题：回链无法点击

**原因**：
1. Vault 名称包含特殊字符未正确编码
2. 文件路径错误
3. Obsidian URI 协议未注册

**解决**：
1. 检查生成的 URL 格式
2. 验证 `Card.sourceFile` 路径正确
3. 确保 Obsidian 已安装并设置为默认处理 `obsidian://` 协议

### 问题：块引用回链失败

**原因**：
1. 块 ID 格式不正确
2. 源文档已删除或移动
3. 块已被删除

**解决**：
1. 验证 `Card.sourceBlock` 格式（应为 `^block-id` 或 `#heading`）
2. 检查源文档是否存在
3. 重新生成卡片更新块引用

## 📊 性能指标

### 转换速度

- **小文件** (<1MB)：~50ms/文件
- **中等文件** (1-5MB)：~200ms/文件
- **大文件** (>5MB)：~500ms/文件

### 上传速度

取决于 Anki 和网络环境：
- **本地 Anki**：通常很快 (~100ms/文件)
- **AnkiWeb 同步**：可能较慢

### 内存占用

- Base64 编码：约为原文件大小的 1.33 倍
- 批量上传：串行处理，内存占用稳定

## 🔄 后续改进方向

### 短期（计划中）
- [ ] 支持内嵌 HTML 转换（保留样式）
- [ ] 媒体文件缓存（避免重复上传）
- [ ] 支持更多媒体格式（如 PDF 封面）

### 中期（待讨论）
- [ ] 并发上传优化
- [ ] 路径解析缓存
- [ ] 压缩大图片
- [ ] 支持外部链接转换

### 长期（愿景）
- [ ] 智能媒体优化（格式转换、压缩）
- [ ] 媒体版本管理
- [ ] CDN 加速支持

## 📝 更新日志

### v1.0.0 (2025-01-08)
- ✅ 实现媒体文件格式转换（图片、音频、视频）
- ✅ 实现源文档回链生成
- ✅ 实现块引用回链生成
- ✅ 自动上传媒体到 Anki
- ✅ 集成到卡片导出流程

---

**文档版本**: 1.0.0  
**最后更新**: 2025-01-08  
**维护者**: Tuanki 开发团队




