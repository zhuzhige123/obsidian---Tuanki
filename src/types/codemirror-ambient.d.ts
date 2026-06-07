declare module "@codemirror/highlight" {
  export const defaultHighlightStyle: { fallback: unknown };
}

declare module "@codemirror/lang-markdown" {
  export function markdown(...args: unknown[]): unknown;
}

declare module "@codemirror/commands" {
  export const history: unknown;
  export const historyKeymap: unknown;
  export const defaultKeymap: unknown;
}
