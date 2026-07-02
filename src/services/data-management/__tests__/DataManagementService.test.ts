vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  return {
    ...actual,
    App: actual.App ?? class MockApp {},
    TFile: actual.TFile ?? class MockTFile {},
    ItemView: actual.ItemView ?? class MockItemView {},
    WorkspaceLeaf: actual.WorkspaceLeaf ?? class MockWorkspaceLeaf {},
    MarkdownView: actual.MarkdownView ?? class MockMarkdownView {},
    Notice: actual.Notice ?? class MockNotice { constructor(_message?: string) {} },
    Menu: actual.Menu ?? class MockMenu {},
    Modal: actual.Modal ?? class MockModal {},
    Plugin: actual.Plugin ?? class MockPlugin {},
    PluginSettingTab: actual.PluginSettingTab ?? class MockPluginSettingTab {},
    Platform: actual.Platform ?? { isMobile: false },
    normalizePath:
      actual.normalizePath ??
      ((value: string) => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')),
  };
});

import { getPluginPaths, getV2Paths } from '../../../config/paths';
import { resolveIRImportFolder } from '../../../config/paths';
import {
  DEFAULT_BATCH_FIX_TYPES,
  DataManagementService,
  filterDisplayableDataCheckResults,
  getDataCheckLifecycleKind,
  getDataCheckLifecycleLabel,
  getDataCheckLifecycleNote,
  HIDDEN_RESCUE_CHECK_TYPES,
  isHiddenRescueCheckType,
  isRetirementCandidateCheckType,
  isSplitPluginResidueCheckType,
  MAIN_PLUGIN_HIGH_RISK_FIX_TYPES,
  RETIREMENT_CANDIDATE_CHECK_TYPES,
  SPLIT_PLUGIN_RESIDUE_CHECK_TYPES,
} from '../DataManagementService';
import { WDeckService } from '../../wdeck/WDeckService';
import { DataConsistencyService } from '../../reference-deck/DataConsistencyService';
import { extractBodyContent, parseYAMLFromContent } from '../../../utils/yaml-utils';

function normalizeTestPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function parentPath(path: string): string {
  const normalized = normalizeTestPath(path);
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : '';
}

function toRecoveryBackupPath(filePath: string): string {
  return `${normalizeTestPath(getPluginPaths({ vault: { configDir: '.obsidian' } } as any).backups)}/json-recovery/${normalizeTestPath(filePath).replace(/[\/]/g, '__')}`;
}

