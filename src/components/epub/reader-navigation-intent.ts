import type { FlashStyle } from '../../services/epub';

export type ReaderNavigationIntent = {
	cfi?: string;
	href?: string;
	text?: string;
	flashStyle?: FlashStyle;
	flashColor?: string;
	showLocateOverlay?: boolean;
};

export function normalizeReaderNavigationIntent(
	intent: ReaderNavigationIntent | null | undefined
): ReaderNavigationIntent | null {
	const cfi = String(intent?.cfi || '').trim();
	const href = String(intent?.href || '').trim();
	if (!cfi && !href) {
		return null;
	}

	const text = String(intent?.text || '').trim();
	const normalized: ReaderNavigationIntent = cfi ? { cfi } : { href };
	if (text) {
		normalized.text = text;
	}
	if (
		intent?.flashStyle === 'pulse'
		|| intent?.flashStyle === 'highlight'
		|| intent?.flashStyle === 'none'
	) {
		normalized.flashStyle = intent.flashStyle;
	}
	if (typeof intent?.flashColor === 'string' && intent.flashColor.trim()) {
		normalized.flashColor = intent.flashColor.trim();
	}
	if (typeof intent?.showLocateOverlay === 'boolean') {
		normalized.showLocateOverlay = intent.showLocateOverlay;
	}
	return normalized;
}

export function createPendingSourceLocateNavigationIntent(
	cfi?: string,
	text?: string
): ReaderNavigationIntent | null {
	return normalizeReaderNavigationIntent({
		cfi,
		text,
		flashStyle: 'highlight',
		showLocateOverlay: true,
	});
}
