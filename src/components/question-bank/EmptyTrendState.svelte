<script lang="ts">
  import { tr } from '../../utils/i18n';
  let t = $derived($tr);
</script>

<div class="empty-state">
  <div class="empty-icon">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  </div>
  <div class="empty-title">{t('study.questionBankUI.emptyTrend.title')}</div>
  <div class="empty-text">{t('study.questionBankUI.emptyTrend.text')}</div>
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    background: var(--background-secondary);
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    text-align: center;
  }

  .empty-icon {
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%);
    border-radius: 50%;
    margin-bottom: 24px;
    color: var(--text-muted);
    opacity: 0.5;
  }

  .empty-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .empty-text {
    font-size: 14px;
    color: var(--text-faint);
    line-height: 1.6;
    max-width: 300px;
  }
</style>
