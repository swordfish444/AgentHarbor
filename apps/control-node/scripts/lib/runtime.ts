import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureTrailingSlashlessUrl, parseBoolean } from "@agentharbor/config";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../../../..");

const parseEnvLine = (line: string) => {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

  if (!match) {
    return null;
  }

  const [, key, rawValue] = match;
  const trimmedValue = rawValue.trim();
  const quotedValue =
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"));

  return {
    key,
    value: quotedValue ? trimmedValue.slice(1, -1) : trimmedValue,
  };
};

export const loadLocalEnv = () => {
  const envPath = path.join(repoRoot, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const file = fs.readFileSync(envPath, "utf8");

  for (const rawLine of file.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const parsed = parseEnvLine(line);

    if (!parsed || process.env[parsed.key] !== undefined) {
      continue;
    }

    process.env[parsed.key] = parsed.value;
  }
};

export interface DemoScriptConfig {
  repoRoot: string;
  controlNodeBaseUrl: string;
  allowSelfSigned: boolean;
  dashboardBaseUrl: string;
}

export const resolveDemoScriptConfig = (): DemoScriptConfig => {
  loadLocalEnv();

  const controlNodeBaseUrl = ensureTrailingSlashlessUrl(process.env.AGENTHARBOR_CONTROL_NODE_URL ?? "https://localhost:8443");
  const allowSelfSigned = parseBoolean(process.env.AGENTHARBOR_ALLOW_SELF_SIGNED, true);
  const dashboardBaseUrl = ensureTrailingSlashlessUrl(
    process.env.AGENTHARBOR_DASHBOARD_URL ?? `http://localhost:${process.env.DASHBOARD_PORT ?? "3003"}`,
  );

  return {
    repoRoot,
    controlNodeBaseUrl,
    allowSelfSigned,
    dashboardBaseUrl,
  };
};

export const buildDemoUrls = (dashboardBaseUrl: string, demoStartMs: number) => ({
  liveDashboardUrl: `${dashboardBaseUrl}/`,
  demoDashboardUrl: `${dashboardBaseUrl}/?demo=1&demoStart=${demoStartMs}`,
  wallboardUrl: `${dashboardBaseUrl}/wallboard?demo=1&demoStart=${demoStartMs}`,
});
