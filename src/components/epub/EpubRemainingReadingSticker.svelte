<script lang="ts">
	interface Props {
		valueText: string;
		labelText: string;
		titleText: string;
		slotIndex?: number;
	}

	let { valueText, labelText, titleText, slotIndex = 0 }: Props = $props();
</script>

<div
	class="epub-remaining-reading-sticker priority-sticky-note"
	role="img"
	aria-label={titleText}
	title={titleText}
	style={`--weave-sticker-slot: ${slotIndex};`}
>
	<span class="sticky-number">{valueText}</span>
	<span class="sticky-label">{labelText}</span>
</div>

<style>
	.epub-remaining-reading-sticker.priority-sticky-note {
		--weave-sticker-top: 18px;
		--weave-sticker-size: 72px;
		--weave-sticker-gap: 12px;
		--weave-sticker-right-start: 18px;
		--weave-sticky-paper: var(--background-primary);
		position: absolute;
		top: var(--weave-sticker-top, 18px);
		right: calc(
			var(--weave-sticker-right-start, 18px) +
			(var(--weave-sticker-slot, 0) * (var(--weave-sticker-size, 72px) + var(--weave-sticker-gap, 12px)))
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
			color-mix(in srgb, var(--color-blue, #3b82f6) 8%, var(--background-primary)) 0%,
			color-mix(in srgb, var(--color-purple, #8b5cf6) 7%, var(--background-secondary)) 100%
		);
		color: color-mix(in srgb, var(--color-blue, #3b82f6) 65%, var(--text-normal));
		user-select: none;
		z-index: var(--epub-z-overlay, 200);
		border: 1px solid color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
	}

	.epub-remaining-reading-sticker.priority-sticky-note::before {
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

	.epub-remaining-reading-sticker .sticky-number {
		font-size: clamp(0.92rem, calc(var(--weave-sticker-size, 72px) * 0.24), 1.18rem);
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
	}

	.epub-remaining-reading-sticker .sticky-label {
		font-size: clamp(0.5rem, calc(var(--weave-sticker-size, 72px) * 0.15), 0.66rem);
		font-weight: 700;
		line-height: 1.15;
		opacity: 0.88;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 768px) {
		.epub-remaining-reading-sticker.priority-sticky-note {
			--weave-sticker-top: 12px;
			--weave-sticker-size: 64px;
			--weave-sticker-right-start: 12px;
		}

		.epub-remaining-reading-sticker.priority-sticky-note::before {
			top: -6px;
		}
	}
</style>
