<script lang="ts">
	type HighlightColor = 'yellow' | 'green' | 'blue' | 'red' | 'purple';

	interface Props {
		color?: string;
		quoteText?: string;
		quoteHtml?: string;
		commentText?: string;
		commentHtml?: string;
		metaLeft?: string;
		metaRightPrefix?: string;
		metaRight?: string;
		metaRightPageLabel?: string;
		metaRightTime?: string;
		clickable?: boolean;
		onActivate?: () => void;
		commentMuted?: boolean;
	}

	let {
		color = 'yellow',
		quoteText = '',
		quoteHtml,
		commentText = '',
		commentHtml,
		metaLeft = '',
		metaRightPrefix = '',
		metaRight = '',
		clickable = false,
		onActivate,
		commentMuted = false
	}: Props = $props();

	function normalizeColor(currentColor?: string): HighlightColor {
		switch (currentColor) {
			case 'green':
			case 'blue':
			case 'red':
			case 'purple':
				return currentColor;
			case 'pink':
				return 'red';
			default:
				return 'yellow';
		}
	}

	let normalizedColor = $derived(normalizeColor(color));
	let hasQuote = $derived(Boolean(quoteHtml || quoteText));
	let hasComment = $derived(Boolean(commentHtml || commentText));
	let hasMainContent = $derived(hasQuote || hasComment);
	let hasHeaderMeta = $derived(Boolean(metaRightPrefix || metaRight));

	function getHighlightClass(currentColor: HighlightColor): string {
		return `hl-${currentColor}`;
	}

	function handleActivateKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onActivate?.();
		}
	}

</script>

