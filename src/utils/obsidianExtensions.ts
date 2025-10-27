/**
 * Obsidian 特有语法扩展
 */

import type { Extension } from "@codemirror/state";
import { EditorView, Decoration, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, RangeSet } from "@codemirror/state";
import type AnkiPlugin from "../main";
import { createImagePasteExtension } from "./imagePasteExtension";

/**
 * Obsidian 扩展配置接口
 */
export interface ObsidianExtensionConfig {
  enableLinks?: boolean;
  enableTags?: boolean;
  enableCallouts?: boolean;
  enableMath?: boolean;
  enableImagePaste?: boolean;
}

/**
 * Obsidian 扩展管理器
 */
export class ObsidianExtensions {
  constructor(
    private plugin: AnkiPlugin,
    private config: ObsidianExtensionConfig = {}
  ) {}

  /**
   * 创建所有 Obsidian 扩展
   */
  create(): Extension[] {
    const extensions: Extension[] = [];

    console.log('🔧 创建Obsidian扩展，配置:', this.config);

    // 根据配置选择性启用扩展
    if (this.config.enableLinks !== false) {
      extensions.push(this.wikiLinksExtension());
      console.log('✅ Wiki链接扩展已添加');
    }

    if (this.config.enableTags !== false) {
      extensions.push(this.tagsExtension());
      console.log('✅ 标签扩展已添加');
    }

    if (this.config.enableCallouts !== false) {
      extensions.push(this.calloutsExtension());
      console.log('✅ Callouts扩展已添加');
    }

    if (this.config.enableMath !== false) {
      extensions.push(this.mathExtension());
      console.log('✅ 数学公式扩展已添加');
    }

    if (this.config.enableImagePaste !== false) {
      const mediaPasteExt = this.imagePasteExtension();
      extensions.push(mediaPasteExt);
      console.log('✅ 媒体文件粘贴扩展已添加:', mediaPasteExt);
    } else {
      console.log('❌ 媒体文件粘贴扩展被禁用');
    }

    // 始终添加主题样式
    extensions.push(this.obsidianTheme());
    console.log('✅ Obsidian主题已添加');

    console.log('🎯 总共创建了', extensions.length, '个扩展');
    return extensions;
  }

