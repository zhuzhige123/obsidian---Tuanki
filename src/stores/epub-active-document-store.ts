/**
 * EPUB Active Document Store
 * 全局状态：EPUB阅读器当前打开的文件路径及共享服务实例
 * - filePath: 卡片管理界面用于文档关联筛选
 * - services: 全局侧边栏用于读取TOC/高亮并执行导航
 */

import type { EpubAnnotationService, EpubBook, EpubExcerptSettings, EpubReaderEngine, TocItem } from "../services/epub";
import type { FlashStyle, PaginationInfo } from "../services/epub";
import type { EpubBacklinkHighlightService } from "../services/epub/EpubBacklinkHighlightService";

export interface EpubNavigationRequest {
	cfi?: string;
	href?: string;
	text?: string;
	flashStyle?: FlashStyle;
	flashColor?: string;
	showLocateOverlay?: boolean;
}

export interface EpubSharedState {
	filePath: string | null;
	readerService: EpubReaderEngine | null;
	annotationService: EpubAnnotationService | null;
	backlinkService: EpubBacklinkHighlightService | null;
	book: EpubBook | null;
	excerptSettings: EpubExcerptSettings | null;
	annotationRevision: number;
	bookmarkRevision: number;
	progress: number;
	chapterTitle: string;
	paginationInfo: PaginationInfo | null;
	navigationBusy: boolean;
	navigationLabel: string;
	searchQuerySeed: string;
	searchRequestNonce: number;
	onSettingsClick: ((evt: MouseEvent) => void) | null;
	onSwitchBook: ((filePath: string) => void) | null;
	onCreateChapterReadingPoint: ((item: TocItem) => Promise<void>) | null;
	onNavigate: ((request: EpubNavigationRequest) => void) | null;
}

type Subscriber = (state: EpubSharedState) => void;
type FilePathSubscriber = (filePath: string | null) => void;

const EMPTY_STATE: EpubSharedState = {
	filePath: null,
	readerService: null,
	annotationService: null,
	backlinkService: null,
	book: null,
	excerptSettings: null,
	annotationRevision: 0,
	bookmarkRevision: 0,
	progress: 0,
	chapterTitle: "",
	paginationInfo: null,
	navigationBusy: false,
	navigationLabel: "",
	searchQuerySeed: "",
	searchRequestNonce: 0,
	onSettingsClick: null,
	onSwitchBook: null,
	onCreateChapterReadingPoint: null,
	onNavigate: null,
};

class EpubActiveDocumentStore {
	private state: EpubSharedState = { ...EMPTY_STATE };
	private subscribers: Set<Subscriber> = new Set();
	private filePathSubscribers: Set<FilePathSubscriber> = new Set();

	setActiveDocument(filePath: string | null): void {
		this.state.filePath = filePath;
		this.notifyAll();
	}

	getActiveDocument(): string | null {
		return this.state.filePath;
	}

	clearActiveDocument(filePath?: string | null): void {
		if (filePath && this.state.filePath && this.state.filePath !== filePath) {
			return;
		}
		this.state = { ...EMPTY_STATE };
		this.notifyAll();
	}

	setSharedState(partial: Partial<EpubSharedState>): void {
		Object.assign(this.state, partial);
		this.notifyAll();
	}

	getSharedState(): Readonly<EpubSharedState> {
		return this.state;
	}

	subscribe(callback: FilePathSubscriber): () => void {
		this.filePathSubscribers.add(callback);
		callback(this.state.filePath);
		return () => {
			this.filePathSubscribers.delete(callback);
		};
	}

	subscribeState(callback: Subscriber): () => void {
		this.subscribers.add(callback);
		callback(this.state);
		return () => {
			this.subscribers.delete(callback);
		};
	}

	private notifyAll(): void {
		for (const callback of this.filePathSubscribers) {
			callback(this.state.filePath);
		}

		for (const callback of this.subscribers) {
			callback(this.state);
		}
	}
}

export const epubActiveDocumentStore = new EpubActiveDocumentStore();
