import { TFile } from "obsidian";
import JSZip from "jszip";
import { readVaultBinaryData } from "../EpubBinaryData";

const originalFetch = globalThis.fetch;

async function createRealZipArrayBuffer(name: string, content = "demo-epub-payload"): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(name, content);
  return zip.generateAsync({ type: "arraybuffer" });
}

function createMockFile(path: string, size: number) {
  return Object.assign(Object.create(TFile.prototype), {
    path,
    name: path.split("/").pop() || "book.epub",
    basename: "book",
    extension: "epub",
    parent: { path: "Books" },
    stat: {
      size,
      mtime: Date.now(),
      ctime: Date.now(),
    },
  }) as TFile;
}

afterEach(() => {
  vi.restoreAllMocks();
  if (typeof originalFetch === "function") {
    globalThis.fetch = originalFetch;
  } else {
    Reflect.deleteProperty(globalThis, "fetch");
  }
});

describe("readVaultBinaryData", () => {
  it("returns the primary vault.readBinary payload when its size matches the vault file stat", async () => {
    const exact = await createRealZipArrayBuffer("content.xhtml", "exact-zip");
    const file = createMockFile("Books/exact.epub", exact.byteLength);
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => await createRealZipArrayBuffer("fallback.xhtml", "fallback-short"),
    }));
    (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch = fetchSpy as unknown as typeof fetch;

    const app = {
      vault: {
        readBinary: vi.fn(async () => exact),
        adapter: {
          readBinary: vi.fn(async () => await createRealZipArrayBuffer("adapter.xhtml", "adapter-short")),
        },
        getResourcePath: vi.fn(() => "app://resource/exact.epub"),
      },
    };

    const result = await readVaultBinaryData(app as any, file, file.path);

    expect(result.byteLength).toBe(exact.byteLength);
    expect(app.vault.readBinary).toHaveBeenCalledTimes(1);
    expect(app.vault.adapter.readBinary).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to fetching the resource path when native binary reads return a truncated EPUB", async () => {
    const exact = await createRealZipArrayBuffer("chapter.xhtml", "mobile-complete-zip");
    const truncated = exact.slice(0, Math.max(8, exact.byteLength - 12));
    const file = createMockFile("Books/mobile.epub", exact.byteLength);
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => exact,
    }));
    (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch = fetchSpy as unknown as typeof fetch;

    const app = {
      vault: {
        readBinary: vi.fn(async () => truncated),
        adapter: {
          readBinary: vi.fn(async () => truncated),
        },
        getResourcePath: vi.fn(() => "app://resource/mobile.epub"),
      },
    };

    const result = await readVaultBinaryData(app as any, file, file.path);

    expect(result.byteLength).toBe(exact.byteLength);
    expect(app.vault.readBinary).toHaveBeenCalledTimes(1);
    expect(app.vault.adapter.readBinary).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falls through when the primary payload matches file size but is not actually a readable ZIP archive", async () => {
    const recovered = await createRealZipArrayBuffer("chapter.xhtml", "recovered-zip");
    const corrupted = recovered.slice(0);
    const file = createMockFile("Books/corrupted.epub", recovered.byteLength);
    const loadAsyncSpy = vi.spyOn(JSZip, "loadAsync");
    loadAsyncSpy.mockImplementation(async (input: any) => {
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBuffer);
      if (bytes[4] === 0x63) {
        throw new Error("Corrupted zip ?");
      }
      return {} as JSZip;
    });
    new Uint8Array(corrupted)[4] = 0x63;

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => recovered,
    }));
    (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch = fetchSpy as unknown as typeof fetch;

    const app = {
      vault: {
        readBinary: vi.fn(async () => corrupted),
        adapter: {
          readBinary: vi.fn(async () => corrupted),
        },
        getResourcePath: vi.fn(() => "app://resource/corrupted.epub"),
      },
    };

    const result = await readVaultBinaryData(app as any, file, file.path);

    expect(result.byteLength).toBe(recovered.byteLength);
    expect(result[4]).not.toBe(0x63);
    expect(app.vault.adapter.readBinary).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
