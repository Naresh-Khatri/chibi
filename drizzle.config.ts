import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// generate needs only schema; migrate/push/studio connect via DATABASE_URL
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? "postgres://chibi:chibi@localhost:5487/chibi",
  },
});
