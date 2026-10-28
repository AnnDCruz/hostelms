import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations and `db push` use the DIRECT connection, never the pooler.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
});
