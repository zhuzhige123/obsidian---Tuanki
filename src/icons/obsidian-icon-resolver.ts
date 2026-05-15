const ICON_ALIAS_MAP: Record<string, string> = {
  add: "plus",
  close: "x",
  times: "x",
  "x-circle": "x-circle",
  refresh: "refresh-cw",
  robot: "cpu",
  sync: "refresh-cw",
  edit: "pencil",
  delete: "trash-2",
  trash: "trash-2",
  "trash-2": "trash-2",
  settings: "settings",
  cog: "settings",
  help: "circle-help",
  "help-circle": "circle-help",
  "question-circle": "circle-help",
  "info-circle": "info",
  alert: "triangle-alert",
  warning: "triangle-alert",
  "alert-circle": "circle-alert",
  "alert-triangle": "triangle-alert",
  check: "check",
  "check-circle": "check-circle",
  "check-square": "check-square",
  eye: "eye",
  "eye-off": "eye-off",
  search: "search",
  filter: "filter",
  sliders: "sliders-horizontal",
  "more-horizontal": "ellipsis",
  "ellipsis-h": "ellipsis",
  "arrow-left": "arrow-left",
  "arrow-right": "arrow-right",
  "arrow-up": "arrow-up",
  "arrow-down": "arrow-down",
  "chevrons-up": "chevrons-up",
  "chevrons-down": "chevrons-down",
  "chevron-left": "chevron-left",
  "chevron-right": "chevron-right",
  "chevron-up": "chevron-up",
  "chevron-down": "chevron-down",
  "layout-template": "layout-grid",
  "th-large": "layout-grid",
  grid: "layout-grid",
  "th-list": "list",
  table: "table",
  "bar-chart": "bar-chart-3",
  "bar-chart-2": "bar-chart-3",
  "chart-bar": "bar-chart-3",
  "chart-line": "chart-line",
  trendingUp: "trending-up",
  "trending-up": "trending-up",
  "trending-down": "trending-down",
  split: "git-branch",
  "external-link": "external-link",
  "book-open": "book-open",
  book: "book-open",
  "graduation-cap": "graduation-cap",
  markdown: "file-text",
  "markdown-toolbar": "file-text",
  "file-text": "file-text",
  "id-card": "badge",
  "id-card-alt": "badge",
  "layer-group": "layers",
  "list-alt": "list",
  "clipboard-list": "clipboard-list",
  "upload-cloud": "upload",
  cpu: "cpu",
  tool: "wrench",
  "sidebar-open": "panel-left-open",
  "sidebar-close": "panel-left-close",
  "panel-left-open": "panel-left-open",
  "panel-left-close": "panel-left-close",
  "panel-left": "panel-left",
  "panel-right": "panel-right",
};

const KNOWN_OBSIDIAN_ICON_NAMES = new Set(Object.values(ICON_ALIAS_MAP));

export function resolveObsidianIconName(name: string): string {
  const normalized = (name || "").trim();
  if (!normalized) {
    return "circle-help";
  }
  return ICON_ALIAS_MAP[normalized] || normalized;
}

export function isKnownIconAlias(name: string): boolean {
  const normalized = (name || "").trim();
  if (!normalized) {
    return false;
  }
  return Boolean(ICON_ALIAS_MAP[normalized]);
}

export function isKnownObsidianIconName(name: string): boolean {
  const normalized = (name || "").trim();
  if (!normalized) {
    return false;
  }
  return KNOWN_OBSIDIAN_ICON_NAMES.has(normalized);
}
