/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 全部颜色经 CSS 变量注入（index.css 按 data-theme 切换米白/黑夜两套取值）
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        panel2: "rgb(var(--c-panel2) / <alpha-value>)",
        edge: "rgb(var(--c-edge) / <alpha-value>)",
        edge2: "rgb(var(--c-edge2) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        accent2: "rgb(var(--c-accent2) / <alpha-value>)",
        onaccent: "rgb(var(--c-onaccent) / <alpha-value>)",
        sel: "rgb(var(--c-sel) / <alpha-value>)",
        onsel: "rgb(var(--c-onsel) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        faint: "rgb(var(--c-faint) / <alpha-value>)",
        danger: "rgb(var(--c-danger) / <alpha-value>)",
        ok: "rgb(var(--c-ok) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
