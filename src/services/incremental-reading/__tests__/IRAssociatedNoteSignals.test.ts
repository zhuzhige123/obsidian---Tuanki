import type { Card } from "../../../data/types";
import {
	buildAssociatedNoteSignalIndex,
	getAssociatedNoteSignal,
	remapAssociatedNotePaths,
	resolveAssociatedNotePath,
	resolveAssociatedNotePaths,
	resolveAssociatedNotePrimaryPath,
} from "../IRAssociatedNoteSignals";

function createCard(overrides: Partial<Card>): Card {
	return {
		uuid: overrides.uuid ?? crypto.randomUUID(),
		content: "",
		cardPurpose: "memory",
		priority: 3,
		...overrides,
	} as Card;
}

describe("IRAssociatedNoteSignals", () => {
	test("只统计记忆卡，并把 md、无扩展名、块链接视为同一关联笔记", () => {
		const cards: Card[] = [
			createCard({
				uuid: "memory-direct",
				priority: 4,
				sourceFile: "Notes/Topic.md",
			}),
			createCard({
				uuid: "memory-block-link",
				priority: 2,
				content: ["---", "we_source:", '  - "[[Notes/Topic#^block-123|Topic]]"', "---", "正文"].join("\n"),
			}),
			createCard({
				uuid: "test-card",
				cardPurpose: "test",
				priority: 4,
				sourceFile: "Notes/Topic.md",
			}),
			createCard({
				uuid: "other-note",
				priority: 3,
				sourceFile: "Notes/Other.md",
			}),
		];

		const index = buildAssociatedNoteSignalIndex(cards);

		const topicSignal = getAssociatedNoteSignal(index, "Notes/Topic.md");
		expect(topicSignal).toBeDefined();
		expect(topicSignal?.cardCount).toBe(2);
		expect(topicSignal?.averagePriority).toBe(3);
		expect(topicSignal?.maxPriority).toBe(4);
		expect(topicSignal?.prioritySignal).toBe(7.1);

		expect(getAssociatedNoteSignal(index, "Notes/Topic")?.cardCount).toBe(2);
		expect(getAssociatedNoteSignal(index, "notes/topic#^another-block")?.cardCount).toBe(2);
		expect(getAssociatedNoteSignal(index, "Notes/Other.md")?.cardCount).toBe(1);
	});

	test("不会把非 Markdown 来源误统计为关联笔记信号", () => {
		const index = buildAssociatedNoteSignalIndex([
			createCard({
				uuid: "pdf-card",
				priority: 4,
				sourceFile: "Books/Deep-Work.pdf",
			}),
			createCard({
				uuid: "epub-card",
				priority: 3,
				sourceFile: "Books/Atomic-Habits.epub",
			}),
		]);

		expect(Array.from(index.values())).toHaveLength(0);
		expect(getAssociatedNoteSignal(index, "Books/Deep-Work.pdf")).toBeUndefined();
		expect(getAssociatedNoteSignal(index, "Books/Atomic-Habits.epub")).toBeUndefined();
	});

	test("resolveAssociatedNotePath 允许 Markdown 笔记路径并拒绝非 Markdown 路径", () => {
		expect(resolveAssociatedNotePath({ associatedNotePath: "Folder/Linked-Note.md" } as any)).toBe("Folder/Linked-Note.md");
		expect(resolveAssociatedNotePath({ associatedNotePath: "Folder/Linked-Note" } as any)).toBe("Folder/Linked-Note");
		expect(resolveAssociatedNotePath({ associatedNotePath: "Folder/Reference.pdf" } as any)).toBeUndefined();
		expect(resolveAssociatedNotePath(null)).toBeUndefined();
	});

	test("resolveAssociatedNotePrimaryPath 优先主笔记并兼容多关联笔记数组", () => {
		expect(
			resolveAssociatedNotePrimaryPath({
				primaryAssociatedNotePath: "Folder/Primary.md",
				associatedNotePath: "Folder/Legacy.md",
				associatedNotePaths: ["Folder/Secondary.md"],
			} as any)
		).toBe("Folder/Primary.md");

		expect(
			resolveAssociatedNotePrimaryPath({
				associatedNotePaths: ["Folder/Secondary.md", "Folder/Tertiary.md"],
			} as any)
		).toBe("Folder/Secondary.md");
	});

	test("resolveAssociatedNotePaths 会去重并优先保留带扩展名的主路径", () => {
		expect(
			resolveAssociatedNotePaths({
				associatedNotePaths: ["Folder/Topic", "Folder/Topic.md", "Folder/Other.md", "Folder/Other"],
			})
		).toEqual(["Folder/Topic.md", "Folder/Other.md"]);
	});

	test("remapAssociatedNotePaths 会把无扩展名旧路径一起迁移到新的 Markdown 文件名", () => {
		expect(
			remapAssociatedNotePaths(
				["Folder/Topic", "Folder/Appendix.md", "Folder/Topic.md"],
				"Folder/Topic.md",
				"Folder/Renamed Topic.md"
			)
		).toEqual(["Folder/Renamed Topic.md", "Folder/Appendix.md"]);
	});
});
