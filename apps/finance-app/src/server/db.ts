import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, type Prisma } from "@prisma/client";

const isProduction = process.env.NODE_ENV === "production";
const prismaLogLevels: Prisma.LogLevel[] = isProduction ? ["error"] : ["query", "error", "warn"];

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const createPrismaClient = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Prisma");
  }

  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
    log: prismaLogLevels
  });
};

export const prisma = isProduction
  ? createPrismaClient()
  : (globalForPrisma.prisma ?? createPrismaClient());

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
