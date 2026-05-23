import type { AICardPreviewItem, GeneratedCard } from '../types/ai-types';

export function splitGeneratedCardContent(value: string): { front: string; back: string } {
	const match = value.split(/(?:\n\n|\n)?---div---(?:\n\n|\n)?/);
	return { front: (match[0] ?? '').trim(), back: match.slice(1).join('---div---').trim() };
}

export function generatedCardToPreviewItem(
	card: GeneratedCard,
	options?: { idPrefix?: string; isNew?: boolean }
): AICardPreviewItem {
	const { front, back } = splitGeneratedCardContent(card.content || '');
	const idPrefix = options?.idPrefix ?? 'preview';

	return {
		id: `${idPrefix}-${card.uuid}`,
		draft:
			card.type === 'choice'
				? {
						type: 'choice',
						question: front,
						options: [],
						answers: [],
						back: back || undefined,
						tags: [...(card.tags || [])],
					}
				: card.type === 'cloze'
					? {
							type: 'cloze',
							text: front,
							back: back || undefined,
							tags: [...(card.tags || [])],
						}
					: {
							type: 'qa',
							front,
							back,
							tags: [...(card.tags || [])],
						},
		status: 'valid',
		issues: [],
		generatedContent: card.content || '',
		generatedCard: { ...card, tags: [...(card.tags || [])], metadata: { ...card.metadata } },
		isNew: options?.isNew,
	};
}

export function generatedCardsToPreviewItems(
	cards: GeneratedCard[],
	options?: { idPrefix?: string }
): AICardPreviewItem[] {
	return cards.map((card) => generatedCardToPreviewItem(card, options));
}
