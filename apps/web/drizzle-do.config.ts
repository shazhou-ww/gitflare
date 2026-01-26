import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/do/schema/git.ts",
  out: "./drizzle-do",
  dialect: "sqlite",
  driver: "durable-sqlite",
});
