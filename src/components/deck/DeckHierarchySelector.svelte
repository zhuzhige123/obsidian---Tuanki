<script lang="ts">
	/**
	 * 牌组层级选择器组件
	 * 支持展示和选择层级牌组结构
	 */
	import type { Deck } from '../../data/types';
	import type { DeckTreeNode } from '../../services/deck/DeckHierarchyService';

	// Props
	let {
		decks = $bindable([]),
		selectedDeckId = $bindable(''),
		onSelect = (deckId: string) => {},
		showIcons = true,
		expandable = true,
	}: {
		decks: DeckTreeNode[];
		selectedDeckId?: string;
		onSelect?: (deckId: string) => void;
		showIcons?: boolean;
		expandable?: boolean;
	} = $props();

	// State
	let expandedNodes = $state<Set<string>>(new Set());

	// 切换展开/折叠
	function toggleExpand(deckId: string) {
		if (expandedNodes.has(deckId)) {
			expandedNodes.delete(deckId);
		} else {
			expandedNodes.add(deckId);
		}
		expandedNodes = new Set(expandedNodes);
	}

	// 处理选择
	function handleSelect(deckId: string) {
		selectedDeckId = deckId;
		onSelect(deckId);
	}

	// 判断是否展开
	function isExpanded(deckId: string): boolean {
		return expandedNodes.has(deckId);
	}

	// 递归渲染节点
	function renderNode(node: DeckTreeNode, depth: number = 0) {
		const hasChildren = node.children.length > 0;
		const expanded = isExpanded(node.deck.id);
		const isSelected = selectedDeckId === node.deck.id;

		return {
			node,
			depth,
			hasChildren,
			expanded,
			isSelected,
		};
	}
</script>

<div class="deck-hierarchy-selector">
	{#each decks as treeNode}
		{@render deckNode(renderNode(treeNode, 0))}
	{/each}
</div>

{#snippet deckNode(data: ReturnType<typeof renderNode>)}
	<div
		class="deck-item"
		class:selected={data.isSelected}
		style="padding-left: {data.depth * 20}px"
	>
		<div class="deck-row" onclick={() => handleSelect(data.node.deck.id)}>
			{#if data.hasChildren && expandable}
				<button
					class="expand-button"
					onclick={(e) => {
						e.stopPropagation();
						toggleExpand(data.node.deck.id);
					}}
				>
					<span class="icon">{data.expanded ? '▼' : '▶'}</span>
				</button>
			{:else}
				<span class="expand-placeholder"></span>
			{/if}

			{#if showIcons && data.node.deck.icon}
				<span class="deck-icon">{data.node.deck.icon}</span>
			{/if}

			<span class="deck-name">{data.node.deck.name}</span>

			<span class="deck-stats">
				{data.node.deck.stats.totalCards} cards
			</span>
		</div>

		{#if data.expanded && data.hasChildren}
			<div class="children">
				{#each data.node.children as childNode}
					{@render deckNode(renderNode(childNode, data.depth + 1))}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<style>
	.deck-hierarchy-selector {
		width: 100%;
		padding: 8px;
	}

	.deck-item {
		margin-bottom: 2px;
	}

	.deck-row {
		display: flex;
		align-items: center;
		padding: 6px 8px;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.deck-row:hover {
		background-color: var(--background-modifier-hover);
	}

	.deck-item.selected .deck-row {
		background-color: var(--background-modifier-active-hover);
	}

	.expand-button {
		background: none;
		border: none;
		padding: 0;
		margin-right: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
	}

	.expand-button .icon {
		font-size: 10px;
		color: var(--text-muted);
	}

	.expand-placeholder {
		width: 16px;
		margin-right: 4px;
	}

	.deck-icon {
		margin-right: 6px;
		font-size: 14px;
	}

	.deck-name {
		flex: 1;
		font-size: 14px;
		color: var(--text-normal);
	}

	.deck-stats {
		font-size: 12px;
		color: var(--text-muted);
		margin-left: 8px;
	}

	.children {
		margin-top: 2px;
	}
</style>



