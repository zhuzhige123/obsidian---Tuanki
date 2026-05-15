import { getPluginPaths, getV2Paths } from '../../config/paths';
import { QuestionBankStorage } from '../question-bank/QuestionBankStorage';

function normalizeTestPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function parentPath(path: string): string {
  const normalized = normalizeTestPath(path);
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : '';
}

function createMemoryApp(initialFiles: Record<string, string> = {}) {
  const files = new Map<string, string>();
  const folders = new Set<string>(['', '.obsidian', '.obsidian/plugins', '.obsidian/plugins/weave']);

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

  const adapter = {
    basePath: 'C:/vault',
    exists: async (path: string) => {
      const normalized = normalizeTestPath(path);
      return files.has(normalized) || folders.has(normalized);
    },
    mkdir: async (path: string) => {
      ensureDir(path);
    },
    stat: async (path: string) => {
      const normalized = normalizeTestPath(path);
      if (folders.has(normalized)) {
        return { type: 'folder' };
      }
      if (files.has(normalized)) {
        return { type: 'file' };
      }
      return null;
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
      if (value === undefined) {
        throw new Error(`File not found: ${normalized}`);
      }
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

  const app = {
    vault: {
      configDir: '.obsidian',
      adapter,
      getAbstractFileByPath: (path: string) => {
        const normalized = normalizeTestPath(path);
        return files.has(normalized) || folders.has(normalized)
          ? { path: normalized }
          : null;
      },
    },
  } as any;

  return { app };
}

describe('QuestionBankStorage cleanup', () => {
  it('cleans question-bank references and per-card runtime data for deleted memory cards', async () => {
    const v2Paths = getV2Paths('');
    const pluginPaths = getPluginPaths({
      vault: {
        configDir: '.obsidian',
      },
    } as any);
    const bankA = { id: 'bank-a', name: '考试A', metadata: {}, created: '', modified: '' };
    const bankB = { id: 'bank-b', name: '考试B', metadata: {}, created: '', modified: '' };
    const { app } = createMemoryApp({
      [v2Paths.questionBank.banks]: JSON.stringify([bankA, bankB]),
      [`${v2Paths.questionBank.root}/banks/bank-a/questions.json`]: JSON.stringify({
        _schemaVersion: '2.0.0',
        bankId: 'bank-a',
        refs: [
          { cardUuid: 'card-1', addedAt: '2026-03-30T00:00:00.000Z' },
          { cardUuid: 'card-keep', addedAt: '2026-03-30T00:00:00.000Z' },
        ],
      }),
      [`${v2Paths.questionBank.root}/banks/bank-b/questions.json`]: JSON.stringify({
        _schemaVersion: '2.0.0',
        bankId: 'bank-b',
        refs: [
          { cardUuid: 'card-1', addedAt: '2026-03-30T00:00:00.000Z' },
          { cardUuid: 'card-2', addedAt: '2026-03-30T00:00:00.000Z' },
        ],
      }),
      [v2Paths.questionBank.questionStats]: JSON.stringify({
        _schemaVersion: '1.0.0',
        statsByUuid: {
          'card-1': { totalAttempts: 3 },
          'card-2': { totalAttempts: 2 },
          'card-keep': { totalAttempts: 1 },
        },
      }),
      [v2Paths.questionBank.testHistory]: JSON.stringify({
        _schemaVersion: '2.0.0',
        byBank: {
          'bank-a': [
            {
              sessionId: 'archive-a',
              bankId: 'bank-a',
              timestamp: '2026-03-30T00:00:00.000Z',
              mode: 'exam',
              score: 50,
              accuracy: 50,
              totalQuestions: 2,
              correctCount: 1,
              durationSeconds: 9,
            },
          ],
          'bank-b': [
            {
              sessionId: 'archive-b',
              bankId: 'bank-b',
              timestamp: '2026-03-30T00:00:00.000Z',
              mode: 'exam',
              score: 0,
              accuracy: 0,
              totalQuestions: 1,
              correctCount: 0,
              durationSeconds: 3,
            },
          ],
        },
      }),
      [v2Paths.questionBank.errorBook]: JSON.stringify({
        _schemaVersion: '2.0.0',
        byBank: {
          'bank-a': [
            { bankId: 'bank-a', cardId: 'card-1', errorCount: 1, consecutiveCorrect: 0, addedAt: '', lastErrorDate: '', errorLevel: 'light' },
            { bankId: 'bank-a', cardId: 'card-keep', errorCount: 1, consecutiveCorrect: 0, addedAt: '', lastErrorDate: '', errorLevel: 'light' },
          ],
          'bank-b': [
            { bankId: 'bank-b', cardId: 'card-1', errorCount: 2, consecutiveCorrect: 0, addedAt: '', lastErrorDate: '', errorLevel: 'medium' },
          ],
        },
      }),
      [v2Paths.questionBank.inProgress]: JSON.stringify({
        _schemaVersion: '2.0.0',
        byBank: {
          'bank-a': {
            id: 'session-a',
            bankId: 'bank-a',
            bankName: '考试A',
            mode: 'exam',
            startTime: '2026-03-30T00:00:00.000Z',
            duration: 30,
            questions: [
              { questionId: 'card-1', userAnswer: 'A', correctAnswer: 'A', isCorrect: true, timeSpent: 5, submittedAt: '2026-03-30T00:01:00.000Z' },
              { questionId: 'card-keep', userAnswer: null, correctAnswer: 'B', isCorrect: null, timeSpent: 0, submittedAt: null },
            ],
            totalQuestions: 2,
            completedQuestions: 1,
            correctCount: 1,
            incorrectCount: 0,
            wrongCount: 0,
            score: 50,
            accuracy: 1,
            skippedCount: 0,
            status: 'in_progress',
            currentQuestionIndex: 1,
          },
          'bank-b': {
            id: 'session-b',
            bankId: 'bank-b',
            bankName: '考试B',
            mode: 'exam',
            startTime: '2026-03-30T00:00:00.000Z',
            duration: 10,
            questions: [
              { questionId: 'card-1', userAnswer: 'A', correctAnswer: 'B', isCorrect: false, timeSpent: 2, submittedAt: '2026-03-30T00:01:00.000Z' },
            ],
            totalQuestions: 1,
            completedQuestions: 1,
            correctCount: 0,
            incorrectCount: 1,
            wrongCount: 1,
            score: 0,
            accuracy: 0,
            skippedCount: 0,
            status: 'in_progress',
            currentQuestionIndex: 0,
          },
        },
      }),
      [v2Paths.questionBank.sessionArchives]: JSON.stringify({
        _schemaVersion: '2.0.0',
        byBank: {
          'bank-a': {
            'archive-a': {
              sessionId: 'archive-a',
              bankId: 'bank-a',
              totalQuestions: 2,
              correctCount: 1,
              wrongCount: 1,
              score: 50,
              totalTimeSpent: 9,
              questions: [
                { questionId: 'card-1', isCorrect: true, timeSpent: 4 },
                { questionId: 'card-keep', isCorrect: false, timeSpent: 5 },
              ],
            },
          },
          'bank-b': {
            'archive-b': {
              sessionId: 'archive-b',
              bankId: 'bank-b',
              totalQuestions: 1,
              correctCount: 0,
              wrongCount: 1,
              score: 0,
              totalTimeSpent: 3,
              questions: [
                { questionId: 'card-1', isCorrect: false, timeSpent: 3 },
              ],
            },
          },
        },
      }),
    });

    const storage = new QuestionBankStorage(app);
    await storage.initialize();

    const result = await storage.cleanupDeletedCards(['card-1']);

    expect(result.affectedBankIds.sort()).toEqual(['bank-a', 'bank-b']);
    expect(result.removedRefs).toBe(2);
    expect(result.removedGlobalStats).toBe(1);
    expect(result.removedErrorBookEntries).toBe(2);
    expect(result.updatedInProgressSessions).toBe(1);
    expect(result.removedInProgressSessions).toBe(1);
    expect(result.updatedSessionArchives).toBe(1);
    expect(result.removedSessionArchives).toBe(1);
    expect(result.updatedHistoryEntries).toBe(1);
    expect(result.removedHistoryEntries).toBe(1);

    await expect(storage.loadBankQuestionRefs('bank-a')).resolves.toEqual([
      { cardUuid: 'card-keep', addedAt: '2026-03-30T00:00:00.000Z' },
    ]);
    await expect(storage.loadBankQuestionRefs('bank-b')).resolves.toEqual([
      { cardUuid: 'card-2', addedAt: '2026-03-30T00:00:00.000Z' },
    ]);

    const globalStats = await storage.loadGlobalQuestionStats();
    expect(globalStats['card-1']).toBeUndefined();
    expect(globalStats['card-2']).toEqual({ totalAttempts: 2 });
    expect(globalStats['card-keep']).toEqual({ totalAttempts: 1 });

    await expect(storage.loadErrorBook('bank-a')).resolves.toEqual([
      expect.objectContaining({ cardId: 'card-keep' }),
    ]);
    await expect(storage.loadErrorBook('bank-b')).resolves.toEqual([]);

    const inProgressA = await storage.loadInProgressSession('bank-a');
    expect(inProgressA?.questions.map((question) => question.questionId)).toEqual(['card-keep']);
    expect(inProgressA?.totalQuestions).toBe(1);
    expect(inProgressA?.currentQuestionIndex).toBe(0);
    await expect(storage.loadInProgressSession('bank-b')).resolves.toBeNull();

    const sessionArchivesRaw = await app.vault.adapter.read(pluginPaths.cache.root + '/question-bank/session-archives.json');
    const sessionArchives = JSON.parse(sessionArchivesRaw).byBank;
    expect(sessionArchives['bank-a']['archive-a'].questions.map((question: any) => question.questionId)).toEqual(['card-keep']);
    expect(sessionArchives['bank-b']).toBeUndefined();

    await expect(storage.loadTestHistory('bank-a')).resolves.toEqual([
      expect.objectContaining({
        sessionId: 'archive-a',
        totalQuestions: 1,
        correctCount: 0,
        score: 0,
        accuracy: 0,
        durationSeconds: 5,
        questionSummaries: [
          expect.objectContaining({
            questionId: 'card-keep',
            isCorrect: false,
            answered: true,
            timeSpentSeconds: 5,
          }),
        ],
      }),
    ]);
    await expect(storage.loadTestHistory('bank-b')).resolves.toEqual([]);
  });

  it('deletes full bank data and only prunes orphaned global question stats', async () => {
    const v2Paths = getV2Paths('');
    const bankA = { id: 'bank-a', name: '考试A', metadata: {}, created: '', modified: '' };
    const bankB = { id: 'bank-b', name: '考试B', metadata: {}, created: '', modified: '' };
    const { app } = createMemoryApp({
      [v2Paths.questionBank.banks]: JSON.stringify([bankA, bankB]),
      [`${v2Paths.questionBank.root}/banks/bank-a/questions.json`]: JSON.stringify({
        _schemaVersion: '2.0.0',
        bankId: 'bank-a',
        refs: [
          { cardUuid: 'card-shared', addedAt: '2026-03-30T00:00:00.000Z' },
          { cardUuid: 'card-a-only', addedAt: '2026-03-30T00:00:00.000Z' },
        ],
      }),
      [`${v2Paths.questionBank.root}/banks/bank-b/questions.json`]: JSON.stringify({
        _schemaVersion: '2.0.0',
        bankId: 'bank-b',
        refs: [
          { cardUuid: 'card-shared', addedAt: '2026-03-30T00:00:00.000Z' },
        ],
      }),
      [v2Paths.questionBank.questionStats]: JSON.stringify({
        _schemaVersion: '1.0.0',
        statsByUuid: {
          'card-shared': { totalAttempts: 4 },
          'card-a-only': { totalAttempts: 1 },
        },
      }),
      [v2Paths.questionBank.testHistory]: JSON.stringify({
        _schemaVersion: '2.0.0',
        byBank: {
          'bank-a': [{ sessionId: 'history-a', bankId: 'bank-a', timestamp: '', mode: 'exam', score: 80, accuracy: 0.8, totalQuestions: 2, correctCount: 2, durationSeconds: 10 }],
          'bank-b': [{ sessionId: 'history-b', bankId: 'bank-b', timestamp: '', mode: 'exam', score: 90, accuracy: 0.9, totalQuestions: 1, correctCount: 1, durationSeconds: 5 }],
        },
      }),
      [v2Paths.questionBank.inProgress]: JSON.stringify({
        _schemaVersion: '2.0.0',
        byBank: {
          'bank-a': { id: 'session-a', bankId: 'bank-a', bankName: '考试A', mode: 'exam', startTime: '', duration: 0, questions: [], totalQuestions: 0, completedQuestions: 0, correctCount: 0, incorrectCount: 0, wrongCount: 0, score: 0, accuracy: 0, skippedCount: 0, status: 'in_progress', currentQuestionIndex: 0 },
          'bank-b': { id: 'session-b', bankId: 'bank-b', bankName: '考试B', mode: 'exam', startTime: '', duration: 0, questions: [], totalQuestions: 0, completedQuestions: 0, correctCount: 0, incorrectCount: 0, wrongCount: 0, score: 0, accuracy: 0, skippedCount: 0, status: 'in_progress', currentQuestionIndex: 0 },
        },
      }),
      [v2Paths.questionBank.errorBook]: JSON.stringify({
        _schemaVersion: '2.0.0',
        byBank: {
          'bank-a': [{ bankId: 'bank-a', cardId: 'card-a-only', errorCount: 1, consecutiveCorrect: 0, addedAt: '', lastErrorDate: '', errorLevel: 'light' }],
          'bank-b': [{ bankId: 'bank-b', cardId: 'card-shared', errorCount: 1, consecutiveCorrect: 0, addedAt: '', lastErrorDate: '', errorLevel: 'light' }],
        },
      }),
      [v2Paths.questionBank.sessionArchives]: JSON.stringify({
        _schemaVersion: '2.0.0',
        byBank: {
          'bank-a': { 'archive-a': { sessionId: 'archive-a', questions: [{ questionId: 'card-a-only' }] } },
          'bank-b': { 'archive-b': { sessionId: 'archive-b', questions: [{ questionId: 'card-shared' }] } },
        },
      }),
    });

    const storage = new QuestionBankStorage(app);
    await storage.initialize();

    await storage.deleteBankData('bank-a');

    await expect(storage.loadBankQuestionRefs('bank-a')).resolves.toEqual([]);
    await expect(storage.loadBankQuestionRefs('bank-b')).resolves.toEqual([
      { cardUuid: 'card-shared', addedAt: '2026-03-30T00:00:00.000Z' },
    ]);

    const globalStats = await storage.loadGlobalQuestionStats();
    expect(globalStats['card-a-only']).toBeUndefined();
    expect(globalStats['card-shared']).toEqual({ totalAttempts: 4 });

    const testHistoryRaw = await app.vault.adapter.read(v2Paths.questionBank.testHistory);
    const testHistory = JSON.parse(testHistoryRaw).byBank;
    expect(testHistory['bank-a']).toBeUndefined();
    expect(testHistory['bank-b']).toHaveLength(1);

    await expect(storage.loadInProgressSession('bank-a')).resolves.toBeNull();
    await expect(storage.loadInProgressSession('bank-b')).resolves.not.toBeNull();
    await expect(storage.loadErrorBook('bank-a')).resolves.toEqual([]);
    await expect(storage.loadErrorBook('bank-b')).resolves.toHaveLength(1);

    const sessionArchivesRaw = await app.vault.adapter.read(v2Paths.questionBank.sessionArchives);
    const sessionArchives = JSON.parse(sessionArchivesRaw).byBank;
    expect(sessionArchives['bank-a']).toBeUndefined();
    expect(sessionArchives['bank-b']).toBeDefined();
  });

  it('cleans test-history entries with embedded question summaries even without session archives', async () => {
    const v2Paths = getV2Paths('');
    const bankA = { id: 'bank-a', name: '考试A', metadata: {}, created: '', modified: '' };
    const { app } = createMemoryApp({
      [v2Paths.questionBank.banks]: JSON.stringify([bankA]),
      [`${v2Paths.questionBank.root}/banks/bank-a/questions.json`]: JSON.stringify({
        _schemaVersion: '2.0.0',
        bankId: 'bank-a',
        refs: [
          { cardUuid: 'card-1', addedAt: '2026-03-30T00:00:00.000Z' },
          { cardUuid: 'card-keep', addedAt: '2026-03-30T00:00:00.000Z' },
        ],
      }),
      [v2Paths.questionBank.testHistory]: JSON.stringify({
        _schemaVersion: '2.0.0',
        byBank: {
          'bank-a': [
            {
              sessionId: 'history-a',
              bankId: 'bank-a',
              timestamp: '2026-03-30T00:00:00.000Z',
              mode: 'exam',
              score: 50,
              accuracy: 50,
              totalQuestions: 2,
              correctCount: 1,
              durationSeconds: 7,
              questionSummaries: [
                { questionId: 'card-1', isCorrect: true, answered: true, timeSpentSeconds: 2 },
                { questionId: 'card-keep', isCorrect: false, answered: true, timeSpentSeconds: 5 },
              ],
            },
          ],
        },
      }),
    });

    const storage = new QuestionBankStorage(app);
    await storage.initialize();

    const result = await storage.cleanupDeletedCards(['card-1']);

    expect(result.updatedHistoryEntries).toBe(1);
    expect(result.removedHistoryEntries).toBe(0);

    await expect(storage.loadTestHistory('bank-a')).resolves.toEqual([
      expect.objectContaining({
        sessionId: 'history-a',
        totalQuestions: 1,
        correctCount: 0,
        score: 0,
        accuracy: 0,
        durationSeconds: 5,
        questionSummaries: [
          {
            questionId: 'card-keep',
            isCorrect: false,
            answered: true,
            timeSpentSeconds: 5,
          },
        ],
      }),
    ]);
  });
});
