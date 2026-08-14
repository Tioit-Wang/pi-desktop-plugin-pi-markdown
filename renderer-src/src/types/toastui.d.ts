/**
 * @toast-ui/editor 与 @toast-ui/editor-plugin-code-syntax-highlight 的
 * package.json exports / 自带类型在 bundler 解析下存在冲突（tsc 无法解析
 * 或版本不匹配），这里提供本项目使用到的最小声明，运行时由 vite 解析真实模块。
 */
declare module "@toast-ui/editor" {
  export type PreviewStyle = "tab" | "vertical";
  export type EditorType = "markdown" | "wysiwyg";
  export type ToolbarItemName =
    | "heading"
    | "bold"
    | "italic"
    | "strike"
    | "hr"
    | "quote"
    | "ul"
    | "ol"
    | "task"
    | "indent"
    | "outdent"
    | "table"
    | "image"
    | "link"
    | "code"
    | "codeblock"
    | "more";

  export interface EditorOptions {
    el: HTMLElement;
    height?: string;
    initialEditType?: EditorType;
    previewStyle?: PreviewStyle;
    language?: string;
    hideModeSwitch?: boolean;
    autofocus?: boolean;
    plugins?: unknown[];
    toolbarItems?: (ToolbarItemName[] | ToolbarItemName)[];
    addImageBlobHook?: (
      blob: File | Blob,
      callback: (url: string, text?: string) => void,
    ) => void;
  }

  export default class Editor {
    constructor(options: EditorOptions);
    setMarkdown(markdown: string, cursorToEnd?: boolean): void;
    getMarkdown(): string;
    getHTML(): string;
    getCurrentMode(): EditorType;
    changeMode(mode: EditorType, destroy?: boolean): void;
    changePreviewStyle(style: PreviewStyle): void;
    getEditorElements(): {
      mdEditor?: HTMLElement;
      mdPreview?: HTMLElement;
      wwEditor?: HTMLElement;
    };
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler?: (...args: unknown[]) => void): void;
    exec(commandName: string, payload?: unknown): void;
    destroy(): void;
  }
}

declare module "@toast-ui/editor-plugin-code-syntax-highlight" {
  const plugin: unknown;
  export default plugin;
}
