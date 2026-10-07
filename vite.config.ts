import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
    // portraits ship as their own lazily-loaded files, not base64 inside the boot bundle
    assetsInlineLimit: 4096,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
