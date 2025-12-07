import type { Config } from "drizzle-kit";

export default {
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  driver: "better-sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL || "./db.sqlite3",
  },
} satisfies Config;
