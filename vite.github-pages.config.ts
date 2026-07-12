import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "github-pages",
  base: "/ccer-market-observatory/",
  publicDir: "../public",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_STATIC_GITHUB": JSON.stringify("true"),
  },
  build: {
    outDir: "../github-pages-dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
