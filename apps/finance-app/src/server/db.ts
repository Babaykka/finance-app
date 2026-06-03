import { PrismaClient, type Prisma } from "@prisma/client";

const isProduction = process.env.NODE_ENV === "production";
const prismaLogLevels: Prisma.LogLevel[] = isProduction ? ["error"] : ["query", "error", "warn"];

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const createPrismaClient = () =>
  new PrismaClient({
    log: prismaLogLevels
  });

export const prisma = isProduction
  ? createPrismaClient()
  : (globalForPrisma.prisma ?? createPrismaClient());

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
