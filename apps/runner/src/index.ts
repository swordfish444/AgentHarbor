import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { parseBoolean } from "@agentharbor/config";
import { AgentHarborClient } from "@agentharbor/sdk";
import { TelemetryEventEnvelope, telemetryEventTypes } from "@agentharbor/shared";

interface RunnerConfig {
  controlNodeUrl: string;
  allowSelfSigned: boolean;
  runnerId: string;
  runnerName: string;
  token: string;
  machine: {
    hostname: string;
    os: string;
    architecture: string;
  };
}

const configDirectory = path.join(os.homedir(), ".agentharbor");
const configPath = path.join(configDirectory, "runner.json");

const sleep = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

const readConfig = async (): Promise<RunnerConfig> => {
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw) as RunnerConfig;
};

const writeConfig = async (config: RunnerConfig) => {
  await fs.mkdir(configDirectory, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
};

const defaultMachine = () => ({
  hostname: os.hostname(),
  os: `${os.platform()} ${os.release()}`,
  architecture: os.arch(),
});

const getClientFromConfig = async () => {
  const config = await readConfig();
  return {
    config,
    client: new AgentHarborClient({
      baseUrl: config.controlNodeUrl,
      allowSelfSigned: config.allowSelfSigned,
      runnerToken: config.token,
    }),
  };
};

const nowIso = () => new Date().toISOString();

const buildEvent = (
  eventType: TelemetryEventEnvelope["eventType"],
  overrides: Partial<TelemetryEventEnvelope["payload"]>,
): TelemetryEventEnvelope => ({
  eventType,
  payload: {
    timestamp: nowIso(),
    agentType: overrides.agentType ?? "custom",
    ...overrides,
  },
});

const program = new Command();
program.name("agentharbor").description("Runner CLI for AgentHarbor").version("0.1.0");

program
  .command("enroll")
  .requiredOption("--url <url>", "Control node base URL")
  .option("--name <name>", "Runner name", os.hostname())
  .option("--hostname <hostname>", "Machine hostname", os.hostname())
  .option("--os <os>", "Machine OS", `${os.platform()} ${os.release()}`)
  .option("--arch <arch>", "Machine architecture", os.arch())
  .option("--allow-self-signed", "Trust self-signed TLS certificates", false)
  .action(async (options) => {
    const client = new AgentHarborClient({
      baseUrl: options.url,
      allowSelfSigned: options.allowSelfSigned,
    });

    const response = await client.enrollRunner({
      runnerName: options.name,
      machine: {
        hostname: options.hostname,
        os: options.os,
        architecture: options.arch,
      },
    });

    const config: RunnerConfig = {
      controlNodeUrl: options.url,
      allowSelfSigned: options.allowSelfSigned,
      runnerId: response.runner.id,
      runnerName: response.runner.name,
      token: response.credentials.token,
      machine: {
        hostname: options.hostname,
        os: options.os,
        architecture: options.arch,
      },
    };

    await writeConfig(config);

    console.log(`Enrolled runner ${response.runner.name} (${response.runner.id})`);
    console.log(`Saved credentials to ${configPath}`);
  });

program.command("heartbeat").action(async () => {
  const { client } = await getClientFromConfig();
  await client.sendHeartbeat({
    timestamp: nowIso(),
    activeSessionCount: 0,
    metadata: {
      hostname: defaultMachine().hostname,
    },
  });
  console.log("Heartbeat sent");
});

program
  .command("send-event")
  .argument("<eventType>", `One of: ${telemetryEventTypes.join(", ")}`)
  .option("--agent-type <agentType>", "Agent type", "custom")
  .option("--session-key <sessionKey>", "Session key")
  .option("--summary <summary>", "Summary")
  .option("--category <category>", "Category")
  .option("--status <status>", "Status")
  .option("--duration-ms <durationMs>", "Duration in milliseconds")
  .option("--token-usage <tokenUsage>", "Token usage")
  .option("--files-touched-count <filesTouchedCount>", "Files touched count")
  .action(async (eventType, options) => {
    if (!telemetryEventTypes.includes(eventType)) {
      throw new Error(`Unsupported eventType: ${eventType}`);
    }

    const { client } = await getClientFromConfig();
    await client.sendTelemetryEvent(
      buildEvent(eventType, {
        agentType: options.agentType,
        sessionKey: options.sessionKey,
        summary: options.summary,
        category: options.category,
        status: options.status,
        durationMs: options.durationMs ? Number(options.durationMs) : undefined,
        tokenUsage: options.tokenUsage ? Number(options.tokenUsage) : undefined,
        filesTouchedCount: options.filesTouchedCount ? Number(options.filesTouchedCount) : undefined,
      }),
    );

    console.log(`Sent ${eventType}`);
  });

program
  .command("demo")
  .option("--agent-type <agentType>", "Agent type to simulate", "codex")
  .option("--cycles <cycles>", "Number of demo sessions", "3")
  .option("--interval-ms <intervalMs>", "Delay between events", "1500")
  .action(async (options) => {
    const { client, config } = await getClientFromConfig();
    const cycles = Number(options.cycles);
    const intervalMs = Number(options.intervalMs);

    for (let index = 0; index < cycles; index += 1) {
      const sessionKey = `${config.runnerName}-${options.agentType}-${randomUUID().slice(0, 8)}`;
      const start = Date.now();

      await client.sendHeartbeat({
        timestamp: nowIso(),
        activeSessionCount: 1,
        metadata: {
          mode: "demo",
          runnerId: config.runnerId,
        },
      });

      await client.startSession(
        buildEvent("agent.session.started", {
          agentType: options.agentType,
          sessionKey,
          summary: "Accepted a coding task and initialized workspace context.",
          category: "session",
          status: "running",
        }),
      );
      await sleep(intervalMs);

      await client.sendTelemetryEvent(
        buildEvent("agent.prompt.executed", {
          agentType: options.agentType,
          sessionKey,
          summary: "Generated a structured implementation plan after reading repo state.",
          category: "planning",
          tokenUsage: 620,
          filesTouchedCount: 2,
          status: "in-progress",
        }),
      );
      await sleep(intervalMs);

      await client.sendTelemetryEvent(
        buildEvent("agent.summary.updated", {
          agentType: options.agentType,
          sessionKey,
          summary: "Control node API, dashboard metrics, and runner telemetry all wired together.",
          category: "implementation",
          tokenUsage: 1250,
          filesTouchedCount: 8,
          status: "in-progress",
        }),
      );
      await sleep(intervalMs);

      await client.completeSession(
        buildEvent("agent.session.completed", {
          agentType: options.agentType,
          sessionKey,
          summary: "Demo session completed successfully.",
          category: "session",
          durationMs: Date.now() - start,
          tokenUsage: 1800,
          filesTouchedCount: 11,
          status: "completed",
        }),
      );

      console.log(`Completed demo cycle ${index + 1}/${cycles} for ${sessionKey}`);
      await sleep(intervalMs);
    }
  });

program.command("show-config").action(async () => {
  const config = await readConfig();
  console.log(JSON.stringify(config, null, 2));
});

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
