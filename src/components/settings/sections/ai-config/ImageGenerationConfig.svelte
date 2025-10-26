<script lang="ts">
  interface Props {
    imageGeneration: {
      defaultSyntax: 'wiki' | 'markdown';
      attachmentDir: string;
      autoCreateSubfolders: boolean;
      includeTimestamp: boolean;
      includeCaption: boolean;
    };
  }

  let { imageGeneration = $bindable() }: Props = $props();
</script>

<div class="image-generation-config">
  <!-- 默认语法 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">默认图片语法</div>
      <div class="setting-item-description">
        选择插入图片时使用的默认语法格式
      </div>
    </div>
    <div class="setting-item-control">
      <select bind:value={imageGeneration.defaultSyntax} class="dropdown">
        <option value="wiki">Wiki链接 (![[image.png]])</option>
        <option value="markdown">Markdown (![](image.png))</option>
      </select>
    </div>
  </div>

  <!-- 附件目录 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">附件保存目录</div>
      <div class="setting-item-description">
        AI生成的图片将保存到这个目录下
      </div>
    </div>
    <div class="setting-item-control">
      <input
        type="text"
        bind:value={imageGeneration.attachmentDir}
        placeholder="attachments/ai-generated"
        class="text-input"
      />
    </div>
  </div>

  <!-- 自动创建子文件夹 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">自动创建子文件夹</div>
      <div class="setting-item-description">
        按日期自动创建子文件夹组织图片
      </div>
    </div>
    <div class="setting-item-control">
      <label class="modern-switch">
        <input
          type="checkbox"
          bind:checked={imageGeneration.autoCreateSubfolders}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>

  <!-- 包含时间戳 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">文件名包含时间戳</div>
      <div class="setting-item-description">
        在图片文件名中包含生成时间戳
      </div>
    </div>
    <div class="setting-item-control">
      <label class="modern-switch">
        <input
          type="checkbox"
          bind:checked={imageGeneration.includeTimestamp}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>

  <!-- 包含说明文字 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">自动添加图片说明</div>
      <div class="setting-item-description">
        在图片下方自动添加AI生成的说明文字
      </div>
    </div>
    <div class="setting-item-control">
      <label class="modern-switch">
        <input
          type="checkbox"
          bind:checked={imageGeneration.includeCaption}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>
</div>

<style>
  .image-generation-config {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .setting-item-info {
    flex: 1;
    min-width: 0;
  }

  .setting-item-name {
    font-size: 0.95em;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 4px;
  }

  .setting-item-description {
    font-size: 0.85em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .setting-item-control {
    flex-shrink: 0;
    min-width: 200px;
  }

  .text-input {
    width: 100%;
    padding: 6px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9em;
  }

  .text-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .dropdown {
    width: 100%;
    padding: 6px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9em;
  }

  .dropdown:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

</style>



