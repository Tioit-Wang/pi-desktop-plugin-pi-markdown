import type { ExternalFile, ThemeMode, ThemeSource, TreeNode } from "./types";
import { setLocale, type UILocale } from "./lib/i18n";

/**
 * 面板 ↔ 插件进程桥接。
 * - 有 pluginBridge（PI-Desktop 面板）：权威数据在插件数据目录 settings.json，
 *   写回走宿主限定通道 skill.setEnabled → main.js onPanelInvoke("note.sync")。
 * - 无桥接（浏览器预览）：降级为 localStorage。
 *
 * 宿主接口适配：
 * - 语言：app.getLocale 通道 → 主进程 pi.app.getLocale()；并同步到 i18n。
 * - 主题：宿主经 --pi-plugin-panel-theme 注入面板窗口，preload 把它写到
 *   <pi-plugin-panel-titlebar data-theme="light|dark">；面板据此跟随宿主主题
 *   （用户面板内切换 → themeSource='manual' 持久化覆盖）。
 */

const LS_KEY = "pimd.tree.v1";
const LS_THEME_KEY = "pimd.theme.v1";

export interface InitialData {
  tree: TreeNode[];
  activeId: string | null;
  dataDir: string | null;
  theme: ThemeMode;
  themeSource: ThemeSource;
}

export function hasBridge(): boolean {
  return !!window.pluginBridge?.invoke;
}

function normalizeTheme(value: unknown): ThemeMode {
  return value === "dark" ? "dark" : "light";
}

function normalizeThemeSource(value: unknown): ThemeSource {
  return value === "manual" ? "manual" : "host";
}

/** 官方外观适配器（appearance-boot/appearance.js）挂载到的全局 */
type OfficialAppearance = {
  current: () => { base?: string | null; locale?: string; raw?: unknown };
  onThemeChange?: (fn: (base: string) => void) => void;
  onLocaleChange?: (fn: (locale: string) => void) => void;
  init?: (bridge?: unknown) => void;
  apply?: (entry: unknown) => void;
};

function officialAppearance(): OfficialAppearance | null {
  return (window as unknown as { __appearance?: OfficialAppearance }).__appearance ?? null;
}

