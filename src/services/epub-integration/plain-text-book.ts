type PlainTextBookSection = {
  id: string;
  title: string;
  text: string;
  html: string;
  size: number;
};

type PlainTextParagraph = {
  lines: string[];
};

type PlainTextTocItem = {
  label: string;
  href: string;
  subitems?: PlainTextTocItem[];
};

export type PlainTextFoliateBook = {
  sections: Array<{
    id: string;
    linear: string;
    size: number;
    load: () => Promise<string>;
    createDocument: () => Promise<Document>;
  }>;
  toc: PlainTextTocItem[];
  metadata: Record<string, unknown>;
  rendition: { layout?: string };
  resolveHref: (href: string) => { index: number; anchor: (doc: Document) => unknown } | null;
  splitTOCHref: (href: string) => [number, string | null];
  getTOCFragment: (doc: Document, fragment: string | null) => Node | null;
  isExternal: (href: string) => boolean;
  destroy: () => void;
};

const CHAPTER_HEADING_PATTERN = /^(?:chapter|part|section)\s+\d+\b.*$|^第[〇零一二三四五六七八九十百千万两0-9]+[章节回部卷篇集][^\n]*$/i;
const TARGET_SECTION_SIZE = 6000;
const MIN_SECTION_SIZE = 1800;

export function makePlainTextBook(options: {
  fileName: string;
  text: string;
}): PlainTextFoliateBook {
  const normalizedText = normalizePlainText(options.text);
  const sections = buildSections(normalizedText).map((section, index) => ({
    id: `txt-section-${index + 1}.xhtml`,
    title: section.title,
    text: section.text,
    html: buildSectionHtml(section.title, section.text, index),
    size: new Blob([section.text]).size,
  }));
  const parser = new DOMParser();
  const urls = new Map<string, string>();

  const loadSection = async (section: PlainTextBookSection): Promise<string> => {
    const cached = urls.get(section.id);
    if (cached) {
      return cached;
    }
    const url = URL.createObjectURL(
      new Blob([section.html], { type: "application/xhtml+xml" })
    );
    urls.set(section.id, url);
    return url;
  };

  const createSectionDocument = async (section: PlainTextBookSection): Promise<Document> =>
    parser.parseFromString(section.html, "application/xhtml+xml");

  const toc = sections.map((section) => ({
    label: section.title,
    href: section.id,
  }));

  return {
    sections: sections.map((section) => ({
      id: section.id,
      linear: "yes",
      size: section.size,
      load: () => loadSection(section),
      createDocument: () => createSectionDocument(section),
    })),
    toc,
    metadata: {
      title: options.fileName.replace(/\.[^.]+$/, ""),
      author: "",
      language: "zh-CN",
    },
    rendition: {},
    resolveHref: (href: string) => resolveHref(href, sections),
    splitTOCHref: (href: string) => {
      const [sectionId, fragment] = String(href || "").split("#");
      const index = sections.findIndex((section) => section.id === sectionId);
      return [index, fragment || null];
    },
    getTOCFragment: (doc: Document, fragment: string | null) => {
      if (!fragment) {
        return doc.documentElement;
      }
      return doc.querySelector(`[data-weave-txt-anchor="${cssEscape(fragment)}"]`);
    },
    isExternal: (href: string) => /^\w+:/i.test(String(href || "")),
    destroy: () => {
      for (const url of urls.values()) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    },
  };
}

function resolveHref(
  href: string,
  sections: PlainTextBookSection[]
): { index: number; anchor: (doc: Document) => unknown } | null {
  const [sectionId, fragment] = String(href || "").split("#");
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index < 0) {
    return null;
  }
  return {
    index,
    anchor: (doc: Document) => {
      if (!fragment) {
        return doc.documentElement;
      }
      return doc.querySelector(`[data-weave-txt-anchor="${cssEscape(fragment)}"]`) || doc.documentElement;
    },
  };
}

function buildSections(text: string): Array<{ title: string; text: string }> {
  if (!text.trim()) {
    return [{ title: "正文", text: "" }];
  }

  const lines = text.split("\n");
  const sections: Array<{ title: string; text: string }> = [];
  let currentTitle = "正文";
  let currentLines: string[] = [];

  const pushCurrentSection = () => {
    const content = currentLines.join("\n").trim();
    if (!content && sections.length > 0) {
      currentLines = [];
      return;
    }
    sections.push({
      title: currentTitle,
      text: content,
    });
    currentLines = [];
  };

  for (const line of lines) {
    const normalizedLine = line.trim();
    if (isHeadingLine(normalizedLine) && currentLines.join("\n").trim().length >= MIN_SECTION_SIZE) {
      pushCurrentSection();
      currentTitle = normalizedLine;
      continue;
    }
    currentLines.push(line);
    if (currentLines.join("\n").length >= TARGET_SECTION_SIZE) {
      pushCurrentSection();
      currentTitle = `正文 ${sections.length + 1}`;
    }
  }

  if (currentLines.length > 0 || sections.length === 0) {
    pushCurrentSection();
  }

  return mergeTinySections(sections);
}

