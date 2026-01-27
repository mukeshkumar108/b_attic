import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const nodeEnv = process.env.NODE_ENV;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: nodeEnv === "development" ? ["warn", "error"] : ["error"],
  });

if (nodeEnv !== "production") globalForPrisma.prisma = prisma;
