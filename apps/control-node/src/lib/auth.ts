import crypto from "node:crypto";
import { env } from "../env.js";
import { prisma } from "./prisma.js";

const TOKEN_PREFIX = "ah_";

export const hashToken = (token: string): string => crypto.createHash("sha256").update(token).digest("hex");

export const issueRunnerToken = (ttlDays: number) => {
  const token = `${TOKEN_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
  const expiresAt = ttlDays > 0 ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000) : null;

  return {
    token,
    tokenHash: hashToken(token),
    expiresAt,
  };
};

export const getBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
};

const tokensMatch = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const authenticateAdminRequest = (authorizationHeader: string | undefined) => {
  if (!env.adminToken) {
    return "unconfigured" as const;
  }

  const token = getBearerToken(authorizationHeader);
  if (!token) {
    return "unauthorized" as const;
  }

  return tokensMatch(token, env.adminToken) ? ("ok" as const) : ("unauthorized" as const);
};

export const authenticateRunner = async (authorizationHeader: string | undefined) => {
  const token = getBearerToken(authorizationHeader);
  if (!token) {
    return null;
  }

  const now = new Date();
  const tokenHash = hashToken(token);
  const record = await prisma.runnerToken.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: {
      runner: {
        include: {
          machine: true,
        },
      },
    },
  });

  if (!record) {
    return null;
  }

  await prisma.runnerToken.update({
    where: { id: record.id },
    data: { lastUsedAt: now },
  });

  return record.runner;
};