function createMemoryPlugin(initialFiles: Record<string, string> = {}, initialDirs: string[] = []) {
  const files = new Map<string, string>();
  const folders = new Set<string>(['', '.obsidian', '.obsidian/plugins', '.obsidian/plugins/weave']);

  const stringifyFrontmatter = (frontmatter: Record<string, unknown>): string => {
    const entries = Object.entries(frontmatter).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return '';
    }

    const lines: string[] = [];
    for (const [key, value] of entries) {
      if (Array.isArray(value)) {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${String(item)}`);
        }
        continue;
      }

      lines.push(`${key}: ${String(value)}`);
    }

    return `---\n${lines.join('\n')}\n---\n`;
  };

  const ensureDir = (dir: string) => {
    const normalized = normalizeTestPath(dir);
    if (!normalized) return;
    const parts = normalized.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      folders.add(current);
    }
  };

  const writeText = (path: string, content: string) => {
    const normalized = normalizeTestPath(path);
    ensureDir(parentPath(normalized));
    files.set(normalized, content);
  };

  for (const [path, content] of Object.entries(initialFiles)) {
    writeText(path, content);
  }

  for (const dir of initialDirs) {
    ensureDir(dir);
  }

  const adapter = {
    basePath: 'C:/vault',
    exists: async (path: string) => {
      const normalized = normalizeTestPath(path);
      return files.has(normalized) || folders.has(normalized);
    },
    mkdir: async (path: string) => {
      ensureDir(path);
    },
    list: async (dir: string) => {
      const normalized = normalizeTestPath(dir);
      const prefix = normalized ? `${normalized}/` : '';
      const childFolders = new Set<string>();
      const childFiles: string[] = [];

      for (const folder of folders) {
        if (!folder || folder === normalized || !folder.startsWith(prefix)) continue;
        const rest = folder.slice(prefix.length);
        if (!rest || rest.includes('/')) continue;
        childFolders.add(folder);
      }

      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        if (!rest || rest.includes('/')) continue;
        childFiles.push(file);
      }

      return {
        files: childFiles.sort(),
        folders: Array.from(childFolders).sort(),
      };
    },
    read: async (path: string) => {
      const normalized = normalizeTestPath(path);
      const value = files.get(normalized);
      if (value === undefined) throw new Error(`File not found: ${normalized}`);
      return value;
    },
    write: async (path: string, content: string) => {
      writeText(path, content);
    },
    remove: async (path: string) => {
      const normalized = normalizeTestPath(path);
      if (files.has(normalized)) {
        files.delete(normalized);
        return;
      }
      folders.delete(normalized);
    },
    rename: async (oldPath: string, newPath: string) => {
      const normalizedOld = normalizeTestPath(oldPath);
      const normalizedNew = normalizeTestPath(newPath);
      const content = files.get(normalizedOld);
      if (content === undefined) {
        throw new Error(`File not found: ${normalizedOld}`);
      }
      files.delete(normalizedOld);
      writeText(normalizedNew, content);
    },
    rmdir: async (dir: string, recursive = false) => {
      const normalized = normalizeTestPath(dir);
      if (recursive) {
        for (const file of Array.from(files.keys())) {
          if (file === normalized || file.startsWith(`${normalized}/`)) {
            files.delete(file);
          }
        }
        for (const folder of Array.from(folders)) {
          if (folder === normalized || folder.startsWith(`${normalized}/`)) {
            folders.delete(folder);
          }
        }
        return;
      }

      const listing = await adapter.list(normalized);
      if (listing.files.length === 0 && listing.folders.length === 0) {
        folders.delete(normalized);
      }
    },
  };

  const clearCache = vi.fn();
  const plugin = {
    app: {
      plugins: {
        getPlugin: vi.fn(() => null),
      },
      fileManager: {
        renameFile: async (file: { path: string }, newPath: string) => {
          await adapter.rename(file.path, newPath);
        },
        processFrontMatter: vi.fn(async (file: { path: string }, handler: (frontmatter: Record<string, unknown>) => void) => {
          const normalized = normalizeTestPath(file.path);
          const current = files.get(normalized);
          if (current === undefined) {
            throw new Error(`File not found: ${normalized}`);
          }

          const frontmatter = parseYAMLFromContent(current);
          handler(frontmatter);
          const body = extractBodyContent(current);
          files.set(normalized, `${stringifyFrontmatter(frontmatter)}${body}`);
        })
      },
      vault: {
        configDir: '.obsidian',
        adapter,
        cachedRead: async (file: { path: string }) => {
          return await adapter.read(file.path);
        },
        getFiles: () => {
          return Array.from(files.keys()).map((path) => {
            const normalized = normalizeTestPath(path);
            const parts = normalized.split('/');
            const basenameWithExt = parts[parts.length - 1] || normalized;
            const dotIndex = basenameWithExt.lastIndexOf('.');
            return {
              path: normalized,
              basename: dotIndex > 0 ? basenameWithExt.slice(0, dotIndex) : basenameWithExt,
              extension: dotIndex > 0 ? basenameWithExt.slice(dotIndex + 1) : '',
              stat: { mtime: 0 },
            };
          });
        },
        getAbstractFileByPath: (path: string) => {
          const normalized = normalizeTestPath(path);
          return files.has(normalized) || folders.has(normalized)
            ? { path: normalized }
            : null;
        },
      },
    },
    settings: {
      weaveParentFolder: '',
      incrementalReading: {},
    },
    dataStorage: {
      getCards: vi.fn().mockResolvedValue([]),
      getDecks: vi.fn().mockResolvedValue([]),
      saveCard: vi.fn().mockResolvedValue({ success: true }),
    },
    wdeckService: {
      rebuildCache: vi.fn().mockResolvedValue(undefined),
    },
    saveSettings: vi.fn().mockResolvedValue(undefined),
  } as any;

  plugin.wdeckService = new WDeckService(plugin);

  return {
    plugin,
    files,
    folders,
    rebuildCache: plugin.wdeckService.rebuildCache,
    clearCache,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DataManagementService', () => {
  it('fixAll only executes the default safe fix set', async () => {
    const { plugin } = createMemoryPlugin();
    const rebuildCacheSpy = vi.spyOn(plugin.wdeckService, 'rebuildCache');
    const service = new DataManagementService(plugin);
    const fixSpy = vi
      .spyOn(service, 'fix')
      .mockImplementation(async (type: any) => ({
        type,
        success: 1,
        failed: 0,
        errors: [],
      }));

    vi.useFakeTimers();
    const promise = service.fixAll();
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(fixSpy.mock.calls.map(([type]) => type)).toEqual(DEFAULT_BATCH_FIX_TYPES);
    expect(results.map((result) => result.type)).toEqual(DEFAULT_BATCH_FIX_TYPES);
    expect(rebuildCacheSpy).toHaveBeenCalledTimes(DEFAULT_BATCH_FIX_TYPES.length);
  });

  it('checks orphan cards from authoritative card membership instead of deck cache', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getDecks.mockResolvedValue([
      {
        id: 'deck-a',
        name: '牌组A',
        purpose: 'memory',
        cardUUIDs: []
      }
    ]);
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-in-deck',
        content: '---\nwe_decks:\n  - 牌组A\n---\nA',
        modified: '2026-04-30T00:00:00.000Z'
      },
      {
        uuid: 'card-orphan',
        content: '---\n---\nB',
        modified: '2026-04-30T00:00:00.000Z'
      }
    ]);

    const service = new DataManagementService(plugin);
    const result = await service.check('orphan_cards');

    expect(result).toMatchObject({
      type: 'orphan_cards',
      status: 'warning',
      count: 1,
      items: ['card-orphan']
    });
  });

  it('reports deck cache inconsistency when authoritative membership is missing from deck cardUUID cache', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getDecks.mockResolvedValue([
      {
        id: 'deck-a',
        name: '牌组A',
        purpose: 'memory',
        cardUUIDs: []
      }
    ]);
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        content: '---\nwe_decks:\n  - 牌组A\n---\nA',
        referencedByDecks: [],
        modified: '2026-04-30T00:00:00.000Z'
      }
    ]);
    plugin.dataStorage.saveDeck = vi.fn(async () => ({ success: true }));

    const service = new DataManagementService(plugin);
    const result = await service.check('card_deck_consistency');

    expect(result).toMatchObject({
      type: 'card_deck_consistency',
      status: 'warning',
      count: 1,
      items: ['deck-a']
    });
    expect(result.message).toContain('牌组归属不一致项');
  });

  it('uses the formal deleteCards chain when fixing duplicate cards', async () => {
    const { plugin } = createMemoryPlugin();
    let cards = [
      {
        uuid: 'card-keep',
        content: '---\nwe_decks:\n  - 牌组A\n---\n重复内容',
        modified: '2026-04-30T00:00:00.000Z',
        stats: { totalReviews: 10, totalTime: 10, averageTime: 1 }
      },
      {
        uuid: 'card-dup',
        content: '---\nwe_decks:\n  - 牌组A\n---\n重复内容',
        modified: '2026-04-30T00:00:00.000Z',
        stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
      }
    ];

    plugin.dataStorage.getDecks.mockResolvedValue([
      {
        id: 'deck-a',
        name: '牌组A',
        purpose: 'memory',
        cardUUIDs: ['card-keep']
      }
    ]);
    plugin.dataStorage.getCards.mockImplementation(async () => cards);
    plugin.dataStorage.deleteCards = vi.fn(async (uuids: string[]) => {
      cards = cards.filter((card) => !uuids.includes(card.uuid));
      return {
        deleted: uuids,
        failed: []
      };
    });
    plugin.dataStorage.saveDeck = vi.fn(async () => ({ success: true }));

    const repairConsistencySpy = vi
      .spyOn(DataConsistencyService.prototype, 'repairConsistency')
      .mockResolvedValue({ success: true, repairedCards: 0, cleanedInvalidRefs: 0 });

    const service = new DataManagementService(plugin);
    const result = await service.fix('duplicate_cards', { allowHighRisk: true });

    expect(result).toMatchObject({
      type: 'duplicate_cards',
      success: 1,
      failed: 0
    });
    expect(plugin.dataStorage.deleteCards).toHaveBeenCalledWith(['card-dup']);
    repairConsistencySpy.mockRestore();
  });

  it('aborts duplicate-card deletion when pre-repair consistency fails', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-keep',
        content: '---\nwe_decks:\n  - 牌组A\n---\n重复内容',
        modified: '2026-04-30T00:00:00.000Z',
        stats: { totalReviews: 10, totalTime: 10, averageTime: 1 },
      },
      {
        uuid: 'card-dup',
        content: '---\nwe_decks:\n  - 牌组A\n---\n重复内容',
        modified: '2026-04-30T00:00:00.000Z',
        stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
      },
    ]);
    plugin.dataStorage.deleteCards = vi.fn(async () => ({ deleted: [], failed: [] }));

    vi.spyOn(DataConsistencyService.prototype, 'repairConsistency').mockResolvedValue({
      success: false,
      repairedCards: 0,
      cleanedInvalidRefs: 0,
      error: 'repair failed',
    });

    const service = new DataManagementService(plugin);
    const result = await service.fix('duplicate_cards', { allowHighRisk: true });

    expect(result).toMatchObject({
      type: 'duplicate_cards',
      success: 0,
      failed: 1,
    });
    expect(plugin.dataStorage.deleteCards).not.toHaveBeenCalled();
  });

  it('detects legacy tutorial deck residue cards', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'tutorial-card-1',
        content: '---\nwe_decks:\n  - 未归组卡片\n---\n插件支持哪两种挖空标记？',
        modified: '2026-06-15T00:00:00.000Z',
      },
      {
        uuid: 'normal-card-1',
        content: '---\nwe_decks:\n  - 我的牌组\n---\n自定义内容',
        modified: '2026-06-15T00:00:00.000Z',
      },
    ]);

    const service = new DataManagementService(plugin);
    const result = await service.check('tutorial_deck_residue');

    expect(result).toMatchObject({
      type: 'tutorial_deck_residue',
      status: 'warning',
      count: 1,
      items: ['tutorial-card-1'],
    });
  });

  it('deletes tutorial deck residue cards and rebuilds deck cache', async () => {
    const { plugin } = createMemoryPlugin();
    let cards = [
      {
        uuid: 'tutorial-card-1',
        content: '---\nwe_decks:\n  - Weave 指南\n---\n如何编写渐进式挖空卡片？',
        modified: '2026-06-15T00:00:00.000Z',
      },
      {
        uuid: 'normal-card-1',
        content: '---\nwe_decks:\n  - 我的牌组\n---\n自定义内容',
        modified: '2026-06-15T00:00:00.000Z',
      },
    ];

    plugin.dataStorage.getCards.mockImplementation(async () => cards);
    plugin.dataStorage.getDecks.mockResolvedValue([
      {
        id: 'deck-tutorial',
        name: 'Weave 指南',
        purpose: 'memory',
        cardUUIDs: [],
      },
    ]);
    plugin.dataStorage.deleteCards = vi.fn(async (uuids: string[]) => {
      cards = cards.filter((card) => !uuids.includes(card.uuid));
      return {
        deleted: uuids,
        failed: [],
      };
    });
    plugin.wdeckService.isWDeckDeckId = vi.fn(() => true);
    plugin.wdeckService.dissolveDeckByDeckId = vi.fn().mockResolvedValue(undefined);

    const repairConsistencySpy = vi
      .spyOn(DataConsistencyService.prototype, 'repairConsistency')
      .mockResolvedValue({ success: true, repairedCards: 0, cleanedInvalidRefs: 0 });

    const service = new DataManagementService(plugin);
    const result = await service.fix('tutorial_deck_residue', { allowHighRisk: true });

    expect(result).toMatchObject({
      type: 'tutorial_deck_residue',
      success: 1,
      failed: 0,
    });
    expect(plugin.dataStorage.deleteCards).toHaveBeenCalledWith(['tutorial-card-1']);
    expect(plugin.wdeckService.dissolveDeckByDeckId).toHaveBeenCalledWith('deck-tutorial');
    repairConsistencySpy.mockRestore();
  });

	it('detects repairable structured data file format issues across wdeck irdeck and qbank files', async () => {
		const v2Paths = getV2Paths('');
		const { plugin } = createMemoryPlugin({
			[`${v2Paths.memory.root}/deck-files/demo.wdeck`]: JSON.stringify({
				logicalDeckName: '测试牌组',
				deck: {
					id: 'deck-demo',
					name: '测试牌组',
					purpose: 'memory',
					cardUUIDs: ['card-1'],
					metadata: { fileType: 'legacy' }
				},
				cards: [
					{
						uuid: 'card-1',
						content: 'A',
						deckId: 'wdeck:deck-demo',
						referencedByDecks: ['wdeck:deck-demo'],
						template: 'legacy',
						customFields: {
							keep: 'yes',
							wdeck: {
								runtimeDeckId: 'wdeck:deck-demo',
								sourcePath: `${v2Paths.memory.root}/deck-files/demo.wdeck`
							}
						}
					}
				]
			}),
			[`${v2Paths.ir.root}/topic-a.irdeck`]: JSON.stringify({
				topicName: '专题 A',
				deck: {},
				tagGroups: {},
				tagGroupProfiles: {}
			}),
			[`${v2Paths.questionBank.root}/bank-a.qbank`]: JSON.stringify({
				id: 'bank-a',
				name: '题组 A',
				refs: [
					{
						uuid: 'question-1',
						addedAt: '2026-04-01T00:00:00.000Z'
					}
				]
			})
		});
		const service = new DataManagementService(plugin);

		const result = await service.check('structured_data_format');

		expect(result).toMatchObject({
			type: 'structured_data_format',
			status: 'warning',
			count: 3,
		});
		expect(result.items.some((item) => item.includes('.wdeck'))).toBe(true);
		expect(result.items.some((item) => item.includes('.irdeck'))).toBe(true);
		expect(result.items.some((item) => item.includes('.qbank'))).toBe(true);
		expect(result.items.every((item) => item.includes('[可自动修复]'))).toBe(true);
	});

	it('rewrites structured data files into canonical plugin format', async () => {
		const v2Paths = getV2Paths('');
		const wdeckPath = `${v2Paths.memory.root}/deck-files/demo.wdeck`;
		const irdeckPath = `${v2Paths.ir.root}/topic-a.irdeck`;
		const qbankPath = `${v2Paths.questionBank.root}/bank-a.qbank`;
		const { plugin, files } = createMemoryPlugin({
			[wdeckPath]: JSON.stringify({
				logicalDeckName: '测试牌组',
				deck: {
					id: 'deck-demo',
					name: '测试牌组',
					purpose: 'memory',
					cardUUIDs: ['card-1']
				},
				cards: [
					{
						uuid: 'card-1',
						content: 'A',
						deckId: 'wdeck:deck-demo',
						referencedByDecks: ['wdeck:deck-demo'],
						template: 'legacy',
						customFields: {
							keep: 'yes',
							wdeck: {
								runtimeDeckId: 'wdeck:deck-demo',
								sourcePath: wdeckPath
							}
						}
					}
				]
			}),
			[irdeckPath]: JSON.stringify({
				topicName: '专题 A',
				deck: {},
				tagGroups: {},
				tagGroupProfiles: {}
			}),
			[qbankPath]: JSON.stringify({
				id: 'bank-a',
				name: '题组 A',
				refs: [
					{
						uuid: 'question-1',
						addedAt: '2026-04-01T00:00:00.000Z'
					}
				]
			})
		});
		const service = new DataManagementService(plugin);

		const result = await service.fix('structured_data_format');

		expect(result).toEqual({
			type: 'structured_data_format',
			success: 3,
			failed: 0,
			errors: [],
		});

		const parsedWdeck = JSON.parse(files.get(wdeckPath) || '{}');
		expect(parsedWdeck.fileType).toBe('wdeck');
		expect(parsedWdeck.schemaVersion).toBe(1);
		expect(parsedWdeck.deck.cardUUIDs).toBeUndefined();
		expect(parsedWdeck.cards[0].deckId).toBeUndefined();
		expect(parsedWdeck.cards[0].referencedByDecks).toBeUndefined();
		expect(parsedWdeck.cards[0].template).toBeUndefined();
		expect(parsedWdeck.cards[0].customFields.keep).toBe('yes');
		expect(parsedWdeck.cards[0].customFields.wdeck).toBeUndefined();

		const parsedIrdeck = JSON.parse(files.get(irdeckPath) || '{}');
		expect(parsedIrdeck.schemaVersion).toBe(1);
		expect(parsedIrdeck.topicName).toBe('专题 A');
		expect(parsedIrdeck.tagGroups.default).toBeDefined();
		expect(parsedIrdeck.tagGroupProfiles.default).toBeDefined();
		expect(Array.isArray(parsedIrdeck.points)).toBe(true);

		const parsedQbank = JSON.parse(files.get(qbankPath) || '{}');
		expect(parsedQbank.refs).toBeUndefined();
		expect(Array.isArray(parsedQbank.questions)).toBe(true);
		expect(parsedQbank.questions[0]).toMatchObject({
			cardUuid: 'question-1',
			testHistory: [],
		});
		expect(parsedQbank.questions[0].stats).toBeDefined();
		expect(parsedQbank.stats.totalQuestions).toBe(1);
	});

	it('does not keep reporting qbank structured_data_format issues after a successful fix', async () => {
		const v2Paths = getV2Paths('');
		const qbankPath = `${v2Paths.questionBank.root}/bank-a.qbank`;
		const { plugin } = createMemoryPlugin({
			[qbankPath]: JSON.stringify({
				id: 'bank-a',
				name: '题组 A',
				refs: [
					{
						uuid: 'question-1',
						addedAt: '2026-04-01T00:00:00.000Z'
					}
				]
			})
		});
		const service = new DataManagementService(plugin);

		const before = await service.check('structured_data_format');
		expect(before).toMatchObject({
			type: 'structured_data_format',
			status: 'warning',
			count: 1,
		});
		expect(before.items[0]).toContain('.qbank');

		const fixed = await service.fix('structured_data_format');
		expect(fixed).toEqual({
			type: 'structured_data_format',
			success: 1,
			failed: 0,
			errors: [],
		});

		const after = await service.check('structured_data_format');
		expect(after).toMatchObject({
			type: 'structured_data_format',
			status: 'ok',
			count: 0,
		});
		expect(after.items).toEqual([]);
	});

	it('restores invalid wdeck files from valid backup during structured data fix', async () => {
		const v2Paths = getV2Paths('');
		const wdeckPath = `${v2Paths.memory.root}/deck-files/demo.wdeck`;
		const backupPath = toRecoveryBackupPath(wdeckPath);
		const validBackup = JSON.stringify({
			fileType: 'wdeck',
			logicalDeckName: '测试牌组',
			deck: {
				name: '测试牌组',
			},
			cards: [],
		});
		const { plugin, files } = createMemoryPlugin({
			[wdeckPath]: '{ bad json',
			[backupPath]: validBackup,
		});
		plugin.wdeckService = new WDeckService(plugin);
		const service = new DataManagementService(plugin);

		const checkResult = await service.check('structured_data_format');
		expect(checkResult).toMatchObject({
			type: 'structured_data_format',
			status: 'warning',
			count: 1,
		});
		expect(checkResult.items[0]).toContain('[可自动修复]');
		expect(checkResult.items[0]).toContain('存在可恢复的有效备份');

		const fixResult = await service.fix('structured_data_format');
		expect(fixResult).toEqual({
			type: 'structured_data_format',
			success: 1,
			failed: 0,
			errors: [],
		});

		const repairedCheckResult = await service.check('structured_data_format');
		expect(repairedCheckResult).toMatchObject({
			type: 'structured_data_format',
			status: 'ok',
			count: 0,
		});
		expect(repairedCheckResult.items).toEqual([]);

		const repaired = JSON.parse(files.get(wdeckPath) || '{}');
		expect(repaired).toMatchObject({
			fileType: 'wdeck',
			schemaVersion: 1,
			logicalDeckName: '测试牌组',
			segmentIndex: 1,
			segmentLabel: '01',
			cards: [],
		});
		expect(repaired.logicalDeckId).toBeTruthy();
		expect(repaired.deck).toMatchObject({
			name: '测试牌组',
			purpose: 'memory',
		});
	});

  it('blocks legacy cleanup when no verified migration report exists', async () => {
    const { plugin } = createMemoryPlugin();
    const service = new DataManagementService(plugin);
    const recoverSpy = vi.spyOn(service, 'recoverMigrationConflictData');
    vi.spyOn(service, 'getLatestMigrationReport').mockResolvedValue(null);

    const result = await service.cleanupLegacyDirectories({ allowHighRisk: true });

    expect(result.type).toBe('legacy_cleanup');
    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.error).toContain('迁移报告');
    expect(recoverSpy).not.toHaveBeenCalled();
  });

  it('includes empty legacy cards and deck-cards directories in legacy cleanup check', async () => {
    const v2Paths = getV2Paths('');
    const { plugin } = createMemoryPlugin({}, [v2Paths.memory.cards, v2Paths.memory.deckCards]);
    const service = new DataManagementService(plugin);

    const result = await service.checkLegacyDirectories();

    expect(result.type).toBe('legacy_cleanup');
    expect(result.items).toEqual(
      expect.arrayContaining([v2Paths.memory.cards, v2Paths.memory.deckCards])
    );
  });

  it('does not treat the deprecated memory/cards directory as required during structure checks', async () => {
    const v2Paths = getV2Paths('');
    const { plugin } = createMemoryPlugin({}, [
      v2Paths.memory.root,
      v2Paths.memory.learning.root,
      v2Paths.ir.root,
      v2Paths.questionBank.root,
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.checkStructure();

    expect(result).toMatchObject({
      type: 'structure_check',
      status: 'ok',
      count: 0,
    });
    expect(result.items).not.toContain(`缺少目录: ${v2Paths.memory.cards}`);
  });

  it('does not recreate the deprecated memory/cards directory during structure repair', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, folders } = createMemoryPlugin();
    const service = new DataManagementService(plugin);

    const result = await service.fixStructure();

    expect(result).toMatchObject({
      type: 'structure_check',
      failed: 0,
    });
    expect(folders.has(v2Paths.memory.root)).toBe(true);
    expect(folders.has(v2Paths.memory.learning.root)).toBe(true);
    expect(folders.has(v2Paths.ir.root)).toBe(true);
    expect(folders.has(v2Paths.questionBank.root)).toBe(true);
    expect(folders.has(v2Paths.memory.cards)).toBe(false);
  });

  it('merges IR monitoring conflict files and removes empty legacy helper directories during legacy cleanup', async () => {
    const v2Paths = getV2Paths('');
    const pluginPaths = getPluginPaths({ vault: { configDir: '.obsidian' } } as any);
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const monitoringPath = pluginPaths.state.incrementalReading.monitoring;
    const { plugin, files, folders } = createMemoryPlugin(
      {
        [monitoringPath]: JSON.stringify({
          version: '3.0.0',
          dailyStats: [{ date: '2026-04-15', dueCount: 1 }],
          priorityChanges: [],
          groupParamChanges: [],
          decisionEvents: [],
          decisionOutcomes: [],
          lastUpdated: '2026-04-15T00:00:00.000Z',
        }),
        [`${conflictDir}/weave_incremental-reading_monitoring.json-1775964650413`]: JSON.stringify({
          version: '3.0.0',
          dailyStats: [{ date: '2026-04-16', dueCount: 2 }],
          priorityChanges: [],
          groupParamChanges: [],
          decisionEvents: [
            {
              itemId: 'chunk-1',
              action: 'schedule_normal',
              timestamp: '2026-04-16T09:00:00.000Z',
            },
          ],
          decisionOutcomes: [],
          lastUpdated: '2026-04-16T09:00:00.000Z',
        }),
      },
      [v2Paths.memory.cards, v2Paths.memory.deckCards]
    );
    const service = new DataManagementService(plugin);
    vi.spyOn(service, 'getLatestMigrationReport').mockResolvedValue({
      status: 'completed',
      verification: { ok: true },
      plan: { targetRoot: v2Paths.root },
    } as any);

    const result = await service.cleanupLegacyDirectories({ allowHighRisk: true });

    expect(result.type).toBe('legacy_cleanup');
    expect(result.failed).toBe(0);
    expect(files.has(`${conflictDir}/weave_incremental-reading_monitoring.json-1775964650413`)).toBe(false);
    expect(folders.has(conflictDir)).toBe(false);
    expect(folders.has(v2Paths.memory.cards)).toBe(false);
    expect(folders.has(v2Paths.memory.deckCards)).toBe(false);

    const monitoring = JSON.parse(files.get(monitoringPath) || '{}');
    expect(monitoring.dailyStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-04-15', dueCount: 1 }),
        expect.objectContaining({ date: '2026-04-16', dueCount: 2 }),
      ])
    );
    expect(monitoring.decisionEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: 'chunk-1' })])
    );
  });

  it('detects auto-recoverable migration conflict files as a standalone check item', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const { plugin } = createMemoryPlugin({
      [`${conflictDir}/weave_incremental-reading_monitoring.json-1775964650413`]: JSON.stringify({
        version: '3.0.0',
        dailyStats: [{ date: '2026-04-16', dueCount: 2 }],
        priorityChanges: [],
        groupParamChanges: [],
        decisionEvents: [],
        decisionOutcomes: [],
        lastUpdated: '2026-04-16T09:00:00.000Z',
      }),
    });
    const service = new DataManagementService(plugin);

    const result = await service.check('migration_conflict_files');

    expect(result).toMatchObject({
      type: 'migration_conflict_files',
      status: 'warning',
      count: 1,
    });
    expect(result.items[0]).toContain('[可自动处理]');
    expect(result.items[0]).toContain('weave_incremental-reading_monitoring.json-1775964650413');
  });

  it('classifies mixed migration conflict files for startup inspection and manual follow-up', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const { plugin } = createMemoryPlugin({
      [`${conflictDir}/weave_incremental-reading_monitoring.json-1775964650413`]: JSON.stringify({
        version: '3.0.0',
        dailyStats: [],
        priorityChanges: [],
        groupParamChanges: [],
        decisionEvents: [],
        decisionOutcomes: [],
        lastUpdated: '2026-04-16T09:00:00.000Z',
      }),
      [`${conflictDir}/weave_custom-legacy-file-1775964650414`]: 'manual-review-needed',
      [`${conflictDir}/unexpected-conflict-copy.txt`]: 'manual-review-needed',
    });
    const service = new DataManagementService(plugin);

    const inspection = await service.inspectMigrationConflictFiles();
    const checkResult = await service.check('migration_conflict_files');

    expect(inspection).toMatchObject({
      conflictDir,
      total: 3,
      autoRecoverableCount: 1,
      manualReviewCount: 2,
    });
    expect(inspection.files).toEqual([
      expect.objectContaining({
        fileName: 'unexpected-conflict-copy.txt',
        autoRecoverable: false,
      }),
      expect.objectContaining({
        fileName: 'weave_custom-legacy-file-1775964650414',
        autoRecoverable: false,
      }),
      expect.objectContaining({
        fileName: 'weave_incremental-reading_monitoring.json-1775964650413',
        autoRecoverable: true,
      }),
    ]);
    expect(checkResult).toMatchObject({
      type: 'migration_conflict_files',
      status: 'error',
      count: 3,
    });
    expect(checkResult.items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('[需人工处理]'),
        expect.stringContaining('[可自动处理]'),
      ])
    );
  });

  it('recovers auto-recoverable migration conflict files without leaving them behind', async () => {
    const v2Paths = getV2Paths('');
    const pluginPaths = getPluginPaths({ vault: { configDir: '.obsidian' } } as any);
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const monitoringPath = pluginPaths.state.incrementalReading.monitoring;
    const conflictPath = `${conflictDir}/weave_incremental-reading_monitoring.json-1775964650413`;
    const { plugin, files } = createMemoryPlugin({
      [monitoringPath]: JSON.stringify({
        version: '3.0.0',
        dailyStats: [{ date: '2026-04-15', dueCount: 1 }],
        priorityChanges: [],
        groupParamChanges: [],
        decisionEvents: [],
        decisionOutcomes: [],
        lastUpdated: '2026-04-15T00:00:00.000Z',
      }),
      [conflictPath]: JSON.stringify({
        version: '3.0.0',
        dailyStats: [{ date: '2026-04-16', dueCount: 2 }],
        priorityChanges: [],
        groupParamChanges: [],
        decisionEvents: [
          {
            itemId: 'chunk-1',
            action: 'schedule_normal',
            timestamp: '2026-04-16T09:00:00.000Z',
          },
        ],
        decisionOutcomes: [],
        lastUpdated: '2026-04-16T09:00:00.000Z',
      }),
    });
    const service = new DataManagementService(plugin);

    const result = await service.fix('migration_conflict_files', { allowHighRisk: true });

    expect(result).toEqual({
      type: 'migration_conflict_files',
      success: 1,
      failed: 0,
      errors: [],
    });
    expect(files.has(conflictPath)).toBe(false);

    const monitoring = JSON.parse(files.get(monitoringPath) || '{}');
    expect(monitoring.dailyStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-04-15', dueCount: 1 }),
        expect.objectContaining({ date: '2026-04-16', dueCount: 2 }),
      ])
    );
    expect(monitoring.decisionEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: 'chunk-1' })])
    );
  });

  it('classifies memory deck-cards and learning session migration conflicts as auto-recoverable', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const { plugin } = createMemoryPlugin({
      [`${conflictDir}/weave_memory_deck-cards_deck-a.json-1778889182527`]: JSON.stringify({
        cardUUIDs: ['card-a'],
      }),
      [`${conflictDir}/weave_memory_learning_sessions_2026-03.json-1778889182528`]: JSON.stringify({
        _schemaVersion: '1.0.0',
        yearMonth: '2026-03',
        sessions: [],
      }),
    });
    const service = new DataManagementService(plugin);

    const inspection = await service.inspectMigrationConflictFiles();

    expect(inspection).toMatchObject({
      total: 2,
      autoRecoverableCount: 2,
      manualReviewCount: 0,
    });
    expect(inspection.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'weave_memory_deck-cards_deck-a.json-1778889182527',
          autoRecoverable: true,
        }),
        expect.objectContaining({
          fileName: 'weave_memory_learning_sessions_2026-03.json-1778889182528',
          autoRecoverable: true,
        }),
      ])
    );
  });

  it('merges memory deck-cards migration conflicts into the formal deck-cards file', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const targetPath = `${v2Paths.memory.deckCards}/deck-a.json`;
    const conflictPath = `${conflictDir}/weave_memory_deck-cards_deck-a.json-1778889182527`;
    const { plugin, files } = createMemoryPlugin({
      [targetPath]: JSON.stringify({ cardUUIDs: ['card-a'] }),
      [conflictPath]: JSON.stringify({ cardUUIDs: ['card-b'] }),
    }, [v2Paths.memory.deckCards]);
    const service = new DataManagementService(plugin);

    const result = await service.fix('migration_conflict_files', { allowHighRisk: true });

    expect(result).toMatchObject({
      type: 'migration_conflict_files',
      success: 1,
      failed: 0,
      errors: [],
    });
    expect(files.has(conflictPath)).toBe(false);
    expect(JSON.parse(files.get(targetPath) || '{}')).toEqual({
      cardUUIDs: ['card-a', 'card-b'],
    });
  });

  it('merges memory learning session migration conflicts into the formal sessions shard', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const targetPath = `${v2Paths.memory.learning.sessions}/2026-03.json`;
    const conflictPath = `${conflictDir}/weave_memory_learning_sessions_2026-03.json-1778889182528`;
    const { plugin, files } = createMemoryPlugin({
      [targetPath]: JSON.stringify({
        _schemaVersion: '1.0.0',
        yearMonth: '2026-03',
        sessions: [
          {
            id: 'session-a',
            deckId: 'deck-a',
            startTime: '2026-03-01T08:00:00.000Z',
            cardsReviewed: 2,
            newCardsLearned: 1,
            correctAnswers: 2,
            totalTime: 120,
            cardReviews: [],
          },
        ],
      }),
      [conflictPath]: JSON.stringify({
        _schemaVersion: '1.0.0',
        yearMonth: '2026-03',
        sessions: [
          {
            id: 'session-b',
            deckId: 'deck-a',
            startTime: '2026-03-02T08:00:00.000Z',
            cardsReviewed: 3,
            newCardsLearned: 0,
            correctAnswers: 2,
            totalTime: 180,
            cardReviews: [],
          },
        ],
      }),
    }, [v2Paths.memory.learning.root, v2Paths.memory.learning.sessions]);
    const service = new DataManagementService(plugin);

    const result = await service.fix('migration_conflict_files', { allowHighRisk: true });

    expect(result).toMatchObject({
      type: 'migration_conflict_files',
      success: 1,
      failed: 0,
      errors: [],
    });
    expect(files.has(conflictPath)).toBe(false);

    const merged = JSON.parse(files.get(targetPath) || '{}');
    expect(merged.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'session-a' }),
        expect.objectContaining({ id: 'session-b' }),
      ])
    );
  });

  it('restores a missing memory learning session shard from a migration conflict copy', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const targetPath = `${v2Paths.memory.learning.sessions}/2026-04.json`;
    const conflictPath = `${conflictDir}/weave_memory_learning_sessions_2026-04.json-1778889182529`;
    const { plugin, files } = createMemoryPlugin({
      [conflictPath]: JSON.stringify({
        _schemaVersion: '1.0.0',
        yearMonth: '2026-04',
        sessions: [
          {
            id: 'session-restored',
            deckId: 'deck-a',
            startTime: '2026-04-01T08:00:00.000Z',
            cardsReviewed: 1,
            newCardsLearned: 1,
            correctAnswers: 1,
            totalTime: 60,
            cardReviews: [],
          },
        ],
      }),
    }, [v2Paths.memory.learning.root, v2Paths.memory.learning.sessions]);
    const service = new DataManagementService(plugin);

    const result = await service.fix('migration_conflict_files', { allowHighRisk: true });

    expect(result).toMatchObject({
      type: 'migration_conflict_files',
      success: 1,
      failed: 0,
    });
    expect(files.has(conflictPath)).toBe(false);
    expect(JSON.parse(files.get(targetPath) || '{}').sessions).toEqual([
      expect.objectContaining({ id: 'session-restored' }),
    ]);
  });

  it('delegates split-plugin residue checks instead of scanning in Weave', async () => {
    const { plugin } = createMemoryPlugin({
      'notes/ir-source.md': [
        '---',
        'title: 测试',
        'weave-reading-id: reading-1',
        'weave-reading-category: later',
        'weave-reading-priority: 50',
        'weave-reading-topic-id: deck-1',
        '---',
        '正文内容'
      ].join('\n'),
    });
    const service = new DataManagementService(plugin);

    const result = await service.check('ir_redundant_frontmatter_cleanup');

    expect(result).toMatchObject({
      type: 'ir_redundant_frontmatter_cleanup',
      status: 'ok',
      count: 0,
    });
    expect(result.message).toContain('weave-incremental-reading');
  });

  it('filters out resolved temporary check results but keeps long-term and failing temporary results', () => {
    const results = filterDisplayableDataCheckResults([
      {
        type: 'wdeck_migration',
        status: 'ok',
        count: 0,
        items: [],
        message: 'temporary resolved'
      },
      {
        type: 'wdeck_migration',
        status: 'error',
        count: 0,
        items: [],
        message: 'temporary failed'
      },
      {
        type: 'card_deck_consistency',
        status: 'ok',
        count: 0,
        items: [],
        message: 'long-term ok'
      }
    ]);

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.message)).toEqual(['temporary failed', 'long-term ok']);
  });

  it('exposes lifecycle metadata for temporary and long-term governance items', () => {
    expect(getDataCheckLifecycleKind('wdeck_migration')).toBe('temporary');
    expect(getDataCheckLifecycleLabel('wdeck_migration')).toBe('临时');
    expect(getDataCheckLifecycleNote('wdeck_migration')).toContain('临时迁移/清理项');

    expect(getDataCheckLifecycleKind('card_deck_consistency')).toBe('long_term');
    expect(getDataCheckLifecycleLabel('card_deck_consistency')).toBe('长期');
    expect(getDataCheckLifecycleNote('card_deck_consistency')).toContain('we_decks');
  });


  it('recovers nested question-bank migration conflict JSON back into the canonical file', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const targetPath = `${v2Paths.questionBank.banksDir}/bank-1/questions.json`;
    const conflictPath =
      `${conflictDir}/Archive_weave_question-bank_banks_bank-1_questions.json-1775964650413`;
    const { plugin, files } = createMemoryPlugin({
      [targetPath]: JSON.stringify({
        _schemaVersion: '2.0.0',
        bankId: 'bank-1',
        refs: [{ cardUuid: 'card-1', addedAt: '2026-04-15T00:00:00.000Z' }],
      }),
      [conflictPath]: JSON.stringify({
        _schemaVersion: '2.0.0',
        bankId: 'bank-1',
        refs: [{ cardUuid: 'card-2', addedAt: '2026-04-16T00:00:00.000Z' }],
      }),
    });
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('migration_conflict_files');
    const fixResult = await service.fix('migration_conflict_files', { allowHighRisk: true });

    expect(checkResult).toMatchObject({
      type: 'migration_conflict_files',
      status: 'warning',
      count: 1,
    });
    expect(checkResult.items[0]).toContain('[可自动处理]');
    expect(fixResult).toEqual({
      type: 'migration_conflict_files',
      success: 1,
      failed: 0,
      errors: [],
    });
    expect(files.has(conflictPath)).toBe(false);

    const parsed = JSON.parse(files.get(targetPath) || '{}');
    expect(parsed.refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardUuid: 'card-1' }),
        expect.objectContaining({ cardUuid: 'card-2' }),
      ])
    );
  });

  it('rebuilds merged question stats after recovering question-bank migration conflicts', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const targetPath = v2Paths.questionBank.questionStats;
    const conflictPath = `${conflictDir}/weave_question-bank_question-stats.json-1775964650413`;
    const { plugin, files } = createMemoryPlugin({
      [targetPath]: JSON.stringify({
        _schemaVersion: '1.0.0',
        statsByUuid: {
          'card-1': {
            totalAttempts: 1,
            correctAttempts: 1,
            incorrectAttempts: 0,
            accuracy: 1,
            bestScore: 100,
            averageScore: 100,
            lastScore: 100,
            averageResponseTime: 1000,
            fastestTime: 1000,
            lastTestDate: '2026-04-15T09:00:00.000Z',
            isInErrorBook: false,
            consecutiveCorrect: 1,
            attempts: [
              {
                isCorrect: true,
                mode: 'exam',
                timestamp: '2026-04-15T09:00:00.000Z',
                score: 100,
                timeSpent: 1000,
              },
            ],
          },
        },
      }),
      [conflictPath]: JSON.stringify({
        _schemaVersion: '1.0.0',
        statsByUuid: {
          'card-1': {
            totalAttempts: 1,
            correctAttempts: 0,
            incorrectAttempts: 1,
            accuracy: 0,
            bestScore: 0,
            averageScore: 0,
            lastScore: 0,
            averageResponseTime: 2000,
            fastestTime: 2000,
            lastTestDate: '2026-04-16T09:00:00.000Z',
            isInErrorBook: true,
            consecutiveCorrect: 0,
            lastIncorrectDate: '2026-04-16T09:00:00.000Z',
            attempts: [
              {
                isCorrect: false,
                mode: 'exam',
                timestamp: '2026-04-16T09:00:00.000Z',
                score: 0,
                timeSpent: 2000,
              },
            ],
          },
        },
      }),
    });
    const service = new DataManagementService(plugin);

    const result = await service.fix('migration_conflict_files', { allowHighRisk: true });

    expect(result).toEqual({
      type: 'migration_conflict_files',
      success: 1,
      failed: 0,
      errors: [],
    });

    const parsed = JSON.parse(files.get(targetPath) || '{}');
    const stats = parsed.statsByUuid?.['card-1'];
    expect(stats.totalAttempts).toBe(2);
    expect(stats.correctAttempts).toBe(1);
    expect(stats.incorrectAttempts).toBe(1);
    expect(stats.accuracy).toBe(0.5);
    expect(stats.attempts).toHaveLength(2);
    expect(stats.lastTestDate).toBe('2026-04-16T09:00:00.000Z');
    expect(stats.isInErrorBook).toBe(true);
    expect(stats.consecutiveCorrect).toBe(0);
    expect(files.has(conflictPath)).toBe(false);
  });

  it('does not include .wdeck migration in the main unified check list once it is demoted to hidden rescue', async () => {
    const { plugin } = createMemoryPlugin();
    const service = new DataManagementService(plugin);
    const checkSpy = vi
      .spyOn(service, 'check')
      .mockImplementation(async (type: any) => ({
        type,
        status: 'ok',
        count: 0,
        items: [],
        message: `${type} ok`,
      }));

    const results = await service.checkAll();

    expect(checkSpy.mock.calls.map(([type]) => type)).not.toContain('wdeck_migration');
    expect(results.some((result) => result.type === 'wdeck_migration')).toBe(false);
  });

  it('does not include split-plugin residue governance items in the main unified check list', async () => {
    const { plugin } = createMemoryPlugin();
    const service = new DataManagementService(plugin);
    const checkSpy = vi
      .spyOn(service, 'check')
      .mockImplementation(async (type: any) => ({
        type,
        status: 'ok',
        count: 0,
        items: [],
        message: `${type} ok`,
      }));

    await service.checkAll();

    const checkedTypes = checkSpy.mock.calls.map(([type]) => type);
    for (const type of SPLIT_PLUGIN_RESIDUE_CHECK_TYPES) {
      expect(checkedTypes).not.toContain(type);
    }
  });

  it('does not include split-plugin residue items in the main high-risk fix list', () => {
    for (const type of SPLIT_PLUGIN_RESIDUE_CHECK_TYPES) {
      expect(MAIN_PLUGIN_HIGH_RISK_FIX_TYPES).not.toContain(type);
    }
    expect(MAIN_PLUGIN_HIGH_RISK_FIX_TYPES).not.toContain('legacy_memory_files');
  });

  it('marks split-plugin residue items, legacy JSON cleanup, and .wdeck migration as hidden rescue capabilities', () => {
    expect(HIDDEN_RESCUE_CHECK_TYPES).toEqual([
      ...SPLIT_PLUGIN_RESIDUE_CHECK_TYPES,
      'legacy_memory_files',
      'wdeck_migration',
    ]);
    for (const type of SPLIT_PLUGIN_RESIDUE_CHECK_TYPES) {
      expect(isSplitPluginResidueCheckType(type)).toBe(true);
      expect(isHiddenRescueCheckType(type)).toBe(true);
    }
    expect(isHiddenRescueCheckType('legacy_memory_files')).toBe(true);
    expect(isHiddenRescueCheckType('wdeck_migration')).toBe(true);
  });

  it('delegates split-plugin residue checks to the owning standalone plugin', async () => {
    const { plugin } = createMemoryPlugin({});
    const service = new DataManagementService(plugin);

    const notInstalled = await service.check('ir_point_storage_migration');
    expect(notInstalled.status).toBe('ok');
    expect(notInstalled.count).toBe(0);
    expect(notInstalled.message).toContain('weave-incremental-reading');
    expect(notInstalled.message).toContain('安装');

    vi.mocked(plugin.app.plugins.getPlugin).mockImplementation((id: string) =>
      id === 'weave-incremental-reading' ? {} : null
    );

    const installed = await service.check('ir_point_storage_migration');
    expect(installed.status).toBe('ok');
    expect(installed.count).toBe(0);
    expect(installed.message).toContain('weave-incremental-reading');
    expect(installed.message).not.toContain('安装');
  });

  it('delegates split-plugin residue fixes to standalone IR/EPUB plugins', async () => {
    const { plugin } = createMemoryPlugin({});
    const service = new DataManagementService(plugin);

    for (const type of SPLIT_PLUGIN_RESIDUE_CHECK_TYPES) {
      const result = await service.fix(type, { allowHighRisk: true });
      expect(result.type).toBe(type);
      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]?.uuid).toBe(type);
      expect(result.errors[0]?.error).toContain(
        type.startsWith('ir_') ? 'weave-incremental-reading' : 'weave-epub-reader'
      );
    }
  });

  it('clears the current retirement candidate set after the remaining history items are demoted to hidden rescue', () => {
    expect(RETIREMENT_CANDIDATE_CHECK_TYPES).toEqual([]);

    for (const type of RETIREMENT_CANDIDATE_CHECK_TYPES) {
      expect(isRetirementCandidateCheckType(type)).toBe(true);
    }
  });

  it('restores a sync conflict copy as the canonical file when the original is missing', async () => {
    const v2Paths = getV2Paths('');
    const conflictPath = `${v2Paths.memory.cards}/default 2.json`;
    const content = JSON.stringify({
      cards: [{ uuid: 'card-1', content: 'restored' }],
    });
    const { plugin, files } = createMemoryPlugin({
      [conflictPath]: content,
    });
    const service = new DataManagementService(plugin);

    const result = await (service as any).fixSyncConflictFiles();

    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(files.get(`${v2Paths.memory.cards}/default.json`)).toBe(content);
    expect(files.has(conflictPath)).toBe(false);
  });

  it('archives unmergeable sync conflicts instead of deleting them', async () => {
    const v2Paths = getV2Paths('');
    const pluginPaths = getPluginPaths({
      vault: { configDir: '.obsidian' },
    } as any);
    const originalPath = `${v2Paths.ir.root}/sources.json`;
    const conflictPath = `${v2Paths.ir.root}/sources 2.json`;
    const originalContent = '{"sources":[{"id":"current"}]}';
    const conflictContent = '{"sources":[{"id":"conflict"}]}';
    const { plugin, files } = createMemoryPlugin({
      [originalPath]: originalContent,
      [conflictPath]: conflictContent,
    });
    const service = new DataManagementService(plugin);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T00:00:00.000Z'));

    const result = await (service as any).fixSyncConflictFiles();
    const expectedArchivePath =
      `${pluginPaths.backups}/sync-conflicts/2026-03-24T00-00-00-000Z/` +
      `${conflictPath.replace(/[\\/:]/g, '__')}`;

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.error).toContain(expectedArchivePath);
    expect(files.get(originalPath)).toBe(originalContent);
    expect(files.get(expectedArchivePath)).toBe(conflictContent);
    expect(files.has(conflictPath)).toBe(false);
  });

  it('imports migration conflicts through dataStorage.saveCardsBatch and marks the deck index for rebuild', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const importedAt = '2026-03-30T00:00:00.000Z';
    const importedDeck = {
      id: 'deck-import',
      name: 'Imported Deck',
      description: '',
      category: '',
      path: 'Imported Deck',
      level: 0,
      order: 0,
      inheritSettings: false,
      created: importedAt,
      modified: importedAt,
      includeSubdecks: false,
      stats: {
        totalCards: 1,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
        todayNew: 0,
        todayReview: 0,
        todayTime: 0,
        totalReviews: 0,
        totalTime: 0,
        memoryRate: 0,
        averageEase: 0,
        forecastDays: {},
      },
      tags: [],
      metadata: {},
      cardUUIDs: ['card-1'],
    };

    const { plugin, files } = createMemoryPlugin({
      [`${conflictDir}/weave_memory_decks.json-1`]: JSON.stringify({ decks: [importedDeck] }),
      [`${conflictDir}/weave_memory_cards_default.json-1`]: JSON.stringify({
        cards: [
          {
            uuid: 'card-1',
            content: 'Imported content',
            deckId: 'deck-import',
          },
        ],
      }),
    });
    const saveCardsBatch = vi.fn().mockResolvedValue(undefined);
    const markFullRebuildRequired = vi.fn().mockResolvedValue(undefined);
    plugin.dataStorage.saveCardsBatch = saveCardsBatch;
    plugin.dataStorage.getCurrentDefaultDeckSettings = vi.fn().mockReturnValue({});
    plugin.deckMembershipIndexService = { markFullRebuildRequired };
    plugin.bodyFingerprintIndexService = { markFullRebuildRequired };

    const service = new DataManagementService(plugin);

    const result = await (service as any).importMigrationConflicts(v2Paths);

    expect(result.importedCards).toBe(1);
    expect(result.importedDecks).toBe(1);
    expect(saveCardsBatch).toHaveBeenCalledTimes(1);
    expect(markFullRebuildRequired).toHaveBeenCalledTimes(2);
    expect(saveCardsBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        uuid: 'card-1',
        deckId: 'deck-import',
        content: expect.stringContaining('Imported Deck'),
      }),
    ]);
    expect(files.has(`${conflictDir}/weave_memory_decks.json-1`)).toBe(false);
    expect(files.has(`${conflictDir}/weave_memory_cards_default.json-1`)).toBe(false);
  });

  it('keeps non-memory migration conflict files when importing legacy memory conflicts', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const monitoringConflictPath =
      `${conflictDir}/weave_incremental-reading_monitoring.json-1775964650413`;
    const importedDeck = {
      id: 'deck-import',
      name: 'Imported Deck',
      description: '',
      category: '',
      path: 'Imported Deck',
      level: 0,
      order: 0,
      inheritSettings: false,
      created: '2026-03-30T00:00:00.000Z',
      modified: '2026-03-30T00:00:00.000Z',
      includeSubdecks: false,
      stats: {
        totalCards: 1,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
        todayNew: 0,
        todayReview: 0,
        todayTime: 0,
        totalReviews: 0,
        totalTime: 0,
        memoryRate: 0,
        averageEase: 0,
        forecastDays: {},
      },
      tags: [],
      metadata: {},
      cardUUIDs: ['card-1'],
    };

    const { plugin, files } = createMemoryPlugin({
      [`${conflictDir}/weave_memory_decks.json-1`]: JSON.stringify({ decks: [importedDeck] }),
      [`${conflictDir}/weave_memory_cards_default.json-1`]: JSON.stringify({
        cards: [
          {
            uuid: 'card-1',
            content: 'Imported content',
            deckId: 'deck-import',
          },
        ],
      }),
      [monitoringConflictPath]: JSON.stringify({
        version: '3.0.0',
        dailyStats: [{ date: '2026-04-16', dueCount: 2 }],
        priorityChanges: [],
        groupParamChanges: [],
        decisionEvents: [],
        decisionOutcomes: [],
        lastUpdated: '2026-04-16T09:00:00.000Z',
      }),
    });
    plugin.dataStorage.saveCardsBatch = vi.fn().mockResolvedValue(undefined);
    plugin.deckMembershipIndexService = { markFullRebuildRequired: vi.fn().mockResolvedValue(undefined) };
    const service = new DataManagementService(plugin);

    await (service as any).importMigrationConflicts(v2Paths);

    expect(files.has(`${conflictDir}/weave_memory_decks.json-1`)).toBe(false);
    expect(files.has(`${conflictDir}/weave_memory_cards_default.json-1`)).toBe(false);
    expect(files.has(monitoringConflictPath)).toBe(true);
  });

  it('delegates legacy epub source link checks to the EPUB reader plugin', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        content: '[[Books/demo.epub#weave-cfi=readium%3Aabc&chapter=3&text=Hello%20world|Old]]',
      },
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.check('epub_source_link_migration');

    expect(result).toMatchObject({
      type: 'epub_source_link_migration',
      status: 'ok',
      count: 0,
    });
    expect(result.message).toContain('weave-epub-reader');
  });



  it('detects memory decks that can be migrated to .wdeck files', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getDecks.mockResolvedValue([
      {
        id: 'deck-1',
        name: '寰幆绯荤粺',
        purpose: 'memory',
        cardUUIDs: ['card-1'],
      },
    ]);
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        deckId: 'deck-1',
        content: '心脏的作用',
        created: '2026-04-14T00:00:00.000Z',
        modified: '2026-04-14T00:00:00.000Z',
      },
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.checkWDeckMigration();

    expect(result).toMatchObject({
      type: 'wdeck_migration',
      status: 'warning',
      count: 1,
    });
    expect(result.items[0]).toContain('寰幆绯荤粺_01.wdeck');
  });

  it('exports memory decks to .wdeck files', async () => {
    const { plugin, files } = createMemoryPlugin({
      'weave/memory/decks.json': JSON.stringify({
        decks: [
          {
            id: 'deck-1',
            name: '寰幆绯荤粺',
            purpose: 'memory',
            metadata: {},
          },
        ],
      }),
    });
    plugin.dataStorage.getDecks.mockResolvedValue([
      {
        id: 'deck-1',
        name: '寰幆绯荤粺',
        purpose: 'memory',
        cardUUIDs: ['card-1'],
      },
    ]);
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        deckId: 'deck-1',
        content: '心脏的作用',
        created: '2026-04-14T00:00:00.000Z',
        modified: '2026-04-14T00:00:00.000Z',
        customFields: {
          tag: 'keep',
        },
      },
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.executeWDeckMigration({ confirmed: true });
    const outputPath = Array.from(files.keys()).find((path) => path.endsWith('.wdeck'));

    expect(result).toEqual({
      type: 'wdeck_migration',
      success: 1,
      failed: 0,
      errors: [],
    });
    expect(outputPath).toBe('weave/memory/deck-files/寰幆绯荤粺_01.wdeck');

    const parsed = JSON.parse(files.get(outputPath!) || '{}');
    expect(parsed).toMatchObject({
      fileType: 'wdeck',
      logicalDeckId: 'deck-1',
      logicalDeckName: '寰幆绯荤粺',
      segmentIndex: 1,
      segmentLabel: '01',
      segmentId: '寰幆绯荤粺_01',
    });
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0]).toMatchObject({
      uuid: 'card-1',
      content: '心脏的作用',
      customFields: {
        tag: 'keep',
      },
    });
    expect(parsed.cards[0].customFields.wdeck).toBeUndefined();

    const decksData = JSON.parse(files.get('weave/memory/decks.json') || '{}');
    expect(decksData.decks[0].metadata.wdeckMigration).toMatchObject({
      status: 'migrated',
      logicalDeckId: 'deck-1',
      filePath: 'weave/memory/deck-files/寰幆绯荤粺_01.wdeck',
    });
  });
  it('moves orphan legacy cards into 未归组卡片_01.wdeck and removes old JSON residues', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, files } = createMemoryPlugin({
      [`${v2Paths.memory.cards}/default.json`]: JSON.stringify({
        cards: [{ uuid: 'orphan-card', content: 'orphan' }],
      }),
      [`${v2Paths.memory.cards}/card-files-index.json`]: JSON.stringify({ files: [] }),
      [`${v2Paths.memory.deckCards}/deck-1.json`]: JSON.stringify({ cardUUIDs: ['card-1'] }),
    });
    plugin.dataStorage.getDecks.mockResolvedValue([
      {
        id: 'deck-1',
        name: '正常牌组',
        purpose: 'memory',
        cardUUIDs: ['card-1'],
      },
    ]);
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        deckId: 'deck-1',
        content: 'in deck',
      },
      {
        uuid: 'orphan-card',
        content: 'orphan',
      },
    ]);

    const service = new DataManagementService(plugin);
    const result = await service.executeWDeckMigration({ confirmed: true });

    expect(result.success).toBe(2);
    expect(files.has('weave/memory/deck-files/未归组卡片_01.wdeck')).toBe(true);
    expect(files.has(`${v2Paths.memory.cards}/default.json`)).toBe(false);
    expect(files.has(`${v2Paths.memory.cards}/card-files-index.json`)).toBe(false);
    expect(files.has(`${v2Paths.memory.deckCards}/deck-1.json`)).toBe(false);

    const orphanDeck = JSON.parse(files.get('weave/memory/deck-files/未归组卡片_01.wdeck') || '{}');
    expect(orphanDeck.cards).toEqual(
      expect.arrayContaining([expect.objectContaining({ uuid: 'orphan-card', content: 'orphan' })])
    );
  });

  it('skips legacy orphan cards whose body already exists in .wdeck', async () => {
    const v2Paths = getV2Paths('');
    const { plugin } = createMemoryPlugin({
      [`${v2Paths.memory.cards}/default.json`]: JSON.stringify({
        cards: [{ uuid: 'legacy-dup', content: '---\n---\n重复正文' }],
      }),
    });
    plugin.dataStorage.getDecks.mockResolvedValue([]);
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'wdeck-keep',
        content: '---\n---\n重复正文',
        deckId: 'wdeck:未归组卡片',
        customFields: {
          wdeck: {
            runtimeDeckId: 'wdeck:未归组卡片',
            logicalDeckId: '未归组卡片',
            logicalDeckName: '未归组卡片',
            sourcePath: 'weave/memory/deck-files/未归组卡片_01.wdeck',
          },
        },
      },
    ]);

    const service = new DataManagementService(plugin);
    const check = await service.check('wdeck_migration');

    expect(check.status).toBe('ok');
    expect(check.count).toBe(0);
  });

  it('fixes filename compatibility when sync-safe target already exists with identical content', async () => {
    const v2Paths = getV2Paths('');
    const safeName = '一,基础营养学 单选题(1-50题).md';
    const unsafeName = '一、基础营养学 单选题（1-50题）.md';
    const { plugin, files } = createMemoryPlugin({
      [`${v2Paths.root}/${safeName}`]: 'same body',
      [`${v2Paths.root}/${unsafeName}`]: 'same body',
    });
    const service = new DataManagementService(plugin);

    const before = await service.check('filename_compatibility');
    expect(before.count).toBeGreaterThan(0);

    const result = await service.fix('filename_compatibility', { allowHighRisk: true });
    expect(result.failed).toBe(0);
    expect(result.success).toBeGreaterThan(0);
    expect(files.has(`${v2Paths.root}/${unsafeName}`)).toBe(false);
    expect(files.has(`${v2Paths.root}/${safeName}`)).toBe(true);

    const after = await service.check('filename_compatibility');
    expect(after.status).toBe('ok');
    expect(after.count).toBe(0);
  });

  it('cleans migration conflict copies when canonical sync-safe file already exists', async () => {
    const v2Paths = getV2Paths('');
    const safeName = '一,基础营养学 单选题(1-50题).md';
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const conflictName = 'weave_一、基础营养学 单选题（1-50题）.md-1778910631636';
    const { plugin, files } = createMemoryPlugin(
      {
        [`${v2Paths.root}/${safeName}`]: 'same body',
        [`${conflictDir}/${conflictName}`]: 'same body',
      },
      [conflictDir]
    );
    const service = new DataManagementService(plugin);

    const result = await service.fix('filename_compatibility', { allowHighRisk: true });
    expect(result.failed).toBe(0);
    expect(result.success).toBeGreaterThan(0);
    expect(files.has(`${conflictDir}/${conflictName}`)).toBe(false);

    const after = await service.check('filename_compatibility');
    expect(after.status).toBe('ok');
    expect(after.count).toBe(0);
  });

  it('ignores macOS DS_Store sync junk in filename compatibility checks', async () => {
    const v2Paths = getV2Paths('');
    const { plugin } = createMemoryPlugin({
      [`${v2Paths.root}/DS_Store-sync1-sync1-sync1-sync1`]: '',
      [`${v2Paths.root}/.DS_Store`]: '',
    });
    const service = new DataManagementService(plugin);

    const check = await service.check('filename_compatibility');
    expect(check.status).toBe('ok');
    expect(check.count).toBe(0);
  });

  it('cleans schema-version and vault markdown migration conflict copies through migration_conflict_files fix', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const safeName = '一,基础营养学 单选题(1-50题).md';
    const { plugin, files } = createMemoryPlugin(
      {
        [v2Paths.schemaVersion]: '{"schemaVersion":"3.0.0"}',
        [`${conflictDir}/weave_schema-version.json-1778889183351`]: '{"schemaVersion":"3.0.0"}',
        [`${conflictDir}/weave_schema-version.json-1778910631628`]: '{"schemaVersion":"2.9.0"}',
        [`${v2Paths.root}/${safeName}`]: 'same body',
        [`${conflictDir}/weave_一、基础营养学 单选题（1-50题）.md-1778910631636`]: 'same body',
      },
      [conflictDir]
    );
    const service = new DataManagementService(plugin);

    const checkBefore = await service.check('migration_conflict_files');
    expect(checkBefore.count).toBe(3);
    expect(checkBefore.status).not.toBe('ok');

    const result = await service.fix('migration_conflict_files', { allowHighRisk: true });
    const remainingConflicts = [...files.keys()].filter((path) => path.includes('_migration_conflicts/'));
    expect(remainingConflicts).toEqual([]);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(3);
    expect(files.has(`${conflictDir}/weave_schema-version.json-1778889183351`)).toBe(false);
    expect(files.has(`${conflictDir}/weave_schema-version.json-1778910631628`)).toBe(false);
    expect(files.has(`${conflictDir}/weave_一、基础营养学 单选题（1-50题）.md-1778910631636`)).toBe(false);

    const checkAfter = await service.check('migration_conflict_files');
    expect(checkAfter.status).toBe('ok');
    expect(checkAfter.count).toBe(0);
  });

  it('cleans legacy memory JSON residues after verifying all legacy cards are already covered by .wdeck', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, files } = createMemoryPlugin({
      [`${v2Paths.memory.cards}/cards-0.json`]: JSON.stringify({
        cards: [{ uuid: 'card-1', content: 'covered' }],
      }),
      [`${v2Paths.memory.cards}/card-files-index.json`]: JSON.stringify({ files: [] }),
      [`${v2Paths.memory.deckCards}/deck-1.json`]: JSON.stringify({ cardUUIDs: ['card-1'] }),
      [`${v2Paths.memory.root}/deck-files/已迁移_01.wdeck`]: JSON.stringify({
        fileType: 'wdeck',
        logicalDeckId: '已迁移',
        logicalDeckName: '已迁移',
        segmentIndex: 1,
        cards: [{ uuid: 'card-1', content: 'covered' }],
      }),
    });
    const service = new DataManagementService(plugin);

    const result = await service.fix('legacy_memory_files', { allowHighRisk: true });

    expect(result).toEqual({
      type: 'legacy_memory_files',
      success: 3,
      failed: 0,
      errors: [],
    });
    expect(files.has(`${v2Paths.memory.cards}/cards-0.json`)).toBe(false);
    expect(files.has(`${v2Paths.memory.cards}/card-files-index.json`)).toBe(false);
    expect(files.has(`${v2Paths.memory.deckCards}/deck-1.json`)).toBe(false);
    await expect(plugin.app.vault.adapter.exists(v2Paths.memory.cards)).resolves.toBe(false);
    await expect(plugin.app.vault.adapter.exists(v2Paths.memory.deckCards)).resolves.toBe(false);
  });

  it('removes empty invalid .wdeck files during wdeck conflict repair', async () => {
    const v2Paths = getV2Paths('');
    const invalidPath = `${v2Paths.memory.root}/deck-files/坏文件_01.wdeck`;
    const { plugin, files } = createMemoryPlugin({
      [invalidPath]: '',
    });
    let scanCount = 0;
    plugin.wdeckService = {
      repairStructuralConflicts: vi.fn(async () => ({ repaired: 0, errors: [] })),
      getConflictReport: vi.fn(async () => {
        scanCount += 1;
        return scanCount === 1
          ? {
              scannedFiles: 1,
              issues: [
                {
                  type: 'invalid_file',
                  message: `无法解析 .wdeck 文件: ${invalidPath}`,
                  filePaths: [invalidPath],
                },
              ],
            }
          : {
              scannedFiles: 0,
              issues: [],
            };
      }),
    };
    const service = new DataManagementService(plugin);

    const result = await service.fix('wdeck_conflicts');

    expect(result.type).toBe('wdeck_conflicts');
    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(files.has(invalidPath)).toBe(false);
  });

  it('fixes .wdeck uuid_conflict issues by rewriting cards into their canonical formal deck or ungrouped file', async () => {
    const { plugin } = createMemoryPlugin();
    const saveCardsToDeck = vi.fn(async () => []);
    let conflictScan = 0;
    plugin.wdeckService = {
      repairStructuralConflicts: vi.fn(async () => ({ repaired: 0, errors: [] })),
      getConflictReport: vi.fn(async () => {
        conflictScan += 1;
        return conflictScan === 1
          ? {
              scannedFiles: 2,
              issues: [
                {
                  type: 'uuid_conflict',
                  cardUUID: 'card-formal',
                  message: '卡片 UUID card-formal 同时存在于多个 .wdeck 文件中。',
                  filePaths: ['formal.wdeck', '未归组卡片_01.wdeck'],
                },
                {
                  type: 'uuid_conflict',
                  cardUUID: 'card-ungrouped',
                  message: '卡片 UUID card-ungrouped 同时存在于多个 .wdeck 文件中。',
                  filePaths: ['other.wdeck', '未归组卡片_01.wdeck'],
                },
              ],
            }
          : {
              scannedFiles: 2,
              issues: [],
            };
      }),
      saveCardsToDeck,
    };
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-formal',
        content: '---\nwe_decks:\n  - 正式牌组\n---\nA',
      },
      {
        uuid: 'card-ungrouped',
        content: '---\n---\nB',
      },
    ]);
    plugin.dataStorage.getDecks.mockResolvedValue([
      {
        id: 'deck-formal',
        name: '正式牌组',
        purpose: 'memory',
      },
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.fix('wdeck_conflicts');

    expect(result.type).toBe('wdeck_conflicts');
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(saveCardsToDeck).toHaveBeenCalledTimes(2);
    expect(saveCardsToDeck).toHaveBeenCalledWith(
      { id: 'deck-formal', name: '正式牌组' },
      [expect.objectContaining({ uuid: 'card-formal' })]
    );
    expect(saveCardsToDeck).toHaveBeenCalledWith(
      { id: '未归组卡片', name: '未归组卡片' },
      [expect.objectContaining({ uuid: 'card-ungrouped' })]
    );
  });

  it('detects and fixes cards that still belong to multiple formal memory decks', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getDecks.mockResolvedValue([
      { id: 'deck-a', name: '牌组A', purpose: 'memory' },
      { id: 'deck-b', name: '牌组B', purpose: 'memory' },
    ]);
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        deckId: 'deck-b',
        referencedByDecks: ['deck-b', 'deck-a'],
        content: '---\nwe_decks:\n  - 牌组A\n  - 牌组B\n---\n内容',
        created: '2026-04-14T00:00:00.000Z',
        modified: '2026-04-14T00:00:00.000Z',
      },
    ]);
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('memory_single_membership');
    const fixResult = await service.fix('memory_single_membership');

    expect(checkResult).toMatchObject({
      type: 'memory_single_membership',
      status: 'warning',
      count: 1,
      items: ['card-1'],
    });
    expect(fixResult).toEqual({
      type: 'memory_single_membership',
      success: 1,
      failed: 0,
      errors: [],
    });

    const savedCard = plugin.dataStorage.saveCard.mock.calls[0][0];
    const yaml = parseYAMLFromContent(savedCard.content);
    expect(yaml.we_decks).toEqual(['牌组A']);
    expect(savedCard.deckId).toBe('deck-a');
    expect(savedCard.referencedByDecks).toEqual(['deck-b', 'deck-a']);
  });

  it('keeps file-based checks lazy and does not trigger full card/deck reads', async () => {
    const v2Paths = getV2Paths('');
    const { plugin } = createMemoryPlugin({
      [`${v2Paths.memory.cards}/cards-0.json`]: JSON.stringify({ cards: [] }),
    });
    plugin.wdeckService = {
      getConflictReport: vi.fn().mockResolvedValue({ scannedFiles: 0, issues: [] }),
      getCacheStatus: vi.fn().mockResolvedValue({ needsRebuild: false, fileCount: 0, issueCount: 0 }),
    };
    const service = new DataManagementService(plugin);

    await service.check('legacy_memory_files');
    await service.check('wdeck_conflicts');
    await service.check('wdeck_cache');

    expect(plugin.dataStorage.getCards).not.toHaveBeenCalled();
    expect(plugin.dataStorage.getDecks).not.toHaveBeenCalled();
  });

  it('does not include legacy JSON cleanup in the main unified check list once it is demoted to hidden rescue', async () => {
    const { plugin } = createMemoryPlugin();
    const service = new DataManagementService(plugin);
    const checkSpy = vi
      .spyOn(service, 'check')
      .mockImplementation(async (type: any) => ({
        type,
        status: 'ok',
        count: 0,
        items: [],
        message: `${type} ok`,
      }));

    await service.checkAll();

    const checkedTypes = checkSpy.mock.calls.map(([type]) => type);
    expect(checkedTypes).not.toContain('legacy_memory_files');
  });













});
