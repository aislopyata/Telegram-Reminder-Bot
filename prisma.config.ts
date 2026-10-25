import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Deliberately not using env(): `prisma generate` must work during
    // `next build` even when DATABASE_URL is not available.
    url: process.env.DATABASE_URL ?? "",
  },
});
