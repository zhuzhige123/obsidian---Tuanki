import { MarkdownFileSuggestModal } from "./MarkdownFileSuggestModal";

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("../tests/mocks/obsidian")>(
		"../tests/mocks/obsidian"
	);

	class TFile extends actual.TFile {
		constructor(path: string) {
			super(path);
		}
	}

	class App extends actual.App {
		constructor(files: TFile[] = []) {
			super();
			this.vault = {
				...this.vault,
				getMarkdownFiles: () => files,
			} as any;
		}
	}

	class FuzzySuggestModal<T> extends actual.Component {
		app: App;

		constructor(app: App) {
			super();
			this.app = app;
		}

		setPlaceholder(_value: string): void {}
		open(): void {}
		onClose(): void {}
	}

	return {
		...actual,
		App,
		FuzzySuggestModal,
		TFile,
		setIcon: vi.fn(),
	};
});

import { App, TFile } from "obsidian";

function createFile(path: string): TFile {
	return { path } as TFile;
}

function createApp(files: TFile[]): App {
	const app = new App();
	Object.assign(app, {
		vault: {
			getMarkdownFiles: () => files,
		},
	});
	return app;
}

describe("MarkdownFileSuggestModal", () => {
	it("点击建议项时即使先触发关闭，也应保留真实选择结果", async () => {
		vi.useFakeTimers();

		try {
			const file = createFile("Inbox/Test.md");
			const app = createApp([file]);
			const modal = new MarkdownFileSuggestModal(app);

			const promise = modal.openAndSelect();
			modal.onClose();
			modal.onChooseItem({ kind: "file", file });

			await vi.runAllTimersAsync();

			await expect(promise).resolves.toBe(file);
		} finally {
			vi.useRealTimers();
		}
	});

	it("真正取消选择时应返回 null", async () => {
		vi.useFakeTimers();

		try {
			const app = createApp([createFile("Inbox/Test.md")]);
			const modal = new MarkdownFileSuggestModal(app);

			const promise = modal.openAndSelect();
			modal.onClose();

			await vi.runAllTimersAsync();

			await expect(promise).resolves.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("支持排除当前文件路径", () => {
		const app = createApp([createFile("Inbox/Keep.md"), createFile("Inbox/Exclude.md")]);

		const modal = new MarkdownFileSuggestModal(app, {
			excludePath: "Inbox/Exclude.md",
		});

		expect(
			modal
				.getItems()
				.filter((item) => item.kind === "file")
				.map((item) => item.file.path)
		).toEqual(["Inbox/Keep.md"]);
	});
});
