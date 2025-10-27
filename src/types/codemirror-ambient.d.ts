declare module "@codemirror/highlight" {
  export const defaultHighlightStyle: { fallback: any };
}

declare module "@codemirror/lang-markdown" {
  export function markdown(...args: any[]): any;
}

declare module "@codemirror/commands" {
  export const history: any;
  export const historyKeymap: any;
  export const defaultKeymap: any;
}
