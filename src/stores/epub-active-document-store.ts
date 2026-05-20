/**
 * EPUB Active Document Store
 * 仅保留主插件仍在使用的最小协作面：
 * 当前 EPUB 活动文件路径，用于卡片管理界面的文档关联筛选。
 */

type Subscriber = (filePath: string | null) => void;

class EpubActiveDocumentStore {
	private currentFilePath: string | null = null;
	private subscribers: Set<Subscriber> = new Set();

	setActiveDocument(filePath: string | null): void {
		this.currentFilePath = filePath;
		this.notifySubscribers();
	}

	getActiveDocument(): string | null {
		return this.currentFilePath;
	}

	clearActiveDocument(filePath?: string | null): void {
		if (filePath && this.currentFilePath && this.currentFilePath !== filePath) {
			return;
		}
		this.currentFilePath = null;
		this.notifySubscribers();
	}

	subscribe(callback: Subscriber): () => void {
		this.subscribers.add(callback);
		callback(this.currentFilePath);
		return () => {
			this.subscribers.delete(callback);
		};
	}

	private notifySubscribers(): void {
		for (const callback of this.subscribers) {
			callback(this.currentFilePath);
		}
	}
}

export const epubActiveDocumentStore = new EpubActiveDocumentStore();