function mergeTinySections(
  sections: Array<{ title: string; text: string }>
): Array<{ title: string; text: string }> {
  const merged: Array<{ title: string; text: string }> = [];
  for (const section of sections) {
    const current = { ...section, text: section.text.trim() };
    if (!current.text) {
      continue;
    }
    const previous = merged[merged.length - 1];
    if (previous && current.text.length < MIN_SECTION_SIZE / 2) {
      previous.text = `${previous.text}\n\n${current.text}`.trim();
      continue;
    }
    merged.push(current);
  }
  return merged.length > 0 ? merged : [{ title: "正文", text: "" }];
}

function isHeadingLine(line: string): boolean {
  return line.length > 0 && line.length <= 80 && CHAPTER_HEADING_PATTERN.test(line);
}

function buildSectionHtml(title: string, text: string, index: number): string {
  const paragraphs = splitParagraphs(text);
  const body = [
    `<section data-weave-txt-section="${index + 1}" data-weave-txt-root="true">`,
    `<h1 data-weave-txt-anchor="section-start">${escapeHtml(title)}</h1>`,
    ...paragraphs.map(
      (paragraph, paragraphIndex) =>
        `<p data-weave-txt-anchor="p-${paragraphIndex + 1}" data-weave-txt-paragraph="true">${renderParagraphHtml(paragraph)}</p>`
    ),
    "</section>",
  ].join("");

  return `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>${getPlainTextDocumentStyles()}</style></head><body data-weave-txt-document="true">${body}</body></html>`;
}

function splitParagraphs(text: string): PlainTextParagraph[] {
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.replace(/\s+$/g, ""))
        .filter((line) => line.trim().length > 0)
    )
    .filter((block) => block.length > 0);
  if (blocks.length === 0) {
    return [{ lines: [""] }];
  }
  if (blocks.length === 1) {
    return expandSingleBlockParagraphs(blocks[0]);
  }
  return blocks.map((lines) => ({ lines }));
}

function expandSingleBlockParagraphs(lines: string[]): PlainTextParagraph[] {
  const normalizedLines = lines.filter((line) => line.trim().length > 0);
  if (normalizedLines.length <= 1) {
    return normalizedLines.length > 0 ? [{ lines: normalizedLines }] : [{ lines: [""] }];
  }
  if (shouldSplitLineBasedParagraphs(normalizedLines)) {
    return normalizedLines.map((line) => ({ lines: [line] }));
  }
  return [{ lines: normalizedLines }];
}

function shouldSplitLineBasedParagraphs(lines: string[]): boolean {
  const averageLength =
    lines.reduce((sum, line) => sum + line.trim().length, 0) / Math.max(lines.length, 1);
  const indentedCount = lines.filter((line) => /^(?:\t| {2,}|\u3000)/.test(line)).length;
  const terminalCount = lines.slice(0, -1).filter((line) => /[。！？；.!?;…]$/.test(line.trim())).length;
  return (
    indentedCount >= Math.max(2, Math.ceil(lines.length / 3)) ||
    terminalCount >= Math.max(1, Math.ceil((lines.length - 1) * 0.7)) ||
    averageLength <= 36
  );
}

function renderParagraphHtml(paragraph: PlainTextParagraph): string {
  return paragraph.lines.map((line) => escapeHtml(line)).join("<br />");
}

function getPlainTextDocumentStyles(): string {
  return [
    'body[data-weave-txt-document="true"]{margin:0;}',
    'section[data-weave-txt-root="true"]{display:block;}',
    'section[data-weave-txt-root="true"]>h1{margin:0 0 1.2em;}',
    'p[data-weave-txt-paragraph="true"]{margin:0 0 0.95em;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;text-indent:2em;}',
    'p[data-weave-txt-paragraph="true"]:last-child{margin-bottom:0;}'
  ].join("");
}

function normalizePlainText(text: string): string {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}

function escapeHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cssEscape(text: string): string {
  const nativeEscape = (globalThis as { CSS?: { escape?: (value: string) => string } }).CSS?.escape;
  if (typeof nativeEscape === "function") {
    return nativeEscape(text);
  }
  return String(text || "").replace(/(["\\])/g, "\\$1");
}
