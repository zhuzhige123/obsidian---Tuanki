<!--
  自动规则配置模态窗
  职责：管理 auto-rules 插件的规则配置（增删改查 + 批量执行）
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Notice } from 'obsidian';
  import { logger } from '../../utils/logger';
  import { getV2PathsFromApp } from '../../config/paths';
  import type { WeavePlugin } from '../../main';
  import { saveMemoryDeck } from '../../services/weave-domain';
  import type { Deck } from '../../data/types';
  import { extractAllTags as extractTagsFromCardContent } from '../../utils/yaml-utils';

  interface Props {
    open: boolean;
    onClose: () => void;
    plugin: WeavePlugin;
  }

  let {
    open = $bindable(),
    onClose,
    plugin
  }: Props = $props();

  // ===== 规则类型 =====
  type RuleType = 'include' | 'exclusive' | 'exclude' | 'auto-deck-by-source' | 'auto-tag';

  interface AutoRule {
    id: string;
    type: RuleType;
    tag: string;
    deckId: string;
    deckName: string;
    enabled: boolean;
    sourcePattern?: string;
  }

  // ===== State =====
  let rules = $state<AutoRule[]>([]);
  let decks = $state<Deck[]>([]);
  let isLoadingRules = $state(true);
  let isLoadingDecks = $state(true);
  let isExecuting = $state(false);
  let executionLog = $state<string[]>([]);

  // 新建规则表单
  let newRuleType = $state<RuleType>('include');
  let newRuleTag = $state('');
  let newRuleDeckId = $state('');
  let newRuleSourcePattern = $state('');
  let showAddForm = $state(false);

  // 编辑模式
  let editingRuleId = $state<string | null>(null);
  let editType = $state<RuleType>('include');
  let editTag = $state('');
  let editDeckId = $state('');
  let editSourcePattern = $state('');

  // ===== 数据路径 =====
  function getDataPath(): string {
    const paths = getV2PathsFromApp(plugin.app);
    return `${paths.root}/plugins/auto-rules/data.json`;
  }

  // ===== 加载规则 =====
  async function loadRules() {
    isLoadingRules = true;
    try {
      const adapter = plugin.app.vault.adapter;
      const dataPath = getDataPath();
      const exists = await adapter.exists(dataPath);
      if (!exists) {
        rules = [];
        return;
      }
      const raw = await adapter.read(dataPath);
      const data = JSON.parse(raw);
      let loaded = data.rules || [];
      // 去重：按 id 去重，保留最后一个
      const seen = new Map<string, typeof loaded[0]>();
      for (const r of loaded) {
        seen.set(r.id, r);
      }
      rules = Array.from(seen.values());
    } catch (err) {
      logger.error('[AutoRulesConfig] Failed to load rules:', err);
      rules = [];
    } finally {
      isLoadingRules = false;
    }
  }

  // ===== 保存规则 =====
  async function saveRules() {
    try {
      const adapter = plugin.app.vault.adapter;
      const dataPath = getDataPath();
      await adapter.write(dataPath, JSON.stringify({ rules }, null, 2));
    } catch (err) {
      logger.error('[AutoRulesConfig] Failed to save rules:', err);
      new Notice('规则保存失败');
    }
  }

  // ===== 加载牌组 =====
  async function loadDecks() {
    isLoadingDecks = true;
    try {
      decks = await plugin.dataStorage.getAllDecks();
    } catch (err) {
      logger.error('[AutoRulesConfig] Failed to load decks:', err);
      decks = [];
    } finally {
      isLoadingDecks = false;
    }
  }

  // ===== 规则是否需要标签字段 =====
  function ruleNeedsTag(type: RuleType): boolean {
    return type !== 'auto-deck-by-source';
  }

  // ===== 规则是否需要来源模式字段 =====
  function ruleNeedsSource(type: RuleType): boolean {
    return type === 'auto-deck-by-source';
  }

  // ===== 添加规则 =====
  function handleAddRule() {
    if (ruleNeedsTag(newRuleType) && !newRuleTag.trim()) {
      new Notice('请输入标签名');
      return;
    }
    if (ruleNeedsSource(newRuleType) && !newRuleSourcePattern.trim()) {
      new Notice('请输入来源文件匹配模式');
      return;
    }
    if (!newRuleDeckId) {
      new Notice('请选择目标牌组');
      return;
    }

    const deck = decks.find(d => d.id === newRuleDeckId);
    const rule: AutoRule = {
      id: 'rule_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      type: newRuleType,
      tag: newRuleTag.trim(),
      deckId: newRuleDeckId,
      deckName: deck?.name || newRuleDeckId,
      enabled: true
    };

    if (ruleNeedsSource(newRuleType)) {
      rule.sourcePattern = newRuleSourcePattern.trim();
    }

    rules = [...rules, rule];
    saveRules();

    // 重置表单
    newRuleTag = '';
    newRuleDeckId = '';
    newRuleSourcePattern = '';
    newRuleType = 'include';
    showAddForm = false;

    new Notice('规则已添加');
  }

  // ===== 删除规则 =====
  function handleDeleteRule(ruleId: string) {
    rules = rules.filter(r => r.id !== ruleId);
    saveRules();
  }

  // ===== 切换规则启用状态 =====
  function handleToggleRule(ruleId: string) {
    rules = rules.map(r => {
      if (r.id === ruleId) return { ...r, enabled: !r.enabled };
      return r;
    });
    saveRules();
  }

  // ===== 开始编辑 =====
  function startEdit(rule: AutoRule) {
    editingRuleId = rule.id;
    editType = rule.type;
    editTag = rule.tag;
    editDeckId = rule.deckId;
    editSourcePattern = rule.sourcePattern || '';
  }

  // ===== 保存编辑 =====
  function saveEdit() {
    if (!editDeckId) return;
    if (ruleNeedsTag(editType) && !editTag.trim()) return;
    if (ruleNeedsSource(editType) && !editSourcePattern.trim()) return;

    const deck = decks.find(d => d.id === editDeckId);
    rules = rules.map(r => {
      if (r.id === editingRuleId) {
        return {
          ...r,
          type: editType,
          tag: editTag.trim(),
          deckId: editDeckId,
          deckName: deck?.name || editDeckId,
          sourcePattern: ruleNeedsSource(editType) ? editSourcePattern.trim() : undefined
        };
      }
      return r;
    });
    saveRules();
    editingRuleId = null;
  }

  // ===== 取消编辑 =====
  function cancelEdit() {
    editingRuleId = null;
  }

  // ===== 标签提取：同时从 card.tags 和 content 内联标签 #xxx 中获取 =====
  function extractAllTags(card: any): string[] {
    const tagSet = new Set<string>();

    // 1. card.tags 数组（运行时 hydrate 的结果）
    if (Array.isArray(card.tags)) {
      for (const t of card.tags) {
        if (typeof t === 'string') tagSet.add(t.replace(/^#/, ''));
      }
    }

    // 2. content 中的 YAML tags + 正文内联标签（统一复用共享提取器）
    if (typeof card.content === 'string') {
      for (const tag of extractTagsFromCardContent(card.content)) {
        if (typeof tag === 'string') {
          tagSet.add(tag.replace(/^#/, ''));
        }
      }
    }

    return Array.from(tagSet).filter(Boolean);
  }

  // ===== 从卡片中提取来源文件路径 =====
  function extractSource(card: any): string {
    if (card.sourceFile) return card.sourceFile;
    if (typeof card.content === 'string') {
      const ym = card.content.match(/^---\n([\s\S]*?)\n---/);
      if (ym) {
        const sm = ym[1].match(/^source:\s*(.+)/m);
        if (sm) return sm[1].trim();
      }
    }
    return '';
  }

  // ===== 来源模式匹配 =====
  function matchSourcePattern(source: string, pattern: string): boolean {
    if (!source || !pattern) return false;
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$', 'i');
      return regex.test(source);
    }
    return source.toLowerCase().includes(pattern.toLowerCase());
  }

  // ===== 批量执行所有规则 =====
  async function executeAllRules() {
    const enabledRules = rules.filter(r => r.enabled);
    if (enabledRules.length === 0) {
      new Notice('没有已启用的规则');
      return;
    }

    isExecuting = true;
    executionLog = [];
    const addLog = (msg: string) => { executionLog = [...executionLog, msg]; };

    addLog(`开始执行 ${enabledRules.length} 条规则...`);

    try {
      const allCards = await plugin.dataStorage.getCards();
      addLog(`已加载 ${allCards.length} 张卡片`);

      let totalActions = 0;

      for (const rule of enabledRules) {
        addLog(`--- 处理规则: [${getRuleTypeLabel(rule.type)}] ${rule.sourcePattern ? '来源="' + rule.sourcePattern + '"' : '标签="' + rule.tag + '"'} -> 牌组="${rule.deckName}" ---`);

        const deck = await plugin.dataStorage.getDeck(rule.deckId);
        if (!deck) {
          addLog(`  牌组 ${rule.deckName} 不存在，跳过`);
          continue;
        }
        const deckCardUUIDs = new Set<string>(deck.cardUUIDs || []);

        if (rule.type === 'include' || rule.type === 'exclude' || rule.type === 'exclusive') {
          const ruleTag = rule.tag.replace(/^#/, '');
          const matchedCards = allCards.filter((c: any) => extractAllTags(c).includes(ruleTag));
          addLog(`  匹配卡片: ${matchedCards.length} 张`);

          if (rule.type === 'include') {
            let added = 0;
            for (const card of matchedCards) {
              if (!deckCardUUIDs.has(card.uuid)) {
                deckCardUUIDs.add(card.uuid);
                added++;
              }
            }
            if (added > 0) {
              deck.cardUUIDs = Array.from(deckCardUUIDs);
              deck.modified = new Date().toISOString();
              await saveMemoryDeck(plugin, deck, 'update');
              addLog(`  已引入 ${added} 张卡片`);
              totalActions += added;
            } else {
              addLog(`  无需操作（已全部引入）`);
            }
          } else if (rule.type === 'exclude') {
            let removed = 0;
            for (const card of matchedCards) {
              if (deckCardUUIDs.has(card.uuid)) {
                deckCardUUIDs.delete(card.uuid);
                removed++;
              }
            }
            if (removed > 0) {
              deck.cardUUIDs = Array.from(deckCardUUIDs);
              deck.modified = new Date().toISOString();
              await saveMemoryDeck(plugin, deck, 'update');
              addLog(`  已从牌组移除 ${removed} 张卡片`);
              totalActions += removed;
            } else {
              addLog(`  无需操作（无匹配卡片在牌组中）`);
            }
          } else if (rule.type === 'exclusive') {
            let addedToTarget = 0;
            for (const card of matchedCards) {
              if (!deckCardUUIDs.has(card.uuid)) {
                deckCardUUIDs.add(card.uuid);
                addedToTarget++;
              }
            }
            if (addedToTarget > 0) {
              deck.cardUUIDs = Array.from(deckCardUUIDs);
              deck.modified = new Date().toISOString();
              await saveMemoryDeck(plugin, deck, 'update');
              addLog(`  已引入 ${addedToTarget} 张卡片到目标牌组`);
              totalActions += addedToTarget;
            }

            const matchedUUIDs = new Set(matchedCards.map((c: any) => c.uuid));
            let removedFromOthers = 0;
            for (const otherDeck of decks) {
              if (otherDeck.id === rule.deckId) continue;
              const otherUUIDs = otherDeck.cardUUIDs || [];
              const filtered = otherUUIDs.filter((uuid: string) => !matchedUUIDs.has(uuid));
              if (filtered.length < otherUUIDs.length) {
                const removed = otherUUIDs.length - filtered.length;
                otherDeck.cardUUIDs = filtered;
                otherDeck.modified = new Date().toISOString();
                await saveMemoryDeck(plugin, otherDeck, 'update');
                removedFromOthers += removed;
              }
            }
            if (removedFromOthers > 0) {
              addLog(`  已从其他牌组移除 ${removedFromOthers} 个引用`);
              totalActions += removedFromOthers;
            } else {
              addLog(`  无需从其他牌组移除`);
            }
          }
        } else if (rule.type === 'auto-deck-by-source') {
          const pattern = rule.sourcePattern || '';
          const matchedCards = allCards.filter((c: any) => matchSourcePattern(extractSource(c), pattern));
          addLog(`  匹配卡片: ${matchedCards.length} 张`);

          let added = 0;
          for (const card of matchedCards) {
            if (!deckCardUUIDs.has(card.uuid)) {
              deckCardUUIDs.add(card.uuid);
              added++;
            }
          }
          if (added > 0) {
            deck.cardUUIDs = Array.from(deckCardUUIDs);
            deck.modified = new Date().toISOString();
            await saveMemoryDeck(plugin, deck, 'update');
            addLog(`  已引入 ${added} 张卡片`);
            totalActions += added;
          } else {
            addLog(`  无需操作`);
          }
        } else if (rule.type === 'auto-tag') {
          const tagToAdd = rule.tag.replace(/^#/, '');
          const cardsInDeck = allCards.filter((c: any) => deckCardUUIDs.has(c.uuid));
          addLog(`  牌组内卡片: ${cardsInDeck.length} 张`);

          let tagged = 0;
          for (const card of cardsInDeck) {
            const currentTags = extractAllTags(card);
            if (!currentTags.includes(tagToAdd)) {
              if (!card.tags) card.tags = [];
              card.tags.push(tagToAdd);
              card.modified = new Date().toISOString();
              await plugin.dataStorage.saveCard(card);
              tagged++;
            }
          }
          if (tagged > 0) {
            addLog(`  已为 ${tagged} 张卡片添加标签 #${tagToAdd}`);
            totalActions += tagged;
          } else {
            addLog(`  无需操作（所有卡片已有此标签）`);
          }
        }
      }

      addLog(`执行完成，共 ${totalActions} 个操作`);
      new Notice(`规则执行完成，共 ${totalActions} 个操作`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addLog(`执行失败: ${errMsg}`);
      new Notice('规则执行失败');
      logger.error('[AutoRulesConfig] Execution failed:', err);
    } finally {
      isExecuting = false;
    }
  }

  // ===== 规则类型标签 =====
  function getRuleTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'include': '自动引入',
      'exclusive': '独占限制',
      'exclude': '排除',
      'auto-deck-by-source': '按来源分组',
      'auto-tag': '自动标记'
    };
    return labels[type] || type;
  }

  function getRuleTypeClass(type: string): string {
    const classes: Record<string, string> = {
      'include': 'type-include',
      'exclusive': 'type-exclusive',
      'exclude': 'type-exclude',
      'auto-deck-by-source': 'type-source',
      'auto-tag': 'type-autotag'
    };
    return classes[type] || 'type-include';
  }

  // ===== 规则描述提示 =====
  function getRuleTypeHint(type: RuleType): string {
    const hints: Record<string, string> = {
      'include': '带有此标签的卡片将自动被目标牌组引入使用',
      'exclusive': '带有此标签的卡片只能被目标牌组使用，会自动从其他牌组移除',
      'exclude': '带有此标签的卡片将自动从目标牌组中移除',
      'auto-deck-by-source': '来自匹配文件的卡片将自动归入目标牌组',
      'auto-tag': '属于目标牌组的卡片将自动添加指定标签'
    };
    return hints[type] || '';
  }

  // ===== Portal 挂载 =====
  let portalTarget: HTMLDivElement | null = null;

  function mountPortal() {
    if (portalTarget) return;
    portalTarget = activeDocument.createElement('div');
    portalTarget.className = 'weave-auto-rules-portal';
    activeDocument.body.appendChild(portalTarget);
  }

  function unmountPortal() {
    if (portalTarget && portalTarget.parentNode) {
      portalTarget.parentNode.removeChild(portalTarget);
      portalTarget = null;
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      open = false;
      onClose();
    }
  }

  function handleCloseBtn() {
    open = false;
    onClose();
  }

  function handleKeydown(_e: KeyboardEvent) {
  }

  // ===== 初始化 =====
  onMount(() => {
    loadRules();
    loadDecks();
  });

  onDestroy(() => {
    unmountPortal();
  });

  $effect(() => {
    if (open) {
      mountPortal();
    } else {
      unmountPortal();
    }
  });
</script>

{#if open}
<div class="ar-overlay">
  <button
    type="button"
    class="ar-backdrop"
    aria-label="关闭"
    onclick={handleOverlayClick}
  ></button>
  <div class="ar-modal" role="dialog" aria-modal="true" tabindex="-1" onkeydown={handleKeydown}>
    <header class="ar-header">
      <h2 class="ar-title"><span class="ar-accent-bar"></span>自动规则配置</h2>
      <button class="ar-close" onclick={handleCloseBtn} aria-label="关闭">✕</button>
    </header>
    <div class="auto-rules-config">
    <!-- 顶部操作栏 -->
    <div class="config-toolbar">
      <button
        class="toolbar-btn primary"
        onclick={() => { showAddForm = !showAddForm; }}
      >
        {#if showAddForm}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          取消
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          添加规则
        {/if}
      </button>
      <button
        class="toolbar-btn execute"
        onclick={executeAllRules}
        disabled={isExecuting || rules.filter(r => r.enabled).length === 0}
      >
        {#if isExecuting}
          <span class="spinner-sm"></span>
          执行中...
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          执行全部规则
        {/if}
      </button>
      <span class="rule-count">{rules.length} 条规则，{rules.filter(r => r.enabled).length} 条启用</span>
    </div>

    <!-- 新建规则表单 -->
    {#if showAddForm}
      <div class="add-form">
        <div class="form-row">
          <div class="form-label">规则类型</div>
          <div class="type-selector type-selector-wrap">
            <button class="type-btn" class:active={newRuleType === 'include'} onclick={() => { newRuleType = 'include'; }}>自动引入</button>
            <button class="type-btn" class:active={newRuleType === 'exclusive'} onclick={() => { newRuleType = 'exclusive'; }}>独占限制</button>
            <button class="type-btn" class:active={newRuleType === 'exclude'} onclick={() => { newRuleType = 'exclude'; }}>排除</button>
            <button class="type-btn" class:active={newRuleType === 'auto-deck-by-source'} onclick={() => { newRuleType = 'auto-deck-by-source'; }}>按来源分组</button>
            <button class="type-btn" class:active={newRuleType === 'auto-tag'} onclick={() => { newRuleType = 'auto-tag'; }}>自动标记</button>
          </div>
        </div>
        {#if ruleNeedsTag(newRuleType)}
          <div class="form-row">
            <label class="form-label" for="auto-rule-tag-input">{newRuleType === 'auto-tag' ? '添加标签' : '匹配标签'}</label>
            <input
              id="auto-rule-tag-input"
              type="text"
              class="form-input"
              placeholder={newRuleType === 'auto-tag' ? '输入要添加的标签名' : '输入标签名，如：英语'}
              bind:value={newRuleTag}
            />
          </div>
        {/if}
        {#if ruleNeedsSource(newRuleType)}
          <div class="form-row">
            <label class="form-label" for="auto-rule-source-input">来源匹配</label>
            <input
              id="auto-rule-source-input"
              type="text"
              class="form-input"
              placeholder="输入文件名关键词或通配符，如：英语笔记*"
              bind:value={newRuleSourcePattern}
            />
          </div>
        {/if}
        <div class="form-row">
          <label class="form-label" for="auto-rule-deck-select">目标牌组</label>
          {#if isLoadingDecks}
            <span class="form-hint">加载牌组中...</span>
          {:else}
            <select id="auto-rule-deck-select" class="form-select" bind:value={newRuleDeckId}>
              <option value="">-- 选择牌组 --</option>
              {#each decks as deck (deck.id)}
                <option value={deck.id}>{deck.name}</option>
              {/each}
            </select>
          {/if}
        </div>
        <div class="form-row">
          <span class="form-hint type-hint">{getRuleTypeHint(newRuleType)}</span>
        </div>
        <div class="form-actions">
          <button class="form-btn confirm" onclick={handleAddRule}>确认添加</button>
          <button class="form-btn cancel" onclick={() => { showAddForm = false; }}>取消</button>
        </div>
      </div>
    {/if}

    <!-- 规则列表 -->
    {#if isLoadingRules}
      <div class="loading-hint">加载中...</div>
    {:else if rules.length === 0}
      <div class="empty-hint">
        暂无规则，点击「添加规则」创建第一条自动化规则。
      </div>
    {:else}
      <div class="rule-list">
        {#each rules as rule (rule.id)}
          <div class="rule-item" class:rule-disabled={!rule.enabled}>
            {#if editingRuleId === rule.id}
              <!-- 编辑模式 -->
              <div class="rule-edit-form">
                <div class="edit-row edit-row-wrap">
                  <div class="type-selector compact type-selector-wrap">
                    <button class="type-btn sm" class:active={editType === 'include'} onclick={() => { editType = 'include'; }}>引入</button>
                    <button class="type-btn sm" class:active={editType === 'exclusive'} onclick={() => { editType = 'exclusive'; }}>独占</button>
                    <button class="type-btn sm" class:active={editType === 'exclude'} onclick={() => { editType = 'exclude'; }}>排除</button>
                    <button class="type-btn sm" class:active={editType === 'auto-deck-by-source'} onclick={() => { editType = 'auto-deck-by-source'; }}>来源</button>
                    <button class="type-btn sm" class:active={editType === 'auto-tag'} onclick={() => { editType = 'auto-tag'; }}>标记</button>
                  </div>
                </div>
                <div class="edit-row">
                  {#if ruleNeedsTag(editType)}
                    <input type="text" class="form-input sm" bind:value={editTag} placeholder={editType === 'auto-tag' ? '标签' : '匹配标签'} />
                  {/if}
                  {#if ruleNeedsSource(editType)}
                    <input type="text" class="form-input sm" bind:value={editSourcePattern} placeholder="来源匹配模式" />
                  {/if}
                  <select class="form-select sm" bind:value={editDeckId}>
                    {#each decks as deck (deck.id)}
                      <option value={deck.id}>{deck.name}</option>
                    {/each}
                  </select>
                </div>
                <div class="edit-actions">
                  <button class="form-btn confirm sm" onclick={saveEdit}>保存</button>
                  <button class="form-btn cancel sm" onclick={cancelEdit}>取消</button>
                </div>
              </div>
            {:else}
              <!-- 显示模式 -->
              <div class="rule-content">
                <span class="rule-type-badge {getRuleTypeClass(rule.type)}">{getRuleTypeLabel(rule.type)}</span>
                <span class="rule-detail">
                  {#if rule.type === 'auto-deck-by-source'}
                    来源 <strong>{rule.sourcePattern}</strong>
                  {:else}
                    标签 <strong>#{rule.tag}</strong>
                  {/if}
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="arrow-icon"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  牌组 <strong>{rule.deckName}</strong>
                </span>
              </div>
              <div class="rule-actions">
                <button class="icon-btn" title="编辑" onclick={() => startEdit(rule)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="icon-btn danger" title="删除" onclick={() => handleDeleteRule(rule.id)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
                <label class="mini-toggle">
                  <input type="checkbox" checked={rule.enabled} onchange={() => handleToggleRule(rule.id)} />
                  <span class="mini-toggle-slider"></span>
                </label>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- 执行日志 -->
    {#if executionLog.length > 0}
      <div class="execution-log">
        <div class="log-header">
          <span>执行日志</span>
          <button class="icon-btn" aria-label="Clear log" onclick={() => { executionLog = []; }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="log-body">
          {#each executionLog as line}
            <div class="log-line">{line}</div>
          {/each}
        </div>
      </div>
    {/if}
    </div>
  </div>
</div>
{/if}

<style>
  /* Portal Modal Shell */
  .ar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: var(--layer-modal, 50);
    padding: 12px;
  }

  .ar-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    padding: 0;
    cursor: default;
  }

  .ar-modal {
    background: var(--background-primary);
    border-radius: 8px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15);
    border: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    width: 620px;
    max-width: 90vw;
    max-height: 80vh;
    overflow: hidden;
  }

  .ar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem 0.75rem;
    flex-shrink: 0;
  }

  .ar-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-normal);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .ar-accent-bar {
    display: inline-block;
    width: 4px;
    height: 18px;
    border-radius: 2px;
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.8), rgba(147, 51, 234, 0.6));
  }

  .ar-close {
    background: none;
    border: none;
    font-size: 1.2rem;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    transition: color 0.15s;
  }

  .ar-close:hover {
    color: var(--text-normal);
  }

  .auto-rules-config {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0 1.25rem 1rem;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  /* Toolbar */
  .config-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.25rem;
    flex-wrap: wrap;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s, 0.375rem);
    background: var(--background-secondary);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toolbar-btn:hover {
    background: var(--background-modifier-hover);
  }

  .toolbar-btn.primary {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .toolbar-btn.execute {
    border-color: rgba(34, 197, 94, 0.4);
    color: #22c55e;
  }

  .toolbar-btn.execute:hover {
    background: rgba(34, 197, 94, 0.08);
  }

  .toolbar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .rule-count {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--text-faint);
  }

  .spinner-sm {
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    border: 2px solid var(--background-modifier-border);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Add Form */
  .add-form {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.875rem;
    border-radius: var(--radius-m, 0.5rem);
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
  }

  .form-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  .form-label {
    flex-shrink: 0;
    width: 4.5rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  .form-input {
    flex: 1;
    padding: 0.375rem 0.625rem;
    font-size: 0.8125rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s, 0.375rem);
    background: var(--background-primary);
    color: var(--text-normal);
    outline: none;
    transition: border-color 0.15s;
  }

  .form-input:focus {
    border-color: var(--color-accent);
  }

  .form-input.sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .form-select {
    flex: 1;
    padding: 0.375rem 0.625rem;
    font-size: 0.8125rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s, 0.375rem);
    background: var(--background-primary);
    color: var(--text-normal);
    outline: none;
  }

  .form-select.sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .form-hint {
    font-size: 0.75rem;
    color: var(--text-faint);
  }

  .type-hint {
    margin-left: 4.5rem;
    padding-left: 0.625rem;
  }

  .type-selector {
    display: flex;
    gap: 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s, 0.375rem);
    overflow: hidden;
  }

  .type-selector.compact {
    flex-shrink: 0;
  }

  .type-selector-wrap {
    flex-wrap: wrap;
    border-radius: var(--radius-s, 0.375rem);
  }

  .type-btn {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    border: none;
    background: var(--background-primary);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }

  .type-btn.sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .type-btn.active {
    background: var(--color-accent);
    color: white;
  }

  .type-btn:not(.active):hover {
    background: var(--background-modifier-hover);
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    padding-top: 0.25rem;
  }

  .form-btn {
    padding: 0.375rem 1rem;
    font-size: 0.8125rem;
    font-weight: 500;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s, 0.375rem);
    background: var(--background-secondary);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.15s;
  }

  .form-btn.sm {
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
  }

  .form-btn.confirm {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }

  .form-btn.confirm:hover {
    opacity: 0.9;
  }

  .form-btn.cancel:hover {
    background: var(--background-modifier-hover);
  }

  /* Rule List */
  .rule-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .rule-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    border-radius: var(--radius-s, 0.375rem);
    background: var(--background-secondary);
    transition: background 0.15s;
  }

  .rule-item:hover {
    background: var(--background-secondary-alt, var(--background-secondary));
  }

  .rule-item.rule-disabled {
    opacity: 0.5;
  }

  .rule-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
    flex-wrap: wrap;
  }

  .rule-type-badge {
    flex-shrink: 0;
    padding: 0.125rem 0.5rem;
    font-size: 0.6875rem;
    font-weight: 600;
    border-radius: 1rem;
  }

  .type-include {
    background: rgba(59, 130, 246, 0.12);
    color: #3b82f6;
  }

  .type-exclusive {
    background: rgba(168, 85, 247, 0.12);
    color: #a855f7;
  }

  .type-exclude {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
  }

  .type-source {
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
  }

  .type-autotag {
    background: rgba(16, 185, 129, 0.12);
    color: #10b981;
  }

  .rule-detail {
    font-size: 0.8125rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .rule-detail strong {
    color: var(--text-normal);
    font-weight: 600;
  }

  .arrow-icon {
    color: var(--text-faint);
    flex-shrink: 0;
  }

  .rule-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.625rem;
    min-height: 1.625rem;
    width: 1.625rem;
    height: 1.625rem;
    border: none;
    border-radius: var(--radius-s, 0.375rem);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }

  .icon-btn :global(svg) {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
  }

  .icon-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .icon-btn.danger:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  /* Mini Toggle */
  .mini-toggle {
    position: relative;
    display: inline-block;
    width: 2rem;
    height: 1.125rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .mini-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .mini-toggle-slider {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    border-radius: 1rem;
    background: var(--background-modifier-border);
    transition: background 0.2s;
  }

  .mini-toggle-slider::before {
    content: '';
    position: absolute;
    width: 0.75rem;
    height: 0.75rem;
    left: 0.1875rem;
    bottom: 0.1875rem;
    border-radius: 50%;
    background: white;
    transition: transform 0.2s;
  }

  .mini-toggle input:checked + .mini-toggle-slider {
    background: var(--color-accent);
  }

  .mini-toggle input:checked + .mini-toggle-slider::before {
    transform: translateX(0.875rem);
  }

  /* Edit form inline */
  .rule-edit-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
  }

  .edit-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .edit-row-wrap {
    flex-wrap: wrap;
  }

  .edit-actions {
    display: flex;
    gap: 0.375rem;
    justify-content: flex-end;
  }

  /* Empty & Loading */
  .loading-hint, .empty-hint {
    padding: 2rem;
    text-align: center;
    font-size: 0.8125rem;
    color: var(--text-faint);
  }

  /* Execution Log */
  .execution-log {
    border-radius: var(--radius-m, 0.5rem);
    border: 1px solid var(--background-modifier-border);
    overflow: hidden;
  }

  .log-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.75rem;
    background: var(--background-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  .log-body {
    max-height: 10rem;
    overflow-y: auto;
    padding: 0.5rem 0.75rem;
    background: var(--background-primary);
  }

  .log-line {
    font-size: 0.6875rem;
    font-family: var(--font-monospace);
    color: var(--text-muted);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
