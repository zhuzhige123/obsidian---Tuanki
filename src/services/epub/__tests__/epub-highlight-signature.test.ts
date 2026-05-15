import { buildReaderHighlightCollectionSignature } from '../epub-highlight-signature';
import type { ReaderHighlight } from '../reader-engine-types';

describe('buildReaderHighlightCollectionSignature', () => {
	it('returns the same signature for the same highlight set regardless of order', () => {
		const highlightsA: ReaderHighlight[] = [
			{
				cfiRange: 'readium:b',
				color: 'green',
				text: 'Second',
				createdTime: 2,
				presentation: 'highlight',
				sourceFile: 'Notes/second.md',
				sourceLocators: [{ sourceFile: 'Notes/second.md' }],
			},
			{
				cfiRange: 'readium:a',
				color: 'yellow',
				text: 'First',
				createdTime: 1,
				presentation: 'highlight',
				sourceFile: 'Notes/first.md',
				sourceRef: 'block-a',
				sourceLocators: [
					{ sourceFile: 'Notes/first.md', sourceRef: 'block-a' },
					{ sourceFile: 'Canvas/map.canvas', sourceRef: 'canvas-file-node:node-1' },
				],
			},
		];

		const highlightsB: ReaderHighlight[] = [
			{
				cfiRange: 'readium:a',
				color: 'yellow',
				text: 'First',
				createdTime: 1,
				presentation: 'highlight',
				sourceLocators: [
					{ sourceFile: 'Canvas/map.canvas', sourceRef: 'canvas-file-node:node-1' },
					{ sourceFile: 'Notes/first.md', sourceRef: 'block-a' },
				],
			},
			{
				cfiRange: 'readium:b',
				color: 'green',
				text: 'Second',
				createdTime: 2,
				presentation: 'highlight',
				sourceLocators: [{ sourceFile: 'Notes/second.md' }],
			},
		];

		expect(buildReaderHighlightCollectionSignature(highlightsA)).toBe(
			buildReaderHighlightCollectionSignature(highlightsB)
		);
	});

	it('returns a different signature when highlight content changes', () => {
		const base: ReaderHighlight[] = [
			{
				cfiRange: 'readium:a',
				color: 'yellow',
				text: 'Same',
				createdTime: 1,
				presentation: 'highlight',
				sourceLocators: [{ sourceFile: 'Notes/demo.md', sourceRef: 'block-a' }],
			},
		];

		const changed: ReaderHighlight[] = [
			{
				...base[0],
				color: 'green',
			},
		];

		expect(buildReaderHighlightCollectionSignature(base)).not.toBe(
			buildReaderHighlightCollectionSignature(changed)
		);
	});
});
