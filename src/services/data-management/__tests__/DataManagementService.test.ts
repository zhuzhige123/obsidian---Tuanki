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
      fileManager: {
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
    cardFileService: {
      clearCache,
    },
    saveSettings: vi.fn().mockResolvedValue(undefined),
  } as any;

  return {
    plugin,
    files,
    folders,
    clearCache,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DataManagementService', () => {
  it('fixAll only executes the default safe fix set', async () => {
    const { plugin, clearCache } = createMemoryPlugin();
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
    expect(clearCache).toHaveBeenCalledTimes(DEFAULT_BATCH_FIX_TYPES.length);
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
        deleted: ['card-dup'],
        failed: []
      };
    });
    plugin.dataStorage.saveDeck = vi.fn(async () => ({ success: true }));
    plugin.cardFileService.deleteCard = vi.fn(async () => true);

    const service = new DataManagementService(plugin);
    const result = await service.fix('duplicate_cards', { allowHighRisk: true });

    expect(result).toMatchObject({
      type: 'duplicate_cards',
      success: 1,
      failed: 0
    });
    expect(plugin.dataStorage.deleteCards).toHaveBeenCalledWith(['card-dup']);
    expect(plugin.cardFileService.deleteCard).not.toHaveBeenCalled();
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

  it('detects legacy incremental-reading frontmatter residue as a temporary standalone check item', async () => {
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
      'notes/normal.md': [
        '---',
        'title: 正常',
        'tags:',
        '  - keep',
        '---',
        '正常正文'
      ].join('\n')
    });
    const service = new DataManagementService(plugin);

    const result = await service.check('ir_redundant_frontmatter_cleanup');

    expect(result).toMatchObject({
      type: 'ir_redundant_frontmatter_cleanup',
      status: 'warning',
      count: 1,
    });
    expect(result.message).toContain('临时批量处理项');
    expect(result.items[0]).toContain('notes/ir-source.md');
    expect(result.items[0]).toContain('weave-reading-category');
    expect(result.items[0]).toContain('weave-reading-topic-id');
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

  it('removes only targeted incremental-reading legacy frontmatter fields while preserving normal data', async () => {
    const original = [
      '---',
      'title: 测试',
      'tags:',
      '  - keep',
      'weave-reading-id: reading-1',
      'weave-reading-category: later',
      'weave-reading-priority: 50',
      'weave-reading-topic-id: deck-1',
      'weave-reading-ir-deck-id: legacy-deck-1',
      'custom_field: keep-me',
      '---',
      '正文第一行',
      '',
      '正文第二行'
    ].join('\n');
    const { plugin, files } = createMemoryPlugin({
      'notes/ir-source.md': original
    });
    const service = new DataManagementService(plugin);

    const result = await service.fix('ir_redundant_frontmatter_cleanup', { allowHighRisk: true });

    expect(result).toEqual({
      type: 'ir_redundant_frontmatter_cleanup',
      success: 1,
      failed: 0,
      errors: [],
    });

    const updated = files.get('notes/ir-source.md') || '';
    const yaml = parseYAMLFromContent(updated);
    expect(yaml.title).toBe('测试');
    expect(yaml.tags).toEqual(['keep']);
    expect(yaml['weave-reading-id']).toBe('reading-1');
    expect(yaml['custom_field']).toBe('keep-me');
    expect(yaml['weave-reading-category']).toBeUndefined();
    expect(yaml['weave-reading-priority']).toBeUndefined();
    expect(yaml['weave-reading-topic-id']).toBeUndefined();
    expect(yaml['weave-reading-ir-deck-id']).toBeUndefined();
    expect(extractBodyContent(updated)).toBe('正文第一行\n\n正文第二行');
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
    const fallbackSaveCardsBatch = vi.fn().mockResolvedValue(true);
    const markFullRebuildRequired = vi.fn().mockResolvedValue(undefined);
    plugin.dataStorage.saveCardsBatch = saveCardsBatch;
    plugin.cardFileService.saveCardsBatch = fallbackSaveCardsBatch;
    plugin.deckMembershipIndexService = { markFullRebuildRequired };

    const service = new DataManagementService(plugin);

    const result = await (service as any).importMigrationConflicts(v2Paths);

    expect(result.importedCards).toBe(1);
    expect(result.importedDecks).toBe(1);
    expect(saveCardsBatch).toHaveBeenCalledTimes(1);
    expect(fallbackSaveCardsBatch).not.toHaveBeenCalled();
    expect(markFullRebuildRequired).toHaveBeenCalledTimes(1);
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

  it('detects cards that still use legacy epub source link formats', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        content: '[[Books/demo.epub#weave-cfi=readium%3Aabc&chapter=3&text=Hello%20world|Old]]',
      },
      {
        uuid: 'card-2',
        content: '[[Books/demo.epub#weave-cfi=readium:xyz|demo]]',
      },
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.check('epub_source_link_migration');

    expect(result).toMatchObject({
      type: 'epub_source_link_migration',
      status: 'warning',
      count: 1,
      items: ['card-1'],
    });
  });

  it('migrates legacy epub source links to the new cfi-only format', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        content:
          '鍓嶆枃 [[Books/demo.epub#weave-cfi=readium%3Aabc&chapter=3&text=Hello%20world|Old]] 鍚庢枃',
      },
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.fix('epub_source_link_migration');

    expect(result).toEqual({
      type: 'epub_source_link_migration',
      success: 1,
      failed: 0,
      errors: [],
    });
    expect(plugin.dataStorage.saveCard).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'card-1',
        content: expect.stringContaining('[[Books/demo.epub#weave-cfi=readium:abc|demo]]'),
        modified: expect.any(String),
      })
    );
  });

	it('detects and backfills missing sourceId in markdown epub links', async () => {
		const { plugin, files } = createMemoryPlugin({
			'Books/demo.epub': 'fake epub binary',
			'notes/epub-link.md': '前文 [[Books/demo.epub#weave-cfi=readium:abc|demo]] 后文',
		});
		const service = new DataManagementService(plugin);

		const checkResult = await service.check('epub_markdown_source_id_backfill');
		expect(checkResult).toMatchObject({
			type: 'epub_markdown_source_id_backfill',
			status: 'warning',
			count: 1,
			items: ['notes/epub-link.md'],
		});

		const fixResult = await service.fix('epub_markdown_source_id_backfill', { allowHighRisk: true });
		expect(fixResult).toMatchObject({
			type: 'epub_markdown_source_id_backfill',
			success: 1,
			failed: 0,
		});

		expect(files.get('notes/epub-link.md')).toContain('&sid=');

		const recheckResult = await service.check('epub_markdown_source_id_backfill');
		expect(recheckResult).toMatchObject({
			type: 'epub_markdown_source_id_backfill',
			status: 'ok',
			count: 0,
		});
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
          wdeck: {
            runtimeDeckId: 'wdeck:deck-1',
          },
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
    expect(plugin.cardFileService).toBeUndefined();
  });

  it('removes empty invalid .wdeck files during wdeck conflict repair', async () => {
    const v2Paths = getV2Paths('');
    const invalidPath = `${v2Paths.memory.root}/deck-files/坏文件_01.wdeck`;
    const { plugin, files } = createMemoryPlugin({
      [invalidPath]: '',
    });
    let scanCount = 0;
    plugin.wdeckService = {
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

  it('detects and executes IR point storage migration through data management', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, files } = createMemoryPlugin({
      [v2Paths.ir.legacyTopics]: JSON.stringify({
        topics: {
          'topic-1': { name: 'Topic One' },
        },
      }),
      [v2Paths.ir.pdfBookmarkTasks]: JSON.stringify({
        version: 1,
        tasks: {
          'pdfbm-1': {
            id: 'pdfbm-1',
            topicId: 'topic-1',
            pdfPath: 'Docs/Test.pdf',
            title: 'Selection 1',
            link: 'obsidian://pdf',
            status: 'new',
          },
        },
      }),
    });
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('ir_point_storage_migration');
    const fixResult = await service.fix('ir_point_storage_migration', { allowHighRisk: true });
    const recheckResult = await service.check('ir_point_storage_migration');

    expect(checkResult).toMatchObject({
      type: 'ir_point_storage_migration',
      status: 'warning',
      count: 1,
    });
    expect(fixResult.type).toBe('ir_point_storage_migration');
    expect(fixResult.failed).toBe(0);
    expect(fixResult.success).toBeGreaterThan(0);
    expect(files.has(`${v2Paths.ir.root}/points/Topic One.irdeck`)).toBe(true);
    expect(recheckResult).toMatchObject({
      type: 'ir_point_storage_migration',
      status: 'ok',
      count: 0,
    });
  });

  it('keeps warning about residual legacy chunks and sources files after data has been migrated', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, files } = createMemoryPlugin({
      [v2Paths.ir.legacyTopics]: JSON.stringify({
        topics: {
          'topic-1': { name: 'Topic One' },
        },
      }),
      [v2Paths.ir.sources]: JSON.stringify({
        version: '1.0.0',
        sources: {
          'source-1': {
            sourceId: 'source-1',
            originalPath: 'Docs/Source.md',
            rawFilePath: 'Docs/Source.md',
            indexFilePath: 'Docs/Source.index.md',
            chunkIds: ['chunk-1'],
            title: 'Source 1',
            tagGroup: 'default',
            createdAt: 1,
            updatedAt: 1,
          },
        },
      }),
      [v2Paths.ir.chunks]: JSON.stringify({
        version: '1.0.0',
        chunks: {
          'chunk-1': {
            chunkId: 'chunk-1',
            sourceId: 'source-1',
            filePath: 'Docs/Chunk-1.md',
            topicIds: ['topic-1'],
            deckIds: ['topic-1'],
            priorityUi: 5,
            priorityEff: 5,
            intervalDays: 1,
            nextRepDate: 1,
            scheduleStatus: 'queued',
            stats: {
              impressions: 0,
              totalReadingTimeSec: 0,
              effectiveReadingTimeSec: 0,
              extracts: 0,
              cardsCreated: 0,
              notesWritten: 0,
              lastInteraction: 0,
              lastShownAt: 0,
            },
            meta: {},
            createdAt: 1,
            updatedAt: 1,
          },
        },
      }),
    });
    const service = new DataManagementService(plugin);

    await service.fix('ir_point_storage_migration', { allowHighRisk: true });
    files.set(
      v2Paths.ir.sources,
      JSON.stringify({
        version: '1.0.0',
        sources: {
          'source-1': {
            sourceId: 'source-1',
            originalPath: 'Docs/Source.md',
            rawFilePath: 'Docs/Source.md',
            indexFilePath: 'Docs/Source.index.md',
            chunkIds: ['chunk-1'],
            title: 'Source 1',
            tagGroup: 'default',
            createdAt: 1,
            updatedAt: 1,
          },
        },
      })
    );
    files.set(
      v2Paths.ir.chunks,
      JSON.stringify({
        version: '1.0.0',
        chunks: {
          'chunk-1': {
            chunkId: 'chunk-1',
            sourceId: 'source-1',
            filePath: 'Docs/Chunk-1.md',
            topicIds: ['topic-1'],
            deckIds: ['topic-1'],
            priorityUi: 5,
            priorityEff: 5,
            intervalDays: 1,
            nextRepDate: 1,
            scheduleStatus: 'queued',
            stats: {
              impressions: 0,
              totalReadingTimeSec: 0,
              effectiveReadingTimeSec: 0,
              extracts: 0,
              cardsCreated: 0,
              notesWritten: 0,
              lastInteraction: 0,
              lastShownAt: 0,
            },
            meta: {},
            createdAt: 1,
            updatedAt: 1,
          },
        },
      })
    );

    const recheckResult = await service.check('ir_point_storage_migration');

    expect(recheckResult).toMatchObject({
      type: 'ir_point_storage_migration',
      status: 'warning',
      count: 2,
    });
    expect(recheckResult.items).toContain(
      '旧 chunks/sources 文件 2 个已退出真源但仍残留在同步目录'
    );
  });

  it('detects and removes deleted legacy IR markdown residue through point storage migration', async () => {
    const v2Paths = getV2Paths('');
    const deletedMarkdownPath = `${v2Paths.root}/incremental-reading/IR/legacy/01_deleted.md`;
    const { plugin, files } = createMemoryPlugin({
      [deletedMarkdownPath]: `---
tags:
  - we_已删除
---
# legacy deleted markdown`,
    });
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('ir_point_storage_migration');
    const fixResult = await service.fix('ir_point_storage_migration', { allowHighRisk: true });
    const recheckResult = await service.check('ir_point_storage_migration');

    expect(checkResult).toMatchObject({
      type: 'ir_point_storage_migration',
      status: 'warning',
      count: 1,
    });
    expect(checkResult.items).toContain('旧 IR 已标记删除的 Markdown 残留 1 个可安全清理');
    expect(checkResult.items).toContain(deletedMarkdownPath);
    expect(fixResult.type).toBe('ir_point_storage_migration');
    expect(fixResult.failed).toBe(0);
    expect(fixResult.success).toBeGreaterThan(0);
    expect(files.has(deletedMarkdownPath)).toBe(false);
    expect(recheckResult).toMatchObject({
      type: 'ir_point_storage_migration',
      status: 'ok',
      count: 0,
    });
  });

  it('blocks legacy IR readable markdown migration when Obsidian default new note folder still points into the legacy IR root', async () => {
    const v2Paths = getV2Paths('');
    const legacyReadablePath = `${v2Paths.root}/incremental-reading/IR/legacy/article.md`;
    const { plugin } = createMemoryPlugin({
      [legacyReadablePath]: '# legacy article',
    });
    plugin.app.vault.getConfig = vi.fn((key: string) => {
      if (key === 'newFileLocation') return 'folder';
      if (key === 'newFileFolderPath') {
        return `${v2Paths.root}/incremental-reading/IR/migrated`;
      }
      return undefined;
    });
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('ir_legacy_readable_markdown_migration');
    const fixResult = await service.fix('ir_legacy_readable_markdown_migration', {
      allowHighRisk: true,
    });

    expect(checkResult).toMatchObject({
      type: 'ir_legacy_readable_markdown_migration',
      status: 'error',
      count: 1,
    });
    expect(checkResult.message).toContain('当前 Obsidian 默认新建笔记位置仍指向旧 IR 目录');
    expect(fixResult.failed).toBe(1);
    expect(fixResult.errors[0]?.error).toContain('当前 Obsidian 默认新建笔记位置仍指向旧 IR 目录');
  });

  it('migrates legacy IR readable markdown to the current Obsidian default note folder and rewrites stored references', async () => {
    const v2Paths = getV2Paths('');
    const pluginPaths = getPluginPaths({ vault: { configDir: '.obsidian' } } as any);
    const legacyReadablePath = `${v2Paths.root}/incremental-reading/IR/legacy/topic/article.md`;
    const legacySystemPath = `${v2Paths.root}/incremental-reading/IR/raw/system.md`;
    const pointRelativePath = 'points/topic-1.irdeck';
    const pointAbsolutePath = `${v2Paths.ir.root}/${pointRelativePath}`;
    const targetReadablePath = 'Inbox/Readable/legacy/topic/article.md';
    const { plugin, files } = createMemoryPlugin({
      [legacyReadablePath]: '# legacy article\n\nbody',
      [legacySystemPath]: '# legacy system file',
      [v2Paths.ir.pointFilesIndex]: JSON.stringify({
        files: [{ file: pointRelativePath }],
      }),
      [pointAbsolutePath]: JSON.stringify({
        id: 'topic-1',
        storagePath: legacyReadablePath,
        sourcePath: legacyReadablePath,
      }),
      [pluginPaths.state.incrementalReading.readingMaterialsRuntime]: JSON.stringify({
        materials: [{ id: 'mat-1', storagePath: legacyReadablePath }],
      }),
    });
    plugin.app.vault.getConfig = vi.fn((key: string) => {
      if (key === 'newFileLocation') return 'folder';
      if (key === 'newFileFolderPath') return 'Inbox/Readable';
      return undefined;
    });
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('ir_legacy_readable_markdown_migration');
    const fixResult = await service.fix('ir_legacy_readable_markdown_migration', {
      allowHighRisk: true,
    });
    const recheckResult = await service.check('ir_legacy_readable_markdown_migration');

    expect(checkResult).toMatchObject({
      type: 'ir_legacy_readable_markdown_migration',
      status: 'warning',
      count: 1,
    });
    expect(checkResult.items).toContain(`迁移目标: Inbox/Readable`);
    expect(checkResult.items).toContain(legacyReadablePath);
    expect(fixResult.failed).toBe(0);
    expect(fixResult.success).toBeGreaterThan(0);
    expect(files.has(targetReadablePath)).toBe(true);
    expect(files.has(legacyReadablePath)).toBe(false);
    expect(files.has(legacySystemPath)).toBe(true);
    expect(JSON.parse(files.get(pointAbsolutePath)!)).toMatchObject({
      storagePath: targetReadablePath,
      sourcePath: targetReadablePath,
    });
    expect(
      JSON.parse(files.get(pluginPaths.state.incrementalReading.readingMaterialsRuntime)!)
    ).toMatchObject({
      materials: [{ id: 'mat-1', storagePath: targetReadablePath }],
    });
    expect(recheckResult).toMatchObject({
      type: 'ir_legacy_readable_markdown_migration',
      status: 'ok',
      count: 0,
    });
  });

  it('detects and consolidates legacy epub local data through data management', async () => {
    const v2Paths = getV2Paths('');
    const pluginPaths = getPluginPaths({ vault: { configDir: '.obsidian' } } as any);
    const { plugin, files } = createMemoryPlugin({
      [`${v2Paths.ir.epub}/books.json`]: JSON.stringify({
        'book-1': {
          id: 'book-1',
          filePath: 'Books/demo.epub',
          metadata: {
            title: 'Demo',
            author: 'Author',
            chapterCount: 3,
          },
          currentPosition: { chapterIndex: 0, cfi: '/6/2', percent: 10 },
          readingStats: {
            totalReadTime: 0,
            lastReadTime: 100,
            createdTime: 50,
          },
        },
      }),
      [`${v2Paths.ir.epub}/book-1/state.json`]: JSON.stringify({
        currentPosition: { chapterIndex: 1, cfi: '/6/6', percent: 42 },
      }),
      [`${v2Paths.ir.epub}/reader-settings.desktop.json`]: JSON.stringify({
        lineHeight: 1.8,
        widthMode: 'standard',
        layoutMode: 'paginated',
        flowMode: 'paginated',
        showScrolledSideNav: true,
      }),
      [`${v2Paths.ir.epub}/book-1/highlights.json`]: JSON.stringify([
        {
          id: 'legacy-highlight',
          text: 'legacy highlight',
          color: 'yellow',
          chapterIndex: 1,
          cfiRange: 'epubcfi(/6/6!/4/2/2)',
          createdTime: 1,
        },
      ]),
      [`${v2Paths.ir.epub}/book-1/notes.json`]: JSON.stringify([
        {
          id: 'legacy-note',
          content: 'legacy note',
          quotedText: 'legacy quote',
          chapterIndex: 1,
          cfi: 'epubcfi(/6/6!/4/2/2)',
          createdTime: 1,
          modifiedTime: 1,
        },
      ]),
      [`${v2Paths.ir.root}/sync-state.json`]: JSON.stringify({
        version: '3.0.0',
        files: {
          'notes/demo.md': {
            filePath: 'notes/demo.md',
            mtime: 1,
            size: 2,
            uuidListHash: 'abc',
            lastSynced: '2026-04-17T00:00:00.000Z',
          },
        },
      }),
      [v2Paths.ir.documentGroupMap]: JSON.stringify({
        version: '3.0.0',
        map: {
          'notes/demo.md': {
            filePath: 'notes/demo.md',
            groupId: 'default',
            tagsSnapshot: ['demo'],
            updatedAt: '2026-04-17T00:00:00.000Z',
          },
        },
      }),
      [`${v2Paths.ir.root}/monitoring.json`]: JSON.stringify({
        version: '3.0.0',
        dailyStats: [{ date: '2026-04-16', dueCount: 2 }],
        priorityChanges: [],
        groupParamChanges: [],
        decisionEvents: [],
        decisionOutcomes: [],
        lastUpdated: '2026-04-16T09:00:00.000Z',
      }),
      [v2Paths.ir.history]: JSON.stringify({
        version: '4.0',
        sessions: [
          {
            id: 'legacy-history-1',
            blockId: 'chunk-1',
            deckId: 'topic-1',
            topicId: 'topic-1',
            startTime: '2026-04-16T08:00:00.000Z',
            endTime: '2026-04-16T08:05:00.000Z',
            duration: 300,
            action: 'completed',
            rating: 3,
          },
        ],
      }),
      [v2Paths.ir.studySessions]: JSON.stringify({
        version: '1.0',
        sessions: [
          {
            id: 'legacy-study-1',
            deckId: 'topic-1',
            topicId: 'topic-1',
            deckName: 'Topic One',
            topicName: 'Topic One',
            startTime: '2026-04-16T08:00:00.000Z',
            endTime: '2026-04-16T08:20:00.000Z',
            autoRecordedDuration: 1200,
            confirmedDuration: 1200,
            blocksCompleted: 2,
            cardsCreated: 1,
          },
        ],
      }),
      [v2Paths.ir.calendarProgress]: JSON.stringify({
        version: '4.0',
        byDate: {
          '2026-04-16': ['chunk-1'],
        },
      }),
    });
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('ir_local_state_relocation');
    const fixResult = await service.fix('ir_local_state_relocation');
    const recheckResult = await service.check('ir_local_state_relocation');

    expect(checkResult).toMatchObject({
      type: 'ir_local_state_relocation',
      status: 'warning',
      count: 11,
    });
    expect(fixResult).toMatchObject({
      type: 'ir_local_state_relocation',
      failed: 0,
      success: 20,
    });
    expect(files.has(pluginPaths.state.incrementalReading.epubReaderData)).toBe(true);
    expect(files.has(pluginPaths.cache.incrementalReading.syncState)).toBe(true);
    expect(files.has(pluginPaths.cache.incrementalReading.documentGroupMap)).toBe(true);
    expect(files.has(pluginPaths.state.incrementalReading.monitoring)).toBe(true);
    expect(files.has(pluginPaths.state.incrementalReading.history)).toBe(true);
    expect(files.has(pluginPaths.state.incrementalReading.studySessions)).toBe(true);
    expect(files.has(pluginPaths.state.incrementalReading.calendarProgress)).toBe(true);
    expect(
      JSON.parse(files.get(pluginPaths.state.incrementalReading.epubReaderData) || '{}')
    ).toMatchObject({
      books: {
        'book-1': {
          descriptor: {
            id: 'book-1',
            filePath: 'Books/demo.epub',
            metadata: {
              title: 'Demo',
              author: 'Author',
            },
          },
          state: {
            currentPosition: { chapterIndex: 1, cfi: '/6/6', percent: 42 },
          },
        },
      },
      readerSettings: {
        desktop: {
          lineHeight: 1.8,
        },
      },
    });
    expect(JSON.parse(files.get(pluginPaths.cache.incrementalReading.syncState) || '{}')).toMatchObject({
      files: {
        'notes/demo.md': expect.objectContaining({
          filePath: 'notes/demo.md',
          uuidListHash: 'abc',
        }),
      },
    });
    expect(
      JSON.parse(files.get(pluginPaths.cache.incrementalReading.documentGroupMap) || '{}')
    ).toMatchObject({
      map: {
        'notes/demo.md': expect.objectContaining({
          groupId: 'default',
        }),
      },
    });
    expect(JSON.parse(files.get(pluginPaths.state.incrementalReading.monitoring) || '{}')).toMatchObject({
      dailyStats: [expect.objectContaining({ date: '2026-04-16', dueCount: 2 })],
    });
    expect(JSON.parse(files.get(pluginPaths.state.incrementalReading.history) || '{}')).toMatchObject({
      sessions: [expect.objectContaining({ id: 'legacy-history-1' })],
    });
    expect(
      JSON.parse(files.get(pluginPaths.state.incrementalReading.studySessions) || '{}')
    ).toMatchObject({
      sessions: [expect.objectContaining({ id: 'legacy-study-1' })],
    });
    expect(
      JSON.parse(files.get(pluginPaths.state.incrementalReading.calendarProgress) || '{}')
    ).toMatchObject({
      byDate: {
        '2026-04-16': ['chunk-1'],
      },
    });
    expect(files.has(`${v2Paths.ir.epub}/books.json`)).toBe(false);
    expect(files.has(`${v2Paths.ir.epub}/book-1/state.json`)).toBe(false);
    expect(files.has(`${v2Paths.ir.epub}/reader-settings.desktop.json`)).toBe(false);
    expect(files.has(`${v2Paths.ir.epub}/book-1/highlights.json`)).toBe(false);
    expect(files.has(`${v2Paths.ir.epub}/book-1/notes.json`)).toBe(false);
    expect(files.has(`${v2Paths.ir.root}/sync-state.json`)).toBe(false);
    expect(files.has(v2Paths.ir.documentGroupMap)).toBe(false);
    expect(files.has(`${v2Paths.ir.root}/monitoring.json`)).toBe(false);
    expect(files.has(v2Paths.ir.history)).toBe(false);
    expect(files.has(v2Paths.ir.studySessions)).toBe(false);
    expect(files.has(v2Paths.ir.calendarProgress)).toBe(false);
    expect(recheckResult).toMatchObject({
      type: 'ir_local_state_relocation',
      status: 'ok',
      count: 0,
    });
  });

  it('fully migrates IR data through data management without keeping legacy bookmark files', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, files } = createMemoryPlugin({
      [v2Paths.ir.legacyTopics]: JSON.stringify({
        topics: {
          'topic-1': { name: 'Topic One' },
        },
      }),
      [v2Paths.ir.pdfBookmarkTasks]: JSON.stringify({
        version: 1,
        tasks: {
          'pdfbm-1': {
            id: 'pdfbm-1',
            topicId: 'topic-1',
            pdfPath: 'Docs/Test.pdf',
            title: 'Selection 1',
            link: 'obsidian://pdf',
            status: 'new',
          },
        },
      }),
      [v2Paths.ir.sources]: JSON.stringify({
        version: '1.0.0',
        sources: {
          'source-1': {
            sourceId: 'source-1',
            originalPath: 'Docs/Source.md',
            rawFilePath: 'Docs/Source.md',
            indexFilePath: 'Docs/Source.index.md',
            chunkIds: ['chunk-1'],
            title: 'Source 1',
            tagGroup: 'default',
            createdAt: 1,
            updatedAt: 1,
          },
        },
      }),
      [v2Paths.ir.chunks]: JSON.stringify({
        version: '1.0.0',
        chunks: {
          'chunk-1': {
            chunkId: 'chunk-1',
            sourceId: 'source-1',
            filePath: 'Docs/Chunk-1.md',
            topicIds: ['topic-1'],
            deckIds: ['topic-1'],
            priorityUi: 5,
            priorityEff: 5,
            intervalDays: 1,
            nextRepDate: 1,
            scheduleStatus: 'queued',
            stats: {
              impressions: 0,
              totalReadingTimeSec: 0,
              effectiveReadingTimeSec: 0,
              extracts: 0,
              cardsCreated: 0,
              notesWritten: 0,
              lastInteraction: 0,
              lastShownAt: 0,
            },
            meta: {},
            createdAt: 1,
            updatedAt: 1,
          },
        },
      }),
    });
    const service = new DataManagementService(plugin);

    const migrationResult = await service.fix('ir_point_storage_migration', { allowHighRisk: true });
    expect(migrationResult).toMatchObject({
      type: 'ir_point_storage_migration',
      failed: 0,
    });
    expect(files.has(v2Paths.ir.pdfBookmarkTasks)).toBe(false);
    expect(files.has(v2Paths.ir.chunks)).toBe(false);
    expect(files.has(v2Paths.ir.sources)).toBe(false);

    const cleanupResult = await service.check('ir_legacy_bookmark_cleanup');
    expect(cleanupResult).toMatchObject({
      type: 'ir_legacy_bookmark_cleanup',
      status: 'ok',
      count: 0,
    });
  });

  it('cleans duplicate IR materials and removes legacy materials.json through material consistency fix', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, files, folders } = createMemoryPlugin(
      {
        [v2Paths.ir.pointFilesIndex]: JSON.stringify({
          schemaVersion: 1,
          updatedAt: '2026-04-16T10:00:00.000Z',
          files: [
            {
              topicId: 'topic-1',
              topicName: 'Topic One',
              file: 'points/Topic One.irdeck',
              pointCount: 1,
              updatedAt: '2026-04-16T10:00:00.000Z',
            },
          ],
        }),
        [`${v2Paths.ir.root}/points/Topic One.irdeck`]: JSON.stringify({
          schemaVersion: 1,
          topicId: 'topic-1',
          topicName: 'Topic One',
          updatedAt: '2026-04-16T10:00:00.000Z',
          points: [{ id: 'point-1', materialId: 'src-active' }],
        }),
        [v2Paths.ir.materialsIndex]: JSON.stringify({
          schemaVersion: 1,
          updatedAt: '2026-04-16T10:00:00.000Z',
          materials: [
            {
              id: 'src-active',
              type: 'file',
              file: 'materials/src-active.material.json',
              status: 'active',
            },
            {
              id: 'tk-ir-legacy',
              type: 'file',
              file: 'materials/tk-ir-legacy.material.json',
              status: 'active',
            },
          ],
        }),
        [`${v2Paths.ir.root}/materials/src-active.material.json`]: JSON.stringify({
          schemaVersion: 1,
          id: 'src-active',
          createdAt: '2026-04-16T10:00:00.000Z',
          updatedAt: '2026-04-16T10:00:00.000Z',
          source: { type: 'file', path: 'Docs/Source.md' },
          bibliography: { title: 'Source' },
          contentStorage: { mode: 'external-source', ownedByPlugin: false },
          defaultParameterContext: {
            materialClass: 'reference-note',
            scheduleProfileRef: 'profile-reference-note',
            classificationSource: 'inherited-from-material',
            isOverride: false,
          },
          metadata: { status: 'active' },
        }),
        [`${v2Paths.ir.root}/materials/tk-ir-legacy.material.json`]: JSON.stringify({
          schemaVersion: 1,
          id: 'tk-ir-legacy',
          createdAt: '2026-04-16T10:00:00.000Z',
          updatedAt: '2026-04-16T10:00:00.000Z',
          source: { type: 'file', path: 'Docs/Source.md' },
          bibliography: { title: 'Source' },
          contentStorage: { mode: 'external-source', ownedByPlugin: false },
          defaultParameterContext: {
            materialClass: 'reference-note',
            scheduleProfileRef: 'profile-reference-note',
            classificationSource: 'inherited-from-material',
            isOverride: false,
          },
          metadata: { status: 'active' },
        }),
        [v2Paths.ir.materials.index]: JSON.stringify({
          version: '1.0.0',
          lastUpdated: '2026-04-16T10:00:00.000Z',
          materials: {
            'tk-ir-legacy': {
              uuid: 'tk-ir-legacy',
              title: 'Source',
              filePath: 'Docs/Source.md',
            },
          },
        }),
        'Docs/Source.md': '# Source',
      },
      [v2Paths.ir.materials.sessions]
    );
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('ir_material_consistency');
    const fixResult = await service.fix('ir_material_consistency', { allowHighRisk: true });
    const recheckResult = await service.check('ir_material_consistency');

    expect(checkResult).toMatchObject({
      type: 'ir_material_consistency',
      status: 'warning',
    });
    expect(fixResult).toMatchObject({
      type: 'ir_material_consistency',
      failed: 0,
    });
    expect(fixResult.success).toBeGreaterThan(0);
    expect(files.has(`${v2Paths.ir.root}/materials/tk-ir-legacy.material.json`)).toBe(false);
    expect(files.has(v2Paths.ir.materialsIndex)).toBe(false);
    expect(files.has(v2Paths.ir.materials.index)).toBe(false);
    expect(folders.has(v2Paths.ir.materials.sessions)).toBe(false);
    expect(recheckResult).toMatchObject({
      type: 'ir_material_consistency',
      status: 'ok',
      count: 0,
    });
  });

  it('checks and fixes orphaned legacy block points after blocks.json has already been removed', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, files } = createMemoryPlugin({
      [v2Paths.ir.legacyTopics]: JSON.stringify({
        topics: {
          'topic-1': {
            name: 'Topic One',
            blockIds: ['legacy-block-1'],
            sourceFiles: ['Docs/Missing.md'],
          },
        },
      }),
      [v2Paths.ir.pointFilesIndex]: JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-04-17T00:00:00.000Z',
        files: [
          {
            topicId: 'topic-1',
            topicName: 'Topic One',
            file: 'points/Topic One.irdeck',
            pointCount: 1,
            updatedAt: '2026-04-17T00:00:00.000Z',
          },
        ],
      }),
      [`${v2Paths.ir.root}/points/Topic One.irdeck`]: JSON.stringify({
        schemaVersion: 1,
        topicId: 'topic-1',
        topicName: 'Topic One',
        updatedAt: '2026-04-17T00:00:00.000Z',
        points: [
          {
            id: 'legacy-block-1',
            pointType: 'legacy-block-entry',
            materialId: 'legacy-src-1',
            source: {
              id: 'legacy-src-1',
              type: 'markdown',
              path: 'Docs/Missing.md',
              title: 'Legacy Source',
            },
            timestamps: {
              createdAt: '2026-04-16T10:00:00.000Z',
              updatedAt: '2026-04-16T11:00:00.000Z',
            },
            trace: {
              locatorType: 'markdown-block',
              locator: {
                sourcePath: 'Docs/Missing.md',
                headingPath: ['第一章', '第一节'],
                headingText: '第一节',
                startLine: 12,
                endLine: 18,
                headingLevel: 2,
              },
              traceState: 'broken',
              traceConfidence: 0.4,
              fallbackLocators: [],
            },
            parameterContext: {
              materialClass: 'reference-note',
              scheduleProfileRef: 'profile-reference-note',
              classificationSource: 'point',
              isOverride: false,
            },
            schedule: {
              status: 'active',
              dueAt: '2026-04-17T00:00:00.000Z',
              intervalDays: 3,
            },
            relations: {
              topicIds: ['topic-1'],
              linkedNotePaths: [],
              derivedCardIds: ['card-1'],
              blockIds: [],
            },
            userData: {
              title: '第一节',
              tags: ['focus'],
              starred: true,
            },
            stats: {
              reviewCount: 2,
              totalReadingTimeMs: 90000,
            },
            audit: {
              createdAt: '2026-04-16T10:00:00.000Z',
              updatedAt: '2026-04-16T11:00:00.000Z',
              origin: {
                type: 'legacy-block',
                id: 'legacy-block-1',
              },
            },
            metadata: {
              sourcePath: 'Docs/Missing.md',
              headingPath: ['第一章', '第一节'],
              headingText: '第一节',
              startLine: 12,
              endLine: 18,
              headingLevel: 2,
            },
          },
        ],
      }),
    });
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('ir_material_consistency');
    const fixResult = await service.fix('ir_material_consistency', { allowHighRisk: true });
    const recheckResult = await service.check('ir_material_consistency');

    expect(checkResult).toMatchObject({
      type: 'ir_material_consistency',
      status: 'warning',
    });
    expect(checkResult.items).toContain('孤立内容块: 1 个');
    expect(fixResult).toMatchObject({
      type: 'ir_material_consistency',
      failed: 0,
    });

    const pointFile = JSON.parse(files.get(`${v2Paths.ir.root}/points/Topic One.irdeck`) || '{}');
    expect(pointFile.points).toEqual([]);

    expect(files.has(v2Paths.ir.legacyTopics)).toBe(false);
    expect(recheckResult).toMatchObject({
      type: 'ir_material_consistency',
      status: 'ok',
      count: 0,
    });
  });

  it('prunes empty incremental-reading folders after migration without removing non-empty book folders', async () => {
    const v2Paths = getV2Paths('');
    const emptyBookDir = `${v2Paths.ir.epub}/epub-empty`;
    const keepBookDir = `${v2Paths.ir.epub}/epub-keep`;
    const { plugin, folders, files } = createMemoryPlugin(
      {
        [v2Paths.ir.legacyTopics]: JSON.stringify({
          topics: {
            'topic-1': { name: 'Topic One' },
          },
        }),
        [v2Paths.ir.pdfBookmarkTasks]: JSON.stringify({
          version: 1,
          tasks: {
            'pdfbm-1': {
              id: 'pdfbm-1',
              topicId: 'topic-1',
              pdfPath: 'Docs/Test.pdf',
              title: 'Selection 1',
              link: 'obsidian://pdf',
              status: 'new',
            },
          },
        }),
        [`${keepBookDir}/bookmarks.json`]: JSON.stringify([]),
      },
      [emptyBookDir, keepBookDir]
    );
    const service = new DataManagementService(plugin);

    const migrationResult = await service.fix('ir_point_storage_migration', { allowHighRisk: true });

    expect(migrationResult).toMatchObject({
      type: 'ir_point_storage_migration',
      failed: 0,
    });
    expect(folders.has(emptyBookDir)).toBe(false);
    expect(folders.has(keepBookDir)).toBe(true);
    expect(files.has(`${keepBookDir}/bookmarks.json`)).toBe(true);
  });

  it('removes the empty legacy IR root after deleted markdown residue is cleaned', async () => {
    const v2Paths = getV2Paths('');
    const legacyIrRoot = resolveIRImportFolder();
    const legacyIrFile = `${legacyIrRoot}/Old Topic/01_Old Topic.md`;
    const { plugin, files, folders } = createMemoryPlugin(
      {
        [legacyIrFile]: [
          '---',
          'tags:',
          '  - we_已删除',
          '---',
          '',
          'legacy deleted topic',
        ].join('\n'),
      },
      [`${legacyIrRoot}/Old Topic`]
    );
    const service = new DataManagementService(plugin);

    const migrationResult = await service.fix('ir_point_storage_migration', { allowHighRisk: true });

    expect(migrationResult).toMatchObject({
      type: 'ir_point_storage_migration',
      failed: 0,
    });
    expect(files.has(legacyIrFile)).toBe(false);
    expect(folders.has(`${legacyIrRoot}/Old Topic`)).toBe(false);
    expect(folders.has(legacyIrRoot)).toBe(false);
    expect(folders.has(v2Paths.ir.root)).toBe(true);
  });

  it('can still clean legacy bookmark files when points have already been migrated', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, files } = createMemoryPlugin({
      [v2Paths.ir.pdfBookmarkTasks]: JSON.stringify({
        version: 1,
        tasks: {
          'pdfbm-1': {
            id: 'pdfbm-1',
            topicId: 'topic-1',
            pdfPath: 'Docs/Test.pdf',
            title: 'Selection 1',
            link: 'obsidian://pdf',
            status: 'new',
          },
        },
      }),
      [v2Paths.ir.pointFilesIndex]: JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-04-17T00:00:00.000Z',
        files: [
          {
            topicId: 'topic-1',
            topicName: 'Topic One',
            file: 'points/Topic One.irdeck',
            pointCount: 1,
            updatedAt: '2026-04-17T00:00:00.000Z',
          },
        ],
      }),
      [`${v2Paths.ir.root}/points/Topic One.irdeck`]: JSON.stringify({
        schemaVersion: 1,
        topicId: 'topic-1',
        topicName: 'Topic One',
        updatedAt: '2026-04-17T00:00:00.000Z',
        points: [{ id: 'pdfbm-1' }],
      }),
    });
    const service = new DataManagementService(plugin);

    const warningResult = await service.check('ir_legacy_bookmark_cleanup');
    expect(warningResult).toMatchObject({
      type: 'ir_legacy_bookmark_cleanup',
      status: 'warning',
      count: 1,
    });

    const fixResult = await service.fix('ir_legacy_bookmark_cleanup', { allowHighRisk: true });
    expect(fixResult).toMatchObject({
      type: 'ir_legacy_bookmark_cleanup',
      success: 1,
      failed: 0,
    });
    expect(files.has(v2Paths.ir.pdfBookmarkTasks)).toBe(false);
  });

  it('migrates legacy registry and tag-group files into .irdeck then removes the deprecated files', async () => {
    const v2Paths = getV2Paths('');
    const pluginPaths = getPluginPaths({ vault: { configDir: '.obsidian' } } as any);
    const { plugin, files } = createMemoryPlugin({
      [v2Paths.ir.pointFilesIndex]: JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-04-17T00:00:00.000Z',
        files: [
          {
            topicId: 'topic-1',
            topicName: '专题一',
            file: 'points/专题一.irdeck',
            pointCount: 0,
            updatedAt: '2026-04-17T00:00:00.000Z',
          },
        ],
      }),
      [v2Paths.ir.scheduleProfiles]: JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-04-17T00:00:00.000Z',
        profiles: [],
      }),
      [v2Paths.ir.tagGroups]: JSON.stringify({
        version: '1.0.0',
        groups: {
          paper: {
            id: 'paper',
            name: '论文',
            description: 'paper group',
            matchAnyTags: ['paper'],
            matchPriority: 50,
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-17T00:00:00.000Z',
          },
        },
      }),
      [v2Paths.ir.tagGroupProfiles]: JSON.stringify({
        version: '1.0.0',
        profiles: {
          paper: {
            groupId: 'paper',
            intervalFactorBase: 1.9,
            initialIntervalMultiplier: 1.1,
            sampleCount: 4,
            updatedAt: '2026-04-17T00:00:00.000Z',
          },
        },
      }),
      [`${v2Paths.ir.root}/points/专题一.irdeck`]: JSON.stringify({
        schemaVersion: 1,
        topicId: 'topic-1',
        topicName: '专题一',
        updatedAt: '2026-04-17T00:00:00.000Z',
        points: [],
      }),
    });
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('ir_point_storage_migration');
    const fixResult = await service.fix('ir_point_storage_migration', { allowHighRisk: true });
    const recheckResult = await service.check('ir_point_storage_migration');

    expect(checkResult).toMatchObject({
      type: 'ir_point_storage_migration',
      status: 'warning',
    });
    expect(fixResult).toMatchObject({
      type: 'ir_point_storage_migration',
      failed: 0,
    });
    expect(files.has(v2Paths.ir.pointFilesIndex)).toBe(false);
    expect(files.has(v2Paths.ir.scheduleProfiles)).toBe(false);
    expect(files.has(v2Paths.ir.tagGroups)).toBe(false);
    expect(files.has(v2Paths.ir.tagGroupProfiles)).toBe(false);
    expect(files.has(pluginPaths.cache.incrementalReading.pointFilesIndex)).toBe(true);

    const deckFile = JSON.parse(files.get(`${v2Paths.ir.root}/points/专题一.irdeck`) || '{}');
    expect(deckFile.tagGroups.paper).toMatchObject({
      id: 'paper',
      name: '论文',
    });
    expect(deckFile.tagGroupProfiles.paper).toMatchObject({
      groupId: 'paper',
      intervalFactorBase: 1.9,
      sampleCount: 4,
    });
    expect(recheckResult).toMatchObject({
      type: 'ir_point_storage_migration',
      status: 'ok',
      count: 0,
    });
  });
});
