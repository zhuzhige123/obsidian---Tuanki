<script lang="ts">
	import type { EpubReadingReferencePoint } from '../../services/epub';

	interface Props {
		referencePoint: EpubReadingReferencePoint;
		currentPercent: number;
		deltaText: string;
		startText: string;
		titleText: string;
		slotIndex?: number;
		onOpenMenu: (event: MouseEvent | KeyboardEvent) => void;
	}

	let { referencePoint, currentPercent, deltaText, startText, titleText, slotIndex = 0, onOpenMenu }: Props = $props();

	const toneClass = $derived.by(() => {
		const delta = currentPercent - referencePoint.percent;
		if (delta >= 1) {
			return 'is-ahead';
		}
		if (delta <= -1) {
			return 'is-behind';
		}
		return 'is-aligned';
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return;
		}
		event.preventDefault();
		onOpenMenu(event);
	}
</script>

<button
	type="button"
	class={`epub-reading-reference-sticker priority-sticky-note ${toneClass}`}
	aria-label={titleText}
	title={titleText}
	style={`--weave-sticker-slot: ${slotIndex};`}
	onclick={onOpenMenu}
	onkeydown={handleKeydown}
>
	<span class="sticky-number">{deltaText}</span>
	<span class="sticky-label">{startText}</span>
</button>

<style>
	.epub-reading-reference-sticker.priority-sticky-note {
		--weave-sticker-slot: 0;
		--weave-sticker-top: 18px;
		--weave-sticker-size: 72px;
		--weave-sticker-gap: 12px;
		--weave-sticker-right-start: 18px;
		--weave-sticky-paper: var(--background-primary);
		position: absolute;
		top: var(--weave-sticker-top, 18px);
		right: calc(
			var(--weave-sticker-right-start, 18px) +
			(var(--weave-sticker-slot) * (var(--weave-sticker-size, 72px) + var(--weave-sticker-gap, 12px)))
		);
		width: var(--weave-sticker-size, 72px);
		height: var(--weave-sticker-size, 72px);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.22rem;
		padding: 0;
		border-radius: 4px;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--background-primary) 94%, var(--background-secondary)) 0%,
			color-mix(in srgb, var(--background-secondary) 38%, var(--background-primary)) 100%
		);
		color: var(--text-normal);
		cursor: pointer;
		user-select: none;
		z-index: var(--epub-z-overlay, 200);
	}

	.epub-reading-reference-sticker.priority-sticky-note::before {
		content: '';
		position: absolute;
		top: -7px;
		left: 50%;
		transform: translateX(-50%);
		width: calc(var(--weave-sticker-size, 72px) * 0.7);
		height: calc(var(--weave-sticker-size, 72px) * 0.22);
		background: color-mix(in srgb, var(--weave-sticky-paper) 68%, transparent);
		border-radius: 2px;
		backdrop-filter: blur(4px);
	}

	.epub-reading-reference-sticker:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 3px;
	}

	.epub-reading-reference-sticker.is-ahead {
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-blue, #3b82f6) 10%, var(--background-primary)) 0%,
			color-mix(in srgb, var(--color-green, #22c55e) 7%, var(--background-secondary)) 100%
		);
		color: color-mix(in srgb, var(--color-blue, #3b82f6) 68%, var(--text-normal));
	}

	.epub-reading-reference-sticker.is-behind {
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-orange, #f59e0b) 10%, var(--background-primary)) 0%,
			color-mix(in srgb, var(--color-red, #ef4444) 6%, var(--background-secondary)) 100%
		);
		color: color-mix(in srgb, var(--color-red, #ef4444) 70%, var(--text-normal));
	}

	.epub-reading-reference-sticker.is-aligned {
		color: var(--text-normal);
	}

	.epub-reading-reference-sticker .sticky-number {
		font-size: clamp(0.98rem, calc(var(--weave-sticker-size, 72px) * 0.28), 1.3rem);
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
	}

	.epub-reading-reference-sticker .sticky-label {
		font-size: clamp(0.5rem, calc(var(--weave-sticker-size, 72px) * 0.15), 0.66rem);
		font-weight: 700;
		line-height: 1.15;
		opacity: 0.88;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 768px) {
		.epub-reading-reference-sticker.priority-sticky-note {
			--weave-sticker-top: 12px;
			--weave-sticker-size: 64px;
			--weave-sticker-right-start: 12px;
		}

		.epub-reading-reference-sticker.priority-sticky-note::before {
			top: -6px;
		}
	}
</style>
