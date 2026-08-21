import { createRoot } from "react-dom/client";
import "./index.css";
import "@milkdown/crepe/theme/common/style.css";
// 注意：不再引入 nord-dark.css —— 它会把 .milkdown 变量固定为深色，
// 覆盖 index.css 中按 data-theme 切换的米白/黑夜变量（米白主题下编辑器配色会错乱）。
import "prismjs/themes/prism-tomorrow.css";
import "katex/dist/katex.min.css";
import App from "./App";
import { setLocale } from "./lib/i18n";

// 渲染前先按系统语言设定 <html lang>；宿主语言随后经桥接通道精确覆盖
setLocale(navigator.language);

createRoot(document.getElementById("root")!).render(<App />);
