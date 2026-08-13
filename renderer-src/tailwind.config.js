/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 黑白灰中性色打底（直角扁平风）
        bg: "#161616",
        panel: "#1e1e1e",
        panel2: "#262626",
        edge: "#383838",
        edge2: "#4a4a4a",
        accent: "#f5f5f5",
        accent2: "#ffffff",
        ink: "#f2f2f2",
        muted: "#a6a6a6",
        faint: "#737373",
        danger: "#e5484d",
        ok: "#30a46c",
      },
    },
  },
  plugins: [],
};
