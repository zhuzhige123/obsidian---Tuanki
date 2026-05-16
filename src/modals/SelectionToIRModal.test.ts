
vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("../tests/mocks/obsidian")>(
		"../tests/mocks/obsidian"
	);

	class Modal extends actual.Modal {
		modalEl = document.createElement("div");
		scope = { register: vi.fn() };

		constructor(app: any) {
			super(app);
		}
	}

	class FuzzySuggestModal<T> extends actual.Component {
		app: any;

		constructor(app: any) {
			super();
			this.app = app;
		}

		setPlaceholder(): void {}
		open(): void {}
		close(): void {}
		onClose(): void {}
	}

	return {
		...actual,
		FuzzySuggestModal,
		Modal,
		normalizePath: (value: string) => value.replace(/\\/g, "/"),
	};
});

import { SelectionToIRModal } from "./SelectionToIRModal";

describe("SelectionToIRModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("submits the selected deckId before creating the reading point", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		const modal = new SelectionToIRModal({} as any, {
			deckOptions: [
				{ id: "deck-psy", name: "心理学" },
				{ id: "deck-method", name: "卡片方法" },
			],
			initialDeckId: "deck-psy",
			initialTitle: "标题",
			initialFolder: "Knowledge/IR",
			titleDetected: true,
			onSubmit,
		});

		(modal as any).createButtonEl = document.createElement("button");
		(modal as any).titleInputEl = { value: "新的标题" };

		await (modal as any).handleCreate();

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({
			deckId: "deck-psy",
			folderPath: "Knowledge/IR",
			title: "新的标题",
		});
	});

	it("does not submit when no deck is selected", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		const modal = new SelectionToIRModal({} as any, {
			deckOptions: [{ id: "deck-psy", name: "心理学" }],
			initialDeckId: "",
			initialTitle: "标题",
			initialFolder: "Knowledge/IR",
			titleDetected: true,
			onSubmit,
		});

		(modal as any).createButtonEl = document.createElement("button");

		await (modal as any).handleCreate();

		expect(onSubmit).not.toHaveBeenCalled();
	});
});
