import { createRoot } from "react-dom/client";
import "./index.css";
import "@toast-ui/editor/dist/toastui-editor.css";
import "@toast-ui/editor/dist/theme/toastui-editor-dark.css";
import "@toast-ui/editor/dist/i18n/zh-cn";
import "@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight.css";
import "prismjs/themes/prism-tomorrow.css";
import "katex/dist/katex.min.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
