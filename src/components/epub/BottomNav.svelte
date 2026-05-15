<script lang="ts">
	import { setIcon } from 'obsidian';
	import { onMount, tick } from 'svelte';

	interface Props {
		onPrev: () => void;
		onNext: () => void;
		onJumpToPage?: (pageNumber: number) => void | Promise<void>;
		currentPage?: number;
		totalPages?: number;
		vertical?: boolean;
		statusText?: string;
		statusDetail?: string;
		statusStickerValue?: string;
		statusStickerLabel?: string;
		statusStickerTitle?: string;
		busy?: boolean;
	}

	let {
		onPrev,
		onNext,
		onJumpToPage,
		currentPage = 0,
		totalPages = 0,
		vertical = false,
		statusText = '',
		statusDetail = '',
		statusStickerValue = '',
		statusStickerLabel = '',
		statusStickerTitle = '',
		busy = false,
	}: Props = $props();

	let jumpPopoverOpen = $state(false);
	let jumpInputValue = $state<string | number>('');
	let jumpInputEl: HTMLInputElement | undefined = $state(undefined);
	let jumpSubmitting = $state(false);
	let statusEl: HTMLDivElement | undefined = $state(undefined);

	function icon(node: HTMLElement, name: string) {
		setIcon(node, name);
		return {
			update(newName: string) {
				// /skip innerHTML is used to clear the trusted icon container before setIcon rerenders it
				node.replaceChildren();
				setIcon(node, newName);
			}
		};
	}

	function hasPageInfo() {
		return currentPage > 0 && totalPages > 0;
	}

	function hasStatusText() {
		return statusText.trim().length > 0;
	}

	function hasStatusDetail() {
		return statusDetail.trim().length > 0;
	}

	function hasStatusSticker() {
		return statusStickerValue.trim().length > 0 && statusStickerLabel.trim().length > 0;
	}

	function getPrevLabel() {
		return vertical ? '上一屏' : '上一页';
	}

	function getNextLabel() {
		return vertical ? '下一屏' : '下一页';
	}

	function canJumpToPage() {
		return !vertical && !busy && !hasStatusText() && hasPageInfo() && typeof onJumpToPage === 'function';
	}

	function closeJumpPopover() {
		jumpPopoverOpen = false;
		jumpSubmitting = false;
	}

	async function openJumpPopover() {
		if (!canJumpToPage()) {
			return;
		}
		jumpInputValue = String(currentPage || '');
		jumpPopoverOpen = true;
		await tick();
		jumpInputEl?.focus();
		jumpInputEl?.select();
	}

	function getSanitizedJumpPage(): number | null {
		const rawValue = typeof jumpInputValue === 'number'
			? String(jumpInputValue)
			: jumpInputValue.trim();
		if (!rawValue) {
			return null;
		}
		const pageNumber = Number.parseInt(rawValue, 10);
		if (!Number.isFinite(pageNumber)) {
			return null;
		}
		return Math.min(Math.max(pageNumber, 1), totalPages);
	}

	async function submitJumpPage() {
		if (!canJumpToPage() || jumpSubmitting) {
			return;
		}
		const pageNumber = getSanitizedJumpPage();
		if (!pageNumber) {
			return;
		}
		jumpSubmitting = true;
		try {
			await onJumpToPage?.(pageNumber);
			closeJumpPopover();
		} finally {
			jumpSubmitting = false;
		}
	}

	function handleStatusClick(event: MouseEvent) {
		if (!canJumpToPage()) {
			return;
		}
		event.stopPropagation();
		if (jumpPopoverOpen) {
			closeJumpPopover();
			return;
		}
		void openJumpPopover();
	}

	function handleStatusKeydown(event: KeyboardEvent) {
		if (!canJumpToPage()) {
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			closeJumpPopover();
		}
	}

	function handlePointerDownOutside(event: MouseEvent | TouchEvent) {
		if (!jumpPopoverOpen || !statusEl) {
			return;
		}
		if (statusEl.contains(event.target as Node)) {
			return;
		}
		closeJumpPopover();
	}

	onMount(() => {
		document.addEventListener('mousedown', handlePointerDownOutside);
		document.addEventListener('touchstart', handlePointerDownOutside);
		return () => {
			document.removeEventListener('mousedown', handlePointerDownOutside);
			document.removeEventListener('touchstart', handlePointerDownOutside);
		};
	});
</script>

