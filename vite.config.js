import { defineConfig } from "vite";

export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
      },
    },
  },
  test: {
    environment: "jsdom",
  },
  build: {
    lib: {
      entry: {
        notify: "./index.js",
        styles: "./src/scss/notify.scss",
      },
      name: "notify",
      fileName: "notify",
      formats: ["es"],
    },
    outDir: "dist",
    emptyOutDir: true,
    minify: "esbuild",
    sourcemap: true,
  },
});
