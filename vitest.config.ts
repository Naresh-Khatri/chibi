import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "packages/runtime/src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@/runtime": path.resolve(__dirname, "packages/runtime/src"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