<div class="epub-bottom-nav" class:vertical>
	<button
		class="epub-nav-btn"
		class:vertical
		type="button"
		title={getPrevLabel()}
		aria-label={getPrevLabel()}
		onclick={onPrev}
	>
		<span class="epub-nav-btn-icon" use:icon={vertical ? 'arrow-up' : 'arrow-left'}></span>
		{#if !vertical}
			<span class="epub-nav-btn-label">{getPrevLabel()}</span>
		{/if}
	</button>

	<div
		class="epub-nav-status"
		class:vertical
		class:busy
		aria-live="polite"
		bind:this={statusEl}
	>
		{#if canJumpToPage()}
			<button
				class="epub-nav-status-trigger"
				type="button"
				aria-haspopup="dialog"
				aria-expanded={jumpPopoverOpen}
				onclick={handleStatusClick}
				onkeydown={handleStatusKeydown}
			>
				<span class="epub-nav-status-label">第 {currentPage} / {totalPages} 页</span>
			</button>
		{:else}
			{#if hasStatusText()}
				<span class="epub-nav-status-label epub-nav-status-custom">{statusText}</span>
			{:else if hasPageInfo()}
				{#if vertical}
					<span class="epub-nav-status-current">{currentPage}</span>
					<span class="epub-nav-status-divider"></span>
					<span class="epub-nav-status-total">{totalPages}</span>
				{:else}
					<span class="epub-nav-status-label">第 {currentPage} / {totalPages} 页</span>
				{/if}
			{:else}
				<span class="epub-nav-status-label">定位中...</span>
			{/if}
			{#if vertical && hasStatusDetail()}
				<span class="epub-nav-status-vertical-detail" title={statusDetail}>{statusDetail}</span>
			{/if}
		{/if}
		{#if jumpPopoverOpen}
			<div class="epub-nav-jump-popover" class:vertical>
				<label class="epub-nav-jump-field">
					<span class="epub-nav-jump-label">跳转页数</span>
					<input
						class="epub-nav-jump-input"
						type="number"
						min="1"
						max={totalPages}
						step="1"
						bind:value={jumpInputValue}
						bind:this={jumpInputEl}
						onkeydown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								void submitJumpPage();
								return;
							}
							if (event.key === 'Escape') {
								event.preventDefault();
								closeJumpPopover();
							}
						}}
					/>
				</label>
				<div class="epub-nav-jump-actions">
					<button class="epub-nav-jump-btn" type="button" onclick={() => void submitJumpPage()} disabled={jumpSubmitting}>跳转</button>
				</div>
			</div>
		{/if}
	</div>

	{#if hasStatusSticker()}
		<div
			class="epub-nav-status-sticker priority-sticky-note"
			class:vertical
			role="img"
			aria-label={statusStickerTitle || `${statusStickerLabel} ${statusStickerValue}`}
			title={statusStickerTitle || `${statusStickerLabel} ${statusStickerValue}`}
		>
			<span class="sticky-number">{statusStickerValue}</span>
			<span class="sticky-label">{statusStickerLabel}</span>
		</div>
	{/if}

	<button
		class="epub-nav-btn"
		class:vertical
		type="button"
		title={getNextLabel()}
		aria-label={getNextLabel()}
		onclick={onNext}
	>
		<span class="epub-nav-btn-icon" use:icon={vertical ? 'arrow-down' : 'arrow-right'}></span>
		{#if !vertical}
			<span class="epub-nav-btn-label">{getNextLabel()}</span>
		{/if}
	</button>
</div>

<style>
	.epub-bottom-nav.vertical {
		top: 50%;
		right: var(
			--epub-scrolled-side-nav-inline-offset,
			var(--epub-scrolled-side-nav-gap, 16px)
		);
		left: auto;
		bottom: auto;
		transform: translateY(-50%);
		width: var(--epub-scrolled-side-nav-width, 58px);
		max-width: none;
		padding: 8px 7px 9px;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 7px;
		border-radius: 22px;
		background: var(--epub-bg-glass);
		border: 1px solid var(--epub-border);
		box-shadow:
			0 10px 24px rgba(0, 0, 0, 0.12),
			0 1px 0 rgba(255, 255, 255, 0.04) inset;
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}

	.epub-nav-btn.vertical {
		width: 40px;
		min-width: 40px;
		height: 40px;
		padding: 0;
		justify-content: center;
		gap: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--epub-text-muted);
		box-shadow: none;
		transition:
			background-color var(--epub-transition-fast),
			color var(--epub-transition-fast),
			transform var(--epub-transition-fast);
	}

	.epub-nav-btn.vertical:hover {
		background: rgba(255, 255, 255, 0.05);
		color: var(--epub-text);
	}

	.epub-nav-btn.vertical:active {
		transform: scale(0.97);
	}

	.epub-nav-btn.vertical:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.epub-nav-btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.epub-nav-btn.vertical .epub-nav-btn-icon :global(.svg-icon) {
		width: 15px;
		height: 15px;
	}

	.epub-nav-status {
		pointer-events: auto;
		position: relative;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: auto;
		padding: 0;
		border-radius: 0;
		background: transparent;
		color: var(--epub-text-muted);
		font-size: 12px;
		line-height: 1.2;
		white-space: nowrap;
		gap: 2px;
	}

	.epub-nav-status-trigger {
		appearance: none;
		-webkit-appearance: none;
		width: 100%;
		padding: 0 2px;
		border: none;
		background: transparent;
		box-shadow: none;
		color: inherit;
		font: inherit;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		cursor: pointer;
	}

	.epub-nav-status-trigger:hover {
		background: transparent;
		box-shadow: none;
		color: var(--epub-text);
	}

	.epub-nav-status-trigger:active {
		background: transparent;
		box-shadow: none;
		transform: none;
	}

	.epub-nav-status-trigger:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
		border-radius: 4px;
	}

	.epub-nav-status.vertical {
		width: 40px;
		min-width: 40px;
		padding: 6px 0 5px;
		flex-direction: column;
		gap: 4px;
		border-radius: 12px;
		border: 1px solid var(--epub-border);
		background: var(--epub-bg-paper);
		color: var(--epub-text-faint);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.04),
			0 1px 2px rgba(0, 0, 0, 0.08);
	}

	.epub-nav-status-label,
	.epub-nav-status-current,
	.epub-nav-status-total {
		font-variant-numeric: tabular-nums;
	}

	.epub-nav-status-label {
		line-height: 1.2;
	}

	.epub-nav-status-custom {
		font-size: 12px;
		line-height: 1.1;
		font-weight: 600;
		color: var(--epub-text);
	}

	.epub-nav-status.busy .epub-nav-status-custom {
		color: var(--interactive-accent);
	}

	.epub-nav-status.vertical .epub-nav-status-label {
		font-size: 9px;
		line-height: 1.15;
	}

	.epub-nav-status.vertical .epub-nav-status-custom {
		font-size: 10px;
		line-height: 1.1;
	}

	.epub-nav-status-vertical-detail {
		max-width: 32px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 8px;
		line-height: 1.1;
		color: var(--epub-text-faint);
	}

	.epub-nav-status-current {
		color: var(--epub-text);
		font-size: 14px;
		line-height: 1;
		font-weight: 700;
	}

	.epub-nav-status-total {
		font-size: 9px;
		line-height: 1;
		letter-spacing: 0.02em;
	}

	.epub-nav-jump-popover {
		position: absolute;
		left: 50%;
		bottom: calc(100% + 10px);
		transform: translateX(-50%);
		z-index: 20;
		min-width: 156px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		border-radius: 12px;
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
	}

	.epub-nav-jump-popover.vertical {
		left: auto;
		right: calc(100% + 10px);
		bottom: 50%;
		transform: translateY(50%);
	}

	.epub-nav-jump-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.epub-nav-jump-label {
		font-size: 11px;
		line-height: 1.2;
		color: var(--text-muted);
	}

	.epub-nav-jump-input {
		width: 100%;
		padding: 6px 8px;
		border-radius: 8px;
		border: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
		color: var(--text-normal);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}

	.epub-nav-jump-actions {
		display: flex;
		justify-content: flex-end;
	}

	.epub-nav-jump-btn {
		padding: 4px 10px;
		border-radius: 8px;
		border: 1px solid var(--interactive-accent);
		background: var(--interactive-accent);
		color: var(--text-on-accent, white);
		font-size: 11px;
		line-height: 1.2;
	}

	.epub-nav-jump-btn:disabled {
		opacity: 0.65;
		cursor: default;
	}

	.epub-nav-status-sticker.priority-sticky-note {
		--weave-sticky-paper: var(--epub-bg-paper, var(--background-primary));
		position: relative;
		flex: 0 0 auto;
		width: 64px;
		min-width: 64px;
		height: 64px;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: 0;
		border-radius: 4px;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--background-primary) 94%, var(--background-secondary)) 0%,
			color-mix(in srgb, var(--background-secondary) 36%, var(--background-primary)) 100%
		);
		border: 1px solid color-mix(in srgb, var(--background-modifier-border) 72%, transparent);
		box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
		color: var(--text-normal);
	}

	.epub-nav-status-sticker.priority-sticky-note::before {
		content: '';
		position: absolute;
		top: -6px;
		left: 50%;
		transform: translateX(-50%);
		width: 44px;
		height: 14px;
		background: color-mix(in srgb, var(--weave-sticky-paper) 70%, transparent);
		border-radius: 2px;
		backdrop-filter: blur(4px);
	}

	.epub-nav-status-sticker .sticky-number {
		font-size: 1rem;
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
	}

	.epub-nav-status-sticker .sticky-label {
		font-size: 0.56rem;
		font-weight: 700;
		line-height: 1.1;
		opacity: 0.88;
	}

	.epub-nav-status-sticker.vertical {
		width: 54px;
		min-width: 54px;
		height: 54px;
	}

	.epub-nav-status-sticker.vertical::before {
		width: 38px;
		height: 12px;
		top: -5px;
	}

	.epub-nav-status-sticker.vertical .sticky-number {
		font-size: 0.88rem;
	}

	.epub-nav-status-sticker.vertical .sticky-label {
		font-size: 0.5rem;
	}

	.epub-nav-status-divider {
		width: 14px;
		height: 1px;
		background: var(--epub-border);
		opacity: 0.7;
	}
</style>
