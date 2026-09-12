import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  worker: { format: "es" },
  server: { port: 5173, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        simulate: resolve(root, "simulate.html"),
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
