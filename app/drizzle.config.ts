import { defineConfig } from "drizzle-kit";

// `npm run db:generate` writes SQL migrations for app/db/schema.ts into ./drizzle;
// wrangler applies them (`npm run db:migrate` locally, `npm run db:migrate:remote` in production).
export default defineConfig({
  dialect: "sqlite",
  schema: "./app/db/schema.ts",
  out: "./drizzle",
});
