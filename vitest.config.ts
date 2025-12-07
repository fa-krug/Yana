import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".angular", "src/**/*.spec.ts"],
    setupFiles: ["./tests/setup.ts"],
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true, // Run tests sequentially to avoid database conflicts
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "src/**/*.spec.ts",
        "src/**/*.test.ts",
        "tests/",
        "**/*.config.*",
        "**/main.ts",
        "**/main.server.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@server": resolve(__dirname, "./src/server"),
      "@app": resolve(__dirname, "./src/app"),
    },
  },
});
