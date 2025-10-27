<script lang="ts">
  import type { PluginExtended, EditorSettings } from '../types/settings-types';
  import { updateSettings, getSettingsValue } from '../utils/settings-utils';
  import { 
    CSS_CLASSES, 
    LINK_STYLE_OPTIONS, 
    LINK_PATH_OPTIONS, 
    LINK_PATH_DISPLAY_MAP,
    DEFAULT_SETTINGS 
  } from '../constants/settings-constants';
  import Dropdown from "../../ui/Dropdown.svelte";
  
  // 🌍 导入国际化
  import { tr } from '../../../utils/i18n';

  interface Props {
    plugin: PluginExtended;
    onSave: () => Promise<void>;
  }

  let { plugin, onSave }: Props = $props();
  
  // 🌍 响应式翻译函数
  let t = $derived($tr);

  // 获取编辑器设置，如果不存在则使用默认值
  let editorSettings = $derived.by(() => {
    return getSettingsValue<EditorSettings>(plugin.settings, 'editor', {
      linkStyle: 'wikilink',
      linkPath: 'short',
      preferAlias: true,
      attachmentDir: DEFAULT_SETTINGS.ATTACHMENT_DIR,
      embedImages: true
    });
  });

  // 更新编辑器设置
  async function updateEditorSetting<K extends keyof EditorSettings>(
    key: K, 
    value: EditorSettings[K]
  ) {
    plugin.settings = updateSettings(plugin.settings, `editor.${key}`, value);
    await onSave();
  }

  // 链接样式选项处理
  const linkStyleDropdownItems = LINK_STYLE_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
    onClick: () => updateEditorSetting('linkStyle', option.id as 'wikilink' | 'markdown')
  }));

  // 链接路径选项处理
  const linkPathDropdownItems = LINK_PATH_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
    onClick: () => updateEditorSetting('linkPath', option.id as 'short' | 'relative' | 'absolute')
  }));

  // 获取当前链接样式显示文本
  function getLinkStyleDisplayText(): string {
    return editorSettings.linkStyle === 'markdown' ? 'Markdown' : 'Wikilink';
  }

  // 获取当前链接路径显示文本
  function getLinkPathDisplayText(): string {
    const key = editorSettings.linkPath || 'short';
    return LINK_PATH_DISPLAY_MAP[key] || '最短';
  }

  // 处理复选框变化
  function handleCheckboxChange(key: keyof EditorSettings, event: Event) {
    const target = event.target as HTMLInputElement;
    updateEditorSetting(key, target.checked);
  }

  // 处理文本输入变化
  function handleTextInputChange(key: keyof EditorSettings, event: Event) {
    const target = event.target as HTMLInputElement;
    updateEditorSetting(key, target.value || DEFAULT_SETTINGS.ATTACHMENT_DIR);
  }
</script>

<div class="tuanki-settings settings-section editor-settings">
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-blue">{t('editor.title')}</h4>
    <p class="section-description">{t('editor.description')}</p>
  
    <div class="group-content">
    <!-- 编辑器模式说明 -->
    <div class="row">
      <div class="row-label">编辑器模式</div>
      <div class="settings-info">
        <span class="mode-indicator">📝 Markdown 模式</span>
        <small class="settings-note">统一使用Markdown格式进行卡片编辑</small>
      </div>
    </div>

    <!-- 链接样式设置 -->
    <div class="row">
      <div class="row-label">{t('editor.linkStyle.label')}</div>
      <span>
        <Dropdown 
          items={linkStyleDropdownItems}
          buttonText={getLinkStyleDisplayText()} 
          buttonIcon="chevronDown" 
        />
      </span>
    </div>

    <!-- 链接路径设置 -->
    <div class="row">
      <div class="row-label">{t('editor.linkPath.label')}</div>
      <span>
        <Dropdown 
          items={linkPathDropdownItems}
          buttonText={getLinkPathDisplayText()} 
          buttonIcon="chevronDown" 
        />
      </span>
    </div>

    <!-- 优先使用别名 -->
    <div class="row">
      <label for="preferAlias">优先使用别名</label>
      <label class="modern-switch">
        <input 
          id="preferAlias"
          type="checkbox"
          checked={editorSettings.preferAlias ?? true}
          onchange={(e) => handleCheckboxChange('preferAlias', e)}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <!-- 附件目录设置 -->
    <div class="row">
      <label for="attachDir">附件目录</label>
      <input 
        id="attachDir" 
        type="text" 
        value={editorSettings.attachmentDir || DEFAULT_SETTINGS.ATTACHMENT_DIR} 
        oninput={(e) => handleTextInputChange('attachmentDir', e)}
        placeholder={DEFAULT_SETTINGS.ATTACHMENT_DIR}
        class="modern-input"
      />
    </div>

    <!-- 嵌入图片 -->
    <div class="row">
      <label for="embedImages">自动嵌入图片</label>
      <label class="modern-switch">
        <input 
          id="embedImages"
          type="checkbox"
          checked={editorSettings.embedImages ?? true}
          onchange={(e) => handleCheckboxChange('embedImages', e)}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>
  </div>
</div>

<style>
  .row-label {
    width: 180px;
    color: var(--text-normal);
    font-weight: 500;
    flex-shrink: 0;
  }

  .settings-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .mode-indicator {
    font-weight: 500;
    color: var(--text-normal);
  }

  .settings-note {
    color: var(--text-muted);
    font-size: 0.875rem;
    line-height: 1.3;
  }
</style>
