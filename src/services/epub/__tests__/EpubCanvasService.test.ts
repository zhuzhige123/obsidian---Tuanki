vi.mock('obsidian', async () => {
	const actual = await vi.importActual<typeof import('../../../tests/mocks/obsidian')>(
		'../../../tests/mocks/obsidian'
	);
	return {
		...actual,
		Notice: vi.fn(),
	};
});

import { EpubCanvasService } from '../EpubCanvasService';
import type { CanvasData, CanvasEdge, CanvasNode } from '../canvas-types';

function createNode(id: string, x = 0, y = 0): CanvasNode {
	return {
		id,
		type: 'text',
		text: id,
		x,
		y,
		width: 300,
		height: 120,
	};
}

function createMockApp(initialFiles: Record<string, string>, canvasLeaves: any[] = []) {
	const files = new Map<string, string>(Object.entries(initialFiles));

	const app: any = {
		vault: {
			adapter: {
				exists: vi.fn(async (path: string) => files.has(path)),
				read: vi.fn(async (path: string) => {
					const value = files.get(path);
					if (value === undefined) {
						throw new Error(`Missing file: ${path}`);
					}
					return value;
				}),
				write: vi.fn(async (path: string, content: string) => {
					files.set(path, content);
				}),
				mkdir: vi.fn(async () => {}),
			},
		},
		workspace: {
			getLeavesOfType: vi.fn((type: string) => (type === 'canvas' ? canvasLeaves : [])),
		},
	};

	return { app, files };
}

function readCanvas(files: Map<string, string>, path: string): CanvasData {
	return JSON.parse(files.get(path) || '{"nodes":[],"edges":[]}') as CanvasData;
}

describe('EpubCanvasService', () => {
	it('does not create orphan edges when the stored anchor node no longer exists', async () => {
		const canvasPath = 'Mind.canvas';
		const { app, files } = createMockApp({
			[canvasPath]: JSON.stringify({
				nodes: [createNode('root')],
				edges: [],
			} satisfies CanvasData),
		});
		const service = new EpubCanvasService(app);
		service.setCanvasPath(canvasPath);
		service.setAnchor({ nodeId: 'missing-node', parentNodeId: 'root' });

		const created = await service.addRawTextNode('Fresh note');

		expect(created).not.toBeNull();

		const saved = readCanvas(files, canvasPath);
		expect(saved.nodes).toHaveLength(2);
		expect(saved.edges).toHaveLength(0);
	});

	it('ignores canvas edge selections so new EPUB notes do not attach to non-node ids', async () => {
		const canvasPath = 'Mind.canvas';
		const edge: CanvasEdge = {
			id: 'edge-1',
			fromNode: 'root',
			toNode: 'child',
			fromSide: 'bottom',
			toSide: 'top',
		};
		const canvasData: CanvasData = {
			nodes: [createNode('root'), createNode('child', 0, 160)],
			edges: [edge],
		};
		const canvasLeaves = [
			{
				view: {
					file: { path: canvasPath },
					canvas: {
						selection: new Set([{ id: 'edge-1' }]),
						getData: () => canvasData,
					},
				},
			},
		];
		const { app, files } = createMockApp({
			[canvasPath]: JSON.stringify(canvasData),
		}, canvasLeaves);
		const service = new EpubCanvasService(app);
		service.setCanvasPath(canvasPath);

		service.updateAnchorFromCanvasSelection(app);
		expect(service.getAnchor()).toBeNull();

		await service.addRawTextNode('Detached note');

		const saved = readCanvas(files, canvasPath);
		expect(saved.nodes).toHaveLength(3);
		expect(saved.edges).toHaveLength(1);
		expect(saved.edges[0]).toEqual(edge);
	});
});
