import type { EpubReaderEngine } from '../reader-engine-types';
import { EpubLocationMigrationService } from '../EpubLocationMigrationService';

const getTasksByEpubMock = vi.fn();
const updateEpubResumePointMock = vi.fn();

vi.mock('../../incremental-reading/IREpubBookmarkTaskService', () => ({
	IREpubBookmarkTaskService: class MockIREpubBookmarkTaskService {
		getTasksByEpub(filePath: string) {
			return getTasksByEpubMock(filePath);
		}

	},
}));

vi.mock('../../incremental-reading/IRPointWriteService', () => ({
	IRPointWriteService: class MockIRPointWriteService {
		updateEpubResumePoint(taskId: string, cfi: string) {
			return updateEpubResumePointMock(taskId, cfi);
		}
	},
}));

function createStorageServiceMock() {
	return {
		loadProgress: vi.fn(),
		saveProgress: vi.fn(),
		flushPendingProgress: vi.fn(),
	} as any;
}

describe('EpubLocationMigrationService', () => {
	beforeEach(() => {
		getTasksByEpubMock.mockReset();
		updateEpubResumePointMock.mockReset();
		updateEpubResumePointMock.mockResolvedValue({ kind: 'epub' });
	});

	it('migrates legacy progress, bookmarks, and IR resume points into readium locators', async () => {
		const storageService = createStorageServiceMock();
		storageService.loadProgress.mockResolvedValue({
			chapterIndex: 1,
			cfi: '/6/4',
			percent: 42,
		});

		const canonicalizeLocation = vi.fn(async (cfi: string) => {
			if (cfi === '/6/4') {
				return 'readium:progress';
			}
			if (cfi === 'epubcfi(/6/6!/4/2/6:3)') {
				return 'readium:resume';
			}
			return null;
		});
		const readerService = {
			canonicalizeLocation,
		} as Partial<EpubReaderEngine> as EpubReaderEngine;

		getTasksByEpubMock.mockResolvedValue([
			{
				id: 'task-1',
				resumeCfi: 'epubcfi(/6/6!/4/2/6:3)',
			},
		]);

		const service = new EpubLocationMigrationService({} as any, storageService, readerService);
		const summary = await service.migrateBookData('book-1', 'Books/demo.epub');

		expect(summary).toEqual({
			progressMigrated: true,
			resumePointsMigrated: 1,
		});
		expect(storageService.saveProgress).toHaveBeenCalledWith('book-1', {
			chapterIndex: 1,
			cfi: 'readium:progress',
			percent: 42,
		});
		expect(storageService.flushPendingProgress).toHaveBeenCalledTimes(1);
		expect(getTasksByEpubMock).toHaveBeenCalledWith('Books/demo.epub');
		expect(updateEpubResumePointMock).toHaveBeenCalledWith('task-1', 'readium:resume');
	});

	it('skips migration when the reader engine does not expose a canonicalize hook', async () => {
		const storageService = createStorageServiceMock();
		const readerService = {} as EpubReaderEngine;
		const service = new EpubLocationMigrationService({} as any, storageService, readerService);

		const summary = await service.migrateBookData('book-1', 'Books/demo.epub');

		expect(summary).toEqual({
			progressMigrated: false,
			resumePointsMigrated: 0,
		});
		expect(storageService.loadProgress).not.toHaveBeenCalled();
		expect(getTasksByEpubMock).not.toHaveBeenCalled();
	});
});
