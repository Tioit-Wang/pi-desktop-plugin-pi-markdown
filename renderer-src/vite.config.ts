import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    // 构建产物直接落到插件加载的 renderer/ 目录
    outDir: "../renderer",
    emptyOutDir: true,
    // 字体等小资源内联为 data URL：导出的 HTML 自包含、离线可用
    assetsInlineLimit: 10 * 1024 * 1024,
    chunkSizeWarningLimit: 4000,
  },
});
