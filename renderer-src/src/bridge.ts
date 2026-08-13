import type { TreeNode } from "./types";

/**
 * 面板 ↔ 插件进程桥接。
 * - 有 pluginBridge（PI-Desktop 面板）：权威数据在插件数据目录 settings.json，
 *   写回走宿主限定通道 skill.setEnabled → main.js onPanelInvoke("note.sync")。
 * - 无桥接（浏览器预览）：降级为 localStorage。
 */

const LS_KEY = "pimd.tree.v1";

export interface InitialData {
  tree: TreeNode[];
  activeId: string | null;
  dataDir: string | null;
}

export function hasBridge(): boolean {
  return !!window.pluginBridge?.invoke;
}

export async function loadInitial(): Promise<InitialData> {
  if (hasBridge()) {
    try {
      const settings = (await window.pluginBridge!.invoke(
        "plugin.getSettings",
      )) as { tree?: TreeNode[]; activeNoteId?: string } | null;
      if (settings && Array.isArray(settings.tree)) {
        return {
          tree: settings.tree,
          activeId: settings.activeNoteId ?? null,
          dataDir: null,
        };
      }
    } catch (err) {
      console.warn("[pi-markdown] getSettings failed", err);
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        tree?: TreeNode[];
        activeId?: string | null;
      };
      if (parsed && Array.isArray(parsed.tree)) {
        return {
          tree: parsed.tree,
          activeId: parsed.activeId ?? null,
          dataDir: null,
        };
      }
    }
  } catch {
    /* 忽略损坏的缓存 */
  }
  return { tree: [], activeId: null, dataDir: null };
}

export function persistToHost(
  tree: TreeNode[],
  activeId: string | null,
): Promise<unknown> {
  if (hasBridge()) {
    return window
      .pluginBridge!.invoke("skill.setEnabled", {
        id: "note.sync",
        enabled: true,
        tree,
        activeId,
      })
      .catch((err: unknown) => {
        throw new Error(`保存失败: ${(err as Error)?.message ?? String(err)}`);
      });
  }
  localStorage.setItem(
    LS_KEY,
    JSON.stringify({ tree, activeId, savedAt: Date.now() }),
  );
  return Promise.resolve();
}

/** 查询插件数据目录（仅面板模式；浏览器预览返回 null） */
export async function fetchDataDir(): Promise<string | null> {
  if (!hasBridge()) return null;
  try {
    const res = (await window.pluginBridge!.invoke("skill.setEnabled", {
      id: "store.path",
      enabled: true,
    })) as { path?: string } | null;
    return res?.path ?? null;
  } catch {
    return null;
  }
}