{#if clickable}
	<div
		role="button"
		tabindex="0"
		class="weave-annotation-card clickable"
		onclick={() => onActivate?.()}
		onkeydown={handleActivateKeydown}
	>
		<div class="annotation-body">
			{#if hasHeaderMeta}
				<div class="annotation-header">
					{#if metaRightPrefix}
						<span class="annotation-meta-right-prefix">{metaRightPrefix}</span>
					{/if}
					{#if metaRight}
						<span class="annotation-meta-right">{metaRight}</span>
					{/if}
				</div>
			{/if}
			{#if hasMainContent}
				<div class="annotation-main-row">
					<div class="annotation-main">
						{#if hasQuote}
							<div class={`annotation-quote ${getHighlightClass(normalizedColor)}`}>
								<div class="annotation-quote-text">
									{#if quoteHtml}
										{@html quoteHtml}
									{:else}
										{quoteText}
									{/if}
								</div>
								{#if metaLeft}
									<div class="annotation-quote-source" title={metaLeft}>{metaLeft}</div>
								{/if}
							</div>
						{/if}
						{#if hasComment}
							<div class:annotation-comment-muted={commentMuted} class="annotation-comment">
								{#if commentHtml}
									{@html commentHtml}
								{:else}
									{commentText}
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
			{#if metaLeft && !hasQuote}
				<div class="annotation-meta">
					<span class="annotation-meta-left">{metaLeft}</span>
				</div>
			{/if}
		</div>
	</div>
{:else}
	<article
		class="weave-annotation-card"
	>
		<div class="annotation-body">
			{#if metaRight}
				<div class="annotation-header">
					<span class="annotation-meta-right">{metaRight}</span>
				</div>
			{/if}
			{#if hasMainContent}
				<div class="annotation-main-row">
					<div class="annotation-main">
						{#if hasQuote}
							<div class={`annotation-quote ${getHighlightClass(normalizedColor)}`}>
								<div class="annotation-quote-text">
									{#if quoteHtml}
										{@html quoteHtml}
									{:else}
										{quoteText}
									{/if}
								</div>
								{#if metaLeft}
									<div class="annotation-quote-source" title={metaLeft}>{metaLeft}</div>
								{/if}
							</div>
						{/if}
						{#if hasComment}
							<div class:annotation-comment-muted={commentMuted} class="annotation-comment">
								{#if commentHtml}
									{@html commentHtml}
								{:else}
									{commentText}
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
			{#if metaLeft && !hasQuote}
				<div class="annotation-meta">
					<span class="annotation-meta-left">{metaLeft}</span>
				</div>
			{/if}
		</div>
	</article>
{/if}

<style>
	.weave-annotation-card {
		position: relative;
		width: 100%;
		height: auto;
		min-height: unset;
		padding: 11px 13px;
		box-sizing: border-box;
		border-radius: 15px;
		border: 1px solid color-mix(in srgb, var(--background-modifier-border) 72%, transparent);
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 96%, transparent),
				color-mix(in srgb, var(--weave-surface-background, var(--background-secondary)) 88%, transparent)
			);
		box-shadow: 0 7px 18px rgba(0, 0, 0, 0.045);
		transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background 0.16s ease;
		text-align: left;
		color: inherit;
		white-space: normal;
		overflow: visible;
	}

	.weave-annotation-card.clickable {
		cursor: pointer;
		user-select: none;
	}

	.weave-annotation-card.clickable:hover,
	.weave-annotation-card.clickable:focus-visible {
		transform: translateY(-1px);
		border-color: color-mix(in srgb, var(--interactive-accent) 28%, transparent);
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 100%, transparent),
				color-mix(in srgb, var(--weave-surface-background, var(--background-secondary)) 94%, transparent)
			);
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.07);
		outline: none;
	}

	.annotation-body {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 2px 0;
		overflow: visible;
	}

	.annotation-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 16px;
		width: 100%;
	}

	.annotation-main-row {
		display: flex;
		align-items: stretch;
		gap: 0;
		min-width: 0;
	}

	.annotation-main {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.annotation-quote,
	.annotation-comment {
		white-space: pre-wrap;
		word-break: break-word;
		line-height: 1.68;
		font-size: 13px;
	}

	.annotation-quote {
		display: flex;
		flex-direction: column;
		gap: 9px;
		color: var(--text-normal);
		padding: 12px 14px;
		border-radius: 13px;
		border: 1px solid color-mix(in srgb, var(--background-modifier-border) 72%, transparent);
		background: color-mix(
			in srgb,
			var(--weave-elevated-background, var(--background-primary)) 95%,
			var(--weave-surface-background, var(--background-secondary)) 5%
		);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}

	.annotation-quote-text {
		min-width: 0;
		letter-spacing: 0.002em;
	}

	.annotation-quote-source {
		align-self: flex-end;
		max-width: min(100%, 22em);
		padding-top: 2px;
		font-size: 10px;
		line-height: 1.4;
		color: color-mix(in srgb, var(--text-muted) 82%, var(--text-faint) 18%);
		text-align: right;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		opacity: 0.9;
		font-style: normal;
	}

	.annotation-comment {
		color: var(--text-normal);
		padding: 0 1px;
	}

	.annotation-comment-muted {
		color: var(--text-muted);
		font-size: 12.5px;
	}

	.annotation-meta {
		display: flex;
		align-items: center;
		color: var(--text-muted);
		font-size: 11px;
		justify-content: flex-start;
	}

	.annotation-meta-left,
	.annotation-meta-right-prefix,
	.annotation-meta-right {
		min-width: 0;
	}

	.annotation-meta-left {
		flex: 1 1 auto;
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		padding: 3px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--weave-surface-background, var(--background-secondary)) 92%, transparent);
		border: 1px solid color-mix(in srgb, var(--background-modifier-border) 68%, transparent);
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.annotation-meta-right-prefix {
		flex: 0 1 auto;
		text-align: left;
		font-size: 10px;
		letter-spacing: 0.03em;
		color: color-mix(in srgb, var(--text-muted) 74%, var(--text-faint) 26%);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.annotation-meta-right {
		flex: 0 0 auto;
		margin-left: auto;
		text-align: right;
		font-size: 10px;
		letter-spacing: 0.02em;
		color: color-mix(in srgb, var(--text-muted) 80%, var(--text-faint) 20%);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.hl-yellow {
		color: color-mix(in srgb, var(--text-normal) 96%, #6b4f00 4%);
		background: linear-gradient(180deg, rgba(255, 235, 59, 0.28) 0%, rgba(255, 193, 7, 0.18) 100%);
		border-color: rgba(214, 158, 0, 0.26);
	}

	.hl-green {
		color: color-mix(in srgb, var(--text-normal) 95%, #1f6a33 5%);
		background: linear-gradient(180deg, rgba(76, 175, 80, 0.18) 0%, rgba(51, 194, 122, 0.12) 100%);
		border-color: rgba(31, 106, 51, 0.18);
	}

	.hl-blue {
		color: color-mix(in srgb, var(--text-normal) 95%, #165d9a 5%);
		background: linear-gradient(180deg, rgba(66, 165, 245, 0.18) 0%, rgba(59, 130, 246, 0.12) 100%);
		border-color: rgba(22, 93, 154, 0.18);
	}

	.hl-red {
		color: color-mix(in srgb, var(--text-normal) 94%, #9f1f1f 6%);
		background: linear-gradient(180deg, rgba(239, 68, 68, 0.16) 0%, rgba(220, 38, 38, 0.12) 100%);
		border-color: rgba(159, 31, 31, 0.18);
	}

	.hl-purple {
		color: color-mix(in srgb, var(--text-normal) 95%, #6b2e93 5%);
		background: linear-gradient(180deg, rgba(171, 71, 188, 0.16) 0%, rgba(139, 92, 246, 0.12) 100%);
		border-color: rgba(107, 46, 147, 0.18);
	}

	.annotation-quote :global(mark),
	.annotation-comment :global(mark) {
		background: var(--text-highlight-bg);
		color: inherit;
		border-radius: 3px;
		padding: 0 1px;
	}
</style>
