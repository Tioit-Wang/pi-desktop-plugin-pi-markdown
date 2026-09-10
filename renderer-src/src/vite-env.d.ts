/// <reference types="vite/client" />

interface PluginBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>;
  /**
   * 同步通道（宿主 preload 走 ipcRenderer.sendSync）：调用立即返回、真正的处理
   * 在插件进程中异步进行。仅用于「面板即将销毁、来不及 await」的收尾场景。
   */
  send?(channel: string, payload?: unknown): unknown;
  on(event: string, handler: (...args: unknown[]) => void): () => void;
  getDroppedFilePath?(file: File): string | null;
}

interface Window {
  pluginBridge?: PluginBridge;
}