/** 宿主主题：优先官方外观适配器（app.getAppearance/缓存），无则回退 preload 注入的标题栏 data-theme → 系统偏好 */
export function hostTheme(): ThemeMode {
  try {
    const app = officialAppearance();
    const base = app?.current()?.base;
    if (base === "light" || base === "dark") return base;
    // 官方适配器已把 data-theme 写到 <html>，直接读它（含 boot 预绘结果）
    const html = document.documentElement.getAttribute("data-theme");
    if (html === "light" || html === "dark") return html;
  } catch {
    /* 回退 */
  }
  try {
    const el = document.querySelector("pi-plugin-panel-titlebar");
    const value = el?.getAttribute("data-theme");
    if (value === "light" || value === "dark") return value;
  } catch {
    /* 宿主 DOM 不可用时回退 */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * 等待宿主主题就绪：官方外观适配器在 DOMContentLoaded 后通过 app.getAppearance
 * 拉取并写入 data-theme；页面脚本先于它执行，需要的话等它就绪后再读一次。
 */
export function waitForHostTheme(): Promise<ThemeMode> {
  const base = hostTheme();
  // 已能确定（官方适配器已设主题，或浏览器预览/无宿主）
  if (document.documentElement.getAttribute("data-theme") || document.readyState === "complete") {
    return Promise.resolve(base);
  }
  return new Promise((resolve) => {
    const finish = () => resolve(hostTheme());
    window.addEventListener("DOMContentLoaded", finish, { once: true });
    // 兜底：浏览器预览等无宿主环境直接回退
    window.setTimeout(finish, 2000);
  });
}

/** 从宿主拉取界面语言：优先官方外观适配器（app.getAppearance），无则回退 app.getLocale 通道 */
export async function fetchLocale(): Promise<UILocale | null> {
  try {
    const app = officialAppearance();
    const locale = app?.current()?.locale;
    if (locale) {
      setLocale(locale);
      return locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
    }
  } catch {
    /* 回退到 app.getLocale */
  }
  if (!hasBridge()) return null;
  try {
    const res = (await window.pluginBridge!.invoke("app.getLocale")) as
      | { ok?: boolean; locale?: string }
      | null;
    const locale = res?.locale;
    if (locale) {
      setLocale(locale);
      return locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
    }
  } catch {
    /* 宿主无此通道时保持 navigator.language */
  }
  return null;
}

export async function loadInitial(): Promise<InitialData> {
  if (hasBridge()) {
    try {
      const settings = (await window.pluginBridge!.invoke(
        "plugin.getSettings",
      )) as {
        tree?: TreeNode[];
        activeNoteId?: string;
        theme?: string;
        themeSource?: string;
      } | null;
      if (settings && Array.isArray(settings.tree)) {
        const themeSource = normalizeThemeSource(settings.themeSource);
        return {
          tree: settings.tree,
          activeId: settings.activeNoteId ?? null,
          dataDir: null,
          // 跟随宿主主题时以宿主当前主题为准；手动覆盖时用持久化的值
          theme:
            themeSource === "manual"
              ? normalizeTheme(settings.theme)
              : await waitForHostTheme(),
          themeSource,
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
        theme?: string;
        themeSource?: string;
      };
      if (parsed && Array.isArray(parsed.tree)) {
        const themeSource = normalizeThemeSource(parsed.themeSource);
        return {
          tree: parsed.tree,
          activeId: parsed.activeId ?? null,
          dataDir: null,
          theme:
            themeSource === "manual"
              ? normalizeTheme(parsed.theme)
              : await waitForHostTheme(),
          themeSource,
        };
      }
    }
  } catch {
    /* 忽略损坏的缓存 */
  }
  return {
    tree: [],
    activeId: null,
    dataDir: null,
    theme: await waitForHostTheme(),
    themeSource: "host",
  };
}

export function persistToHost(
  tree: TreeNode[],
  activeId: string | null,
  theme: ThemeMode,
  themeSource: ThemeSource,
): Promise<unknown> {
  if (hasBridge()) {
    return window
      .pluginBridge!.invoke("skill.setEnabled", {
        id: "note.sync",
        enabled: true,
        tree,
        activeId,
        theme,
        themeSource,
      })
      .catch((err: unknown) => {
        throw new Error(
          `${String((err as Error)?.message ?? err)}`,
        );
      });
  }
  localStorage.setItem(
    LS_KEY,
    JSON.stringify({ tree, activeId, theme, themeSource, savedAt: Date.now() }),
  );
  localStorage.setItem(LS_THEME_KEY, theme);
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

/* ---------- 外部文件会话（Agent 工具 open_file 驱动，单文件模式） ---------- */

/**
 * 轮询拉取待打开的外部文件。有则返回文件（并同时作为会话心跳），
 * 无则返回 null。浏览器预览下不参与会话，恒返回 null。
 */
export async function pullExternalFile(): Promise<ExternalFile | null> {
  if (!hasBridge()) return null;
  try {
    const res = (await window.pluginBridge!.invoke("skill.setEnabled", {
      id: "file.pull",
      enabled: true,
    })) as
      | { ok?: boolean; file?: { path?: string; name?: string; content?: string } }
      | null;
    if (
      res?.file &&
      typeof res.file.path === "string" &&
      typeof res.file.content === "string"
    ) {
      return {
        path: res.file.path,
        name: res.file.name ?? res.file.path,
        content: res.file.content,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** 外部文件内容写回磁盘（主进程校验路径一致并落盘） */
export async function saveExternalFile(
  path: string,
  content: string,
): Promise<{ bytes: number; at: number }> {
  if (!hasBridge()) {
    // 浏览器预览：无主进程，视为保存成功（数据在内存）
    return { bytes: content.length, at: Date.now() };
  }
  const res = (await window.pluginBridge!.invoke("skill.setEnabled", {
    id: "file.save",
    enabled: true,
    path,
    content,
  })) as { ok?: boolean; bytes?: number; at?: number };
  return { bytes: res?.bytes ?? content.length, at: res?.at ?? Date.now() };
}

/** 退出外部文件会话，回到笔记模式 */
export async function exitExternalFile(): Promise<void> {
  if (!hasBridge()) return;
  try {
    await window.pluginBridge!.invoke("skill.setEnabled", {
      id: "file.exit",
      enabled: true,
    });
  } catch {
    /* 退出失败不阻塞 UI */
  }
}
