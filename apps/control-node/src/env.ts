import { parseBoolean, parseNumber } from "@agentharbor/config";

export const env = {
  host: process.env.CONTROL_NODE_HOST ?? "0.0.0.0",
  port: parseNumber(process.env.CONTROL_NODE_PORT, 8443),
  databaseUrl: process.env.DATABASE_URL ?? "",
  tlsEnabled: parseBoolean(process.env.CONTROL_NODE_TLS_ENABLED, true),
  tlsAllowSelfSigned: parseBoolean(process.env.CONTROL_NODE_TLS_ALLOW_SELF_SIGNED, true),
  tlsCertPath: process.env.CONTROL_NODE_TLS_CERT_PATH,
  tlsKeyPath: process.env.CONTROL_NODE_TLS_KEY_PATH,
  tokenTtlDays: parseNumber(process.env.CONTROL_NODE_TOKEN_TTL_DAYS, 30),
  adminToken: process.env.CONTROL_NODE_ADMIN_TOKEN?.trim() || null,
  runnerOnlineWindowMs: 45_000,
};
