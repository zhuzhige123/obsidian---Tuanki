import { fireEvent, render, waitFor } from "@testing-library/svelte";

const obsidianMocks = vi.hoisted(() => ({
  FuzzySuggestModal: class {
    constructor(_app: unknown) {}
    setPlaceholder(_value: string) {}
    open() {}
  },
  TFile: class {},
  TFolder: class {}
}));

vi.mock("obsidian", async () => {
  const actual = await vi.importActual<typeof import("../../tests/mocks/obsidian")>(
    "../../tests/mocks/obsidian"
  );
  return {
    ...actual,
    ...obsidianMocks
  };
});

import CardToMarkdownModal from "./CardToMarkdownModal.svelte";

function createPluginMock() {
  return {
    app: {
      vault: {
        getRoot: () => ({ children: [] }),
        getMarkdownFiles: () => []
      }
    }
  } as any;
}

function createCardMock() {
  return {
    uuid: "12345678-abcd-efgh-ijkl-1234567890ab",
    content: "# 测试标题\n\n测试内容"
  } as any;
}

describe("CardToMarkdownModal", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
    vi.clearAllMocks();
  });

  it("portals the modal overlay to document.body and locks background scroll", async () => {
    const { container } = render(CardToMarkdownModal, {
      props: {
        open: true,
        plugin: createPluginMock(),
        card: createCardMock(),
        busy: false,
        onClose: vi.fn(),
        onConfirm: vi.fn()
      }
    });

    await waitFor(() => {
      const overlay = document.body.querySelector(".card-to-md-overlay");
      expect(overlay).toBeInTheDocument();
      expect(overlay?.parentElement).toBe(document.body);
    });

    expect(container.querySelector(".card-to-md-overlay")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores background scroll after the modal closes", async () => {
    const rendered = render(CardToMarkdownModal, {
      props: {
        open: true,
        plugin: createPluginMock(),
        card: createCardMock(),
        busy: false,
        onClose: vi.fn(),
        onConfirm: vi.fn()
      }
    });

    await waitFor(() => {
      expect(document.body.querySelector(".card-to-md-overlay")).toBeInTheDocument();
    });

    await rendered.rerender({
      open: false,
      plugin: createPluginMock(),
      card: createCardMock(),
      busy: false,
      onClose: vi.fn(),
      onConfirm: vi.fn()
    });

    await waitFor(() => {
      expect(document.body.querySelector(".card-to-md-overlay")).not.toBeInTheDocument();
    });

    expect(document.body.style.overflow).toBe("");
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();

    render(CardToMarkdownModal, {
      props: {
        open: true,
        plugin: createPluginMock(),
        card: createCardMock(),
        busy: false,
        onClose,
        onConfirm: vi.fn()
      }
    });

    await waitFor(() => {
      expect(document.body.querySelector(".card-to-md-overlay")).toBeInTheDocument();
    });

    await fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
