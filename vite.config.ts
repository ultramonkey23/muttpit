import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
    assetsInlineLimit: 262144,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
