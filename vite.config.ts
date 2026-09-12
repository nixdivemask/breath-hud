import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  worker: { format: "es" },
  server: { port: 5173, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
