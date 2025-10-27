<script lang="ts">
  import type { GeneratedCard } from '../../types/ai-types';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';

  interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }

  interface Props {
    currentCard: GeneratedCard;
    onRegenerate: (instruction: string) => Promise<void>;
  }

  let { currentCard, onRegenerate }: Props = $props();

  // ===== 状态管理 =====
  let instruction = $state('');
  let messages = $state<Message[]>([]);
  let isRegenerating = $state(false);

  // ===== 提交修改要求 =====
  async function handleSubmit() {
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) return;

    // 添加用户消息
    const userMessage: Message = {
      role: 'user',
      content: trimmedInstruction,
      timestamp: new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      })
    };
    messages = [...messages, userMessage];

    // 清空输入框
    const currentInstruction = trimmedInstruction;
    instruction = '';

    try {
      isRegenerating = true;

      // 调用重新生成
      await onRegenerate(currentInstruction);

      // 添加AI响应
      const aiMessage: Message = {
        role: 'assistant',
        content: '已根据您的要求重新生成卡片，请查看更新后的内容。',
        timestamp: new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        })
      };
      messages = [...messages, aiMessage];
    } catch (error) {
      // 添加错误消息
      const errorMessage: Message = {
        role: 'assistant',
        content: `重新生成失败：${error instanceof Error ? error.message : '未知错误'}`,
        timestamp: new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        })
      };
      messages = [...messages, errorMessage];
    } finally {
      isRegenerating = false;
    }
  }

  // ===== 快捷键支持 =====
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleSubmit();
    }
  }

  // ===== 清空对话历史 =====
  function clearHistory() {
    messages = [];
  }
</script>

<div class="regenerate-dialog">
  <!-- 对话历史 -->
  {#if messages.length > 0}
    <div class="dialog-history">
      <div class="history-header">
        <span class="history-title">对话历史</span>
        <button class="clear-history-btn" onclick={clearHistory} title="清空历史">
          <ObsidianIcon name="trash-2" size={14} />
        </button>
      </div>
      <div class="messages">
        {#each messages as message}
          <div class="message" class:user={message.role === 'user'}>
            <div class="message-header">
              <span class="message-role">
                {message.role === 'user' ? '你' : 'AI助手'}
              </span>
              <span class="message-time">{message.timestamp}</span>
            </div>
            <div class="message-content">{message.content}</div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- 输入区 -->
  <div class="dialog-input">
    <div class="input-header">
      <ObsidianIcon name="edit-3" size={14} />
      <span>输入修改要求</span>
    </div>
    <textarea
      bind:value={instruction}
      onkeydown={handleKeydown}
      placeholder="例如：请增加更多细节；答案太简单，请扩展；问题需要更具体..."
      rows="4"
      disabled={isRegenerating}
    ></textarea>
    <div class="input-footer">
      <span class="hint">Ctrl+Enter 提交</span>
      <button
        class="submit-btn"
        onclick={handleSubmit}
        disabled={!instruction.trim() || isRegenerating}
      >
        <ObsidianIcon name="send" size={14} />
        <span>{isRegenerating ? '生成中...' : '重新生成'}</span>
      </button>
    </div>
  </div>
</div>

<style>
  .regenerate-dialog {
    background: var(--background-primary);
    border-radius: 12px;
    border: 2px solid var(--background-modifier-border);
    overflow: hidden;
    margin-top: 16px;
  }

  /* ===== 对话历史 ===== */
  .dialog-history {
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .history-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .clear-history-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    color: var(--text-muted);
    transition: all 0.2s;
    cursor: pointer;
  }

  .clear-history-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-error);
  }

  .messages {
    max-height: 300px;
    overflow-y: auto;
    padding: 12px;
  }

  .message {
    margin-bottom: 12px;
    padding: 12px;
    border-radius: 8px;
    background: var(--background-secondary);
  }

  .message.user {
    background: var(--color-accent-bg);
    margin-left: 20px;
  }

  .message:last-child {
    margin-bottom: 0;
  }

  .message-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .message-role {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .message.user .message-role {
    color: var(--text-accent);
  }

  .message-time {
    font-size: 11px;
    color: var(--text-faint);
  }

  .message-content {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-normal);
  }

  /* ===== 输入区 ===== */
  .dialog-input {
    padding: 16px;
  }

  .input-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
  }

  .dialog-input textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 14px;
    line-height: 1.6;
    resize: vertical;
    transition: all 0.2s;
  }

  .dialog-input textarea:focus {
    outline: none;
    border-color: var(--text-accent);
    background: var(--background-primary);
  }

  .dialog-input textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .input-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }

  .hint {
    font-size: 12px;
    color: var(--text-faint);
  }

  .submit-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 6px;
    background: var(--interactive-accent);
    color: white;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
    cursor: pointer;
  }

  .submit-btn:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ===== 滚动条样式 ===== */
  .messages::-webkit-scrollbar {
    width: 6px;
  }

  .messages::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 3px;
  }

  .messages::-webkit-scrollbar-track {
    background: transparent;
  }
</style>



