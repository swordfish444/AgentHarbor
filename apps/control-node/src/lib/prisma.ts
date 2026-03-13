import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __agentharborPrisma__: PrismaClient | undefined;
}

export const prisma = globalThis.__agentharborPrisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__agentharborPrisma__ = prisma;
}
