import { defineConfig } from "vite";

export default defineConfig({
  server: {
    watch: {
      ignored: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.angular/**",
        "**/*.sqlite3",
        "**/*.sqlite3-shm",
        "**/*.sqlite3-wal",
        "**/*.db",
        "**/*.db-shm",
        "**/*.db-wal",
        "**/db.sqlite3*",
        "**/test.db*",
        "**/*.log",
        "**/.cache/**",
        "**/coverage/**",
        "**/.vitest/**",
        "**/test-results/**",
        "**/playwright-report/**",
        "**/playwright/.cache/**",
      ],
    },
  },
});