  /**
   * Wiki 链接扩展 [[链接]]
   */
  private wikiLinksExtension(): Extension {
    return ViewPlugin.fromClass(class {
      decorations: RangeSet<Decoration>;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): RangeSet<Decoration> {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;
        const text = doc.toString();

        // 匹配 [[链接]] 语法
        const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
        let match;

        while ((match = wikiLinkRegex.exec(text)) !== null) {
          const from = match.index;
          const to = match.index + match[0].length;
          const linkText = match[1];

          // 检查是否在可见范围内
          if (to < view.viewport.from || from > view.viewport.to) continue;

          builder.add(
            from,
            to,
            Decoration.mark({
              class: 'cm-wiki-link',
              attributes: {
                'data-link': linkText,
                'title': `链接到: ${linkText}`,
                'role': 'link',
              },
            })
          );
        }

        return builder.finish();
      }
    }, {
      decorations: v => v.decorations,
    });
  }

  /**
   * 标签扩展 #标签
   */
  private tagsExtension(): Extension {
    return ViewPlugin.fromClass(class {
      decorations: RangeSet<Decoration>;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): RangeSet<Decoration> {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;
        const text = doc.toString();

        // 匹配 #标签 语法（不在代码块中）
        const tagRegex = /(?:^|\s)(#[a-zA-Z0-9\u4e00-\u9fff/_-]+)/g;
        let match;

        while ((match = tagRegex.exec(text)) !== null) {
          const fullMatch = match[0];
          const tagMatch = match[1];
          const from = match.index + (fullMatch.length - tagMatch.length);
          const to = from + tagMatch.length;

          // 检查是否在可见范围内
          if (to < view.viewport.from || from > view.viewport.to) continue;

          // 简单检查是否在代码块中（更完整的实现需要语法树）
          const lineStart = doc.lineAt(from).from;
          const lineText = doc.sliceString(lineStart, doc.lineAt(from).to);
          if (lineText.includes('`') && lineText.indexOf('`') < from - lineStart) continue;

          builder.add(
            from,
            to,
            Decoration.mark({
              class: 'cm-tag',
              attributes: {
                'data-tag': tagMatch.slice(1), // 移除 # 前缀
                'title': `标签: ${tagMatch}`,
                'role': 'button',
              },
            })
          );
        }

        return builder.finish();
      }
    }, {
      decorations: v => v.decorations,
    });
  }

  /**
   * 标注块扩展 > [!note]
   */
  private calloutsExtension(): Extension {
    return ViewPlugin.fromClass(class {
      decorations: RangeSet<Decoration>;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): RangeSet<Decoration> {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;

        // 匹配标注块语法
        const calloutRegex = /^>\s*\[!(\w+)\](.*)$/gm;
        let match;

        while ((match = calloutRegex.exec(doc.toString())) !== null) {
          const from = match.index;
          const to = match.index + match[0].length;
          const calloutType = match[1].toLowerCase();
          const calloutTitle = match[2].trim();

          // 检查是否在可见范围内
          if (to < view.viewport.from || from > view.viewport.to) continue;

          builder.add(
            from,
            to,
            Decoration.mark({
              class: `cm-callout cm-callout-${calloutType}`,
              attributes: {
                'data-callout-type': calloutType,
                'data-callout-title': calloutTitle,
                'title': `${calloutType.toUpperCase()} 标注块`,
              },
            })
          );
        }

        return builder.finish();
      }
    }, {
      decorations: v => v.decorations,
    });
  }

  /**
   * 数学公式扩展 $$公式$$
   */
  private mathExtension(): Extension {
    return ViewPlugin.fromClass(class {
      decorations: RangeSet<Decoration>;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): RangeSet<Decoration> {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;
        const text = doc.toString();

        // 匹配行内数学公式 $公式$
        const inlineMathRegex = /\$([^$\n]+)\$/g;
        let match;

        while ((match = inlineMathRegex.exec(text)) !== null) {
          const from = match.index;
          const to = match.index + match[0].length;

          // 检查是否在可见范围内
          if (to < view.viewport.from || from > view.viewport.to) continue;

          builder.add(
            from,
            to,
            Decoration.mark({
              class: 'cm-math-inline',
              attributes: {
                'data-math': match[1],
                'title': `数学公式: ${match[1]}`,
              },
            })
          );
        }

        // 匹配块级数学公式 $$公式$$
        const blockMathRegex = /\$\$([\s\S]*?)\$\$/g;
        while ((match = blockMathRegex.exec(text)) !== null) {
          const from = match.index;
          const to = match.index + match[0].length;

          // 检查是否在可见范围内
          if (to < view.viewport.from || from > view.viewport.to) continue;

          builder.add(
            from,
            to,
            Decoration.mark({
              class: 'cm-math-block',
              attributes: {
                'data-math': match[1],
                'title': `数学公式块: ${match[1].slice(0, 50)}...`,
              },
            })
          );
        }

        return builder.finish();
      }
    }, {
      decorations: v => v.decorations,
    });
  }

  /**
   * 媒体文件粘贴扩展
   */
  private imagePasteExtension(): Extension {
    return createImagePasteExtension(this.plugin, {
      enabled: true,
      enableDrop: true,
      maxSizeMB: 50, // 增加到50MB以支持视频文件
      useWikiLinks: true,
      supportedImageFormats: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff'],
      supportedAudioFormats: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/m4a'],
      supportedVideoFormats: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/ogg'],
      supportedDocumentFormats: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    });
  }

  /**
   * Obsidian 主题样式
   */
  private obsidianTheme(): Extension {
    return EditorView.theme({
      // Wiki 链接样式
      '.cm-wiki-link': {
        color: 'var(--text-accent)',
        textDecoration: 'none',
        cursor: 'pointer',
        padding: '1px 2px',
        borderRadius: '3px',
        backgroundColor: 'var(--background-modifier-hover)',
        border: '1px solid transparent',
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: 'var(--background-modifier-border)',
          borderColor: 'var(--text-accent)',
        },
      },

      // 标签样式
      '.cm-tag': {
        color: 'var(--tag-color, var(--text-accent))',
        backgroundColor: 'var(--tag-background, var(--background-modifier-hover))',
        padding: '2px 6px',
        borderRadius: '12px',
        fontSize: '0.9em',
        fontWeight: '500',
        cursor: 'pointer',
        border: '1px solid var(--tag-border, transparent)',
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: 'var(--tag-background-hover, var(--background-modifier-border))',
          borderColor: 'var(--tag-border-hover, var(--text-accent))',
        },
      },

      // 标注块样式
      '.cm-callout': {
        display: 'block',
        padding: '8px 12px',
        margin: '4px 0',
        borderLeft: '4px solid var(--callout-border, var(--text-accent))',
        backgroundColor: 'var(--callout-background, var(--background-secondary))',
        borderRadius: '0 4px 4px 0',
        fontWeight: '500',
      },

      '.cm-callout-note': {
        borderLeftColor: 'var(--color-blue)',
        backgroundColor: 'var(--background-modifier-hover)',
      },

      '.cm-callout-tip': {
        borderLeftColor: 'var(--color-green)',
        backgroundColor: 'var(--background-modifier-hover)',
      },

      '.cm-callout-warning': {
        borderLeftColor: 'var(--color-orange)',
        backgroundColor: 'var(--background-modifier-hover)',
      },

      '.cm-callout-danger': {
        borderLeftColor: 'var(--color-red)',
        backgroundColor: 'var(--background-modifier-hover)',
      },

      // 数学公式样式
      '.cm-math-inline': {
        color: 'var(--text-accent)',
        backgroundColor: 'var(--background-modifier-hover)',
        padding: '1px 4px',
        borderRadius: '3px',
        fontFamily: 'var(--font-monospace)',
        fontSize: '0.95em',
      },

      '.cm-math-block': {
        display: 'block',
        color: 'var(--text-accent)',
        backgroundColor: 'var(--background-secondary)',
        padding: '8px 12px',
        margin: '8px 0',
        borderRadius: '6px',
        fontFamily: 'var(--font-monospace)',
        fontSize: '0.95em',
        borderLeft: '3px solid var(--text-accent)',
      },
    });
  }
}

/**
 * 创建 Obsidian 扩展的便捷函数
 */
export function createObsidianExtensions(
  plugin: AnkiPlugin,
  config: ObsidianExtensionConfig = {}
): Extension[] {
  const extensions = new ObsidianExtensions(plugin, config);
  return extensions.create();
}
