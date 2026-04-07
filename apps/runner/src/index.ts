import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { AgentHarborClient } from "@agentharbor/sdk";
import { type TelemetryEventEnvelope, telemetryEventTypes } from "@agentharbor/shared";
import { buildDemoRunnerLabels } from "./demo-labels.js";

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

type DemoScenarioName = "happy-path" | "failure-burst";
type DemoAgentType = "codex" | "claude-code" | "cursor" | "automation";
type FailureCategory = "build" | "test" | "network" | "auth" | "timeout" | "human-approval" | "unknown";

interface DemoRunnerContext {
  runnerId: string;
  runnerName: string;
  token: string;
  agentType: DemoAgentType;
  client: AgentHarborClient;
  activeSessionCount: number;
}

const configDirectory = path.join(os.homedir(), ".agentharbor");
const configPath = path.join(configDirectory, "runner.json");
const demoScenarioNames = ["happy-path", "failure-burst"] as const;
const demoAgentTypes = ["codex", "claude-code", "cursor", "automation"] as const;
const failureCategories = ["build", "test", "network", "auth", "timeout", "human-approval", "unknown"] as const;

const sleep = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

const sleepWithSignal = (durationMs: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const onDone = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onDone);
      resolve();
    };

    const timeout = setTimeout(onDone, durationMs);
    signal.addEventListener("abort", onDone, { once: true });
  });

const collectOptionValues = (value: string, previous: string[]) => [...previous, value.trim()].filter(Boolean);

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

const createClient = ({
  controlNodeUrl,
  allowSelfSigned,
  runnerToken,
}: {
  controlNodeUrl: string;
  allowSelfSigned: boolean;
  runnerToken?: string;
}) =>
  new AgentHarborClient({
    baseUrl: controlNodeUrl,
    allowSelfSigned,
    runnerToken,
  });

const getClientFromConfig = async () => {
  const config = await readConfig();
  return {
    config,
    client: createClient({
      controlNodeUrl: config.controlNodeUrl,
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

const ensurePositiveNumber = (value: string, optionName: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive number`);
  }

  return parsed;
};

const parseScenarioName = (value: string): DemoScenarioName => {
  if ((demoScenarioNames as readonly string[]).includes(value)) {
    return value as DemoScenarioName;
  }

  throw new Error(`Unsupported demo scenario: ${value}`);
};

const parseAgentTypeOption = (value: string): DemoAgentType | "mixed" => {
  if (value === "mixed") {
    return value;
  }

  if ((demoAgentTypes as readonly string[]).includes(value)) {
    return value as DemoAgentType;
  }

  throw new Error(`Unsupported agent type: ${value}`);
};

const resolveDemoAgentTypes = (agentTypeOption: DemoAgentType | "mixed", runnerCount: number): DemoAgentType[] => {
  if (agentTypeOption !== "mixed") {
    return Array.from({ length: runnerCount }, () => agentTypeOption);
  }

  return Array.from({ length: runnerCount }, (_, index) => demoAgentTypes[index % demoAgentTypes.length]);
};

const buildDemoRunnerName = (baseRunnerName: string, agentType: DemoAgentType, index: number) =>
  `${baseRunnerName}-${agentType}-${index + 1}`;

const buildSessionKey = (runnerName: string, scenario: DemoScenarioName, cycle: number) =>
  `${runnerName}-${scenario}-${cycle + 1}-${randomUUID().slice(0, 8)}`;

const failureCategoryFor = (cycle: number, runnerIndex: number): FailureCategory =>
  failureCategories[(cycle + runnerIndex) % failureCategories.length];

const failureSummaryFor = (category: FailureCategory) => {
  switch (category) {
    case "build":
      return "Encountered repeated build failures while applying the patch.";
    case "test":
      return "Unit tests kept failing after multiple implementation attempts.";
    case "network":
      return "Dependency fetches timed out while preparing the workspace.";
    case "auth":
      return "Authentication to a required service failed during execution.";
    case "timeout":
      return "The task exceeded the allowed execution window before the patch could finish.";
    case "human-approval":
      return "The runner is blocked waiting for a required human approval before proceeding.";
    default:
      return "The runner hit an unexpected failure mode and could not classify it more precisely.";
  }
};

const startHeartbeatLoop = async ({
  client,
  intervalMs,
  getActiveSessionCount,
  metadata,
}: {
  client: AgentHarborClient;
  intervalMs: number;
  getActiveSessionCount: () => number;
  metadata?: Record<string, string | number | boolean | null>;
}) => {
  const controller = new AbortController();
  let delayMs = intervalMs;

  const task = (async () => {
    while (!controller.signal.aborted) {
      try {
        await client.sendHeartbeat({
          timestamp: nowIso(),
          activeSessionCount: getActiveSessionCount(),
          metadata,
        });
        delayMs = intervalMs;
      } catch (error) {
        console.error(`Heartbeat loop error: ${error instanceof Error ? error.message : String(error)}`);
        delayMs = Math.min(delayMs * 2, 60_000);
      }

      await sleepWithSignal(delayMs, controller.signal);
    }
  })();

  return async () => {
    controller.abort();
    await task;
  };
};

const waitForShutdownSignal = (stop: () => Promise<void>) =>
  new Promise<void>((resolve, reject) => {
    let stopping = false;

    const shutdown = async () => {
      if (stopping) {
        return;
      }

      stopping = true;

      try {
        await stop();
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
  });

const enrollDemoRunner = async ({
  controlNodeUrl,
  allowSelfSigned,
  baseRunnerName,
  agentType,
  runnerIndex,
  scenario,
}: {
  controlNodeUrl: string;
  allowSelfSigned: boolean;
  baseRunnerName: string;
  agentType: DemoAgentType;
  runnerIndex: number;
  scenario: DemoScenarioName;
}) => {
  const bootstrapClient = createClient({ controlNodeUrl, allowSelfSigned });
  const machine = defaultMachine();
  const runnerName = buildDemoRunnerName(baseRunnerName, agentType, runnerIndex);
  const response = await bootstrapClient.enrollRunner({
    runnerName,
    labels: buildDemoRunnerLabels({
      platform: os.platform(),
      runnerIndex,
    }),
    environment: "demo",
    machine: {
      hostname: `${machine.hostname}-demo-${runnerIndex + 1}`,
      os: machine.os,
      architecture: machine.architecture,
    },
  });

  return {
    runnerId: response.runner.id,
    runnerName: response.runner.name,
    token: response.credentials.token,
    agentType,
    activeSessionCount: 0,
    client: createClient({
      controlNodeUrl,
      allowSelfSigned,
      runnerToken: response.credentials.token,
    }),
  } satisfies DemoRunnerContext;
};

const runHappyPathCycle = async (context: DemoRunnerContext, cycle: number, intervalMs: number, scenario: DemoScenarioName) => {
  const sessionKey = buildSessionKey(context.runnerName, scenario, cycle);
  const start = Date.now();

  context.activeSessionCount = 1;

  try {
    await context.client.startSession(
      buildEvent("agent.session.started", {
        agentType: context.agentType,
        sessionKey,
        summary: "Accepted a coding task and initialized workspace context.",
        category: "session",
        status: "running",
      }),
    );
    await sleep(intervalMs);

    await context.client.sendTelemetryEvent(
      buildEvent("agent.prompt.executed", {
        agentType: context.agentType,
        sessionKey,
        summary: "Generated a structured implementation plan after reading repo state.",
        category: "planning",
        tokenUsage: 620 + cycle * 45,
        filesTouchedCount: 2 + cycle,
        status: "in-progress",
      }),
    );
    await sleep(intervalMs);

    await context.client.sendTelemetryEvent(
      buildEvent("agent.summary.updated", {
        agentType: context.agentType,
        sessionKey,
        summary: "Control node filters, labels, and demo telemetry are wired together.",
        category: "implementation",
        tokenUsage: 1_250 + cycle * 60,
        filesTouchedCount: 8 + cycle,
        status: "in-progress",
      }),
    );
    await sleep(intervalMs);

    await context.client.completeSession(
      buildEvent("agent.session.completed", {
        agentType: context.agentType,
        sessionKey,
        summary: "Demo session completed successfully.",
        category: "session",
        durationMs: Date.now() - start,
        tokenUsage: 1_800 + cycle * 80,
        filesTouchedCount: 11 + cycle,
        status: "completed",
      }),
    );
  } finally {
    context.activeSessionCount = 0;
  }

  console.log(`[${context.runnerName}] Completed happy-path cycle ${cycle + 1}`);
};

const runFailureBurstCycle = async (
  context: DemoRunnerContext,
  cycle: number,
  intervalMs: number,
  scenario: DemoScenarioName,
  runnerIndex: number,
) => {
  const sessionKey = buildSessionKey(context.runnerName, scenario, cycle);
  const start = Date.now();
  const failureCategory = failureCategoryFor(cycle, runnerIndex);

  context.activeSessionCount = 1;

  try {
    await context.client.startSession(
      buildEvent("agent.session.started", {
        agentType: context.agentType,
        sessionKey,
        summary: "Accepted a coding task and initialized workspace context.",
        category: "session",
        status: "running",
      }),
    );
    await sleep(intervalMs);

    await context.client.sendTelemetryEvent(
      buildEvent("agent.prompt.executed", {
        agentType: context.agentType,
        sessionKey,
        summary: failureSummaryFor(failureCategory),
        category: failureCategory,
        tokenUsage: 980 + cycle * 30,
        filesTouchedCount: 4 + cycle,
        status: "blocked",
      }),
    );
    await sleep(intervalMs);

    await context.client.sendTelemetryEvent(
      buildEvent("agent.summary.updated", {
        agentType: context.agentType,
        sessionKey,
        summary: `Failure analysis: ${failureSummaryFor(failureCategory)}`,
        category: failureCategory,
        tokenUsage: 1_240 + cycle * 40,
        filesTouchedCount: 5 + cycle,
        status: "retrying",
      }),
    );
    await sleep(intervalMs);

    await context.client.sendTelemetryEvent(
      buildEvent("agent.session.failed", {
        agentType: context.agentType,
        sessionKey,
        summary: `Session failed because of repeated ${failureCategory} issues.`,
        category: failureCategory,
        durationMs: Date.now() - start,
        tokenUsage: 1_450 + cycle * 55,
        filesTouchedCount: 6 + cycle,
        status: "failed",
      }),
    );
  } finally {
    context.activeSessionCount = 0;
  }

  console.log(`[${context.runnerName}] Completed failure-burst cycle ${cycle + 1}`);
};

const runDemoScenario = async ({
  context,
  scenario,
  cycles,
  intervalMs,
  runnerIndex,
}: {
  context: DemoRunnerContext;
  scenario: DemoScenarioName;
  cycles: number;
  intervalMs: number;
  runnerIndex: number;
}) => {
  await sleep(runnerIndex * Math.max(150, Math.floor(intervalMs / 2)));

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    if (scenario === "failure-burst") {
      await runFailureBurstCycle(context, cycle, intervalMs, scenario, runnerIndex);
    } else {
      await runHappyPathCycle(context, cycle, intervalMs, scenario);
    }

    await sleep(intervalMs);
  }
};

const program = new Command();
program.name("agentharbor").description("Runner CLI for AgentHarbor").version("0.1.0");

program
  .command("enroll")
  .requiredOption("--url <url>", "Control node base URL")
  .option("--name <name>", "Runner name", os.hostname())
  .option("--hostname <hostname>", "Machine hostname", os.hostname())
  .option("--os <os>", "Machine OS", `${os.platform()} ${os.release()}`)
  .option("--arch <arch>", "Machine architecture", os.arch())
  .option("--label <label>", "Runner label (repeatable)", collectOptionValues, [] as string[])
  .option("--environment <environment>", "Runner environment")
  .option("--allow-self-signed", "Trust self-signed TLS certificates", false)
  .action(async (options) => {
    const client = createClient({
      controlNodeUrl: options.url,
      allowSelfSigned: options.allowSelfSigned,
    });

    const response = await client.enrollRunner({
      runnerName: options.name,
      labels: options.label,
      environment: options.environment,
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
  .command("heartbeat-loop")
  .option("--interval-ms <intervalMs>", "Delay between heartbeats", "10000")
  .action(async (options) => {
    const intervalMs = ensurePositiveNumber(options.intervalMs, "interval-ms");
    const { client, config } = await getClientFromConfig();
    const stop = await startHeartbeatLoop({
      client,
      intervalMs,
      getActiveSessionCount: () => 0,
      metadata: {
        hostname: defaultMachine().hostname,
        mode: "daemon",
        runnerId: config.runnerId,
      },
    });

    console.log(`Heartbeat loop started for ${config.runnerName}. Press Ctrl+C to stop.`);
    await waitForShutdownSignal(stop);
    console.log("Heartbeat loop stopped");
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
  .option("--scenario <scenario>", `Demo scenario (${demoScenarioNames.join(", ")})`, "happy-path")
  .option("--agent-type <agentType>", "Agent type to simulate or 'mixed'", "mixed")
  .option("--runners <runners>", "Number of demo runners", "1")
  .option("--cycles <cycles>", "Number of demo sessions per runner", "3")
  .option("--interval-ms <intervalMs>", "Delay between scenario events", "1500")
  .option("--heartbeat-interval-ms <heartbeatIntervalMs>", "Delay between automatic heartbeats", "10000")
  .action(async (options) => {
    const { config } = await getClientFromConfig();
    const scenario = parseScenarioName(options.scenario);
    const agentTypeOption = parseAgentTypeOption(options.agentType);
    const runnerCount = ensurePositiveNumber(options.runners, "runners");
    const cycles = ensurePositiveNumber(options.cycles, "cycles");
    const intervalMs = ensurePositiveNumber(options.intervalMs, "interval-ms");
    const heartbeatIntervalMs = ensurePositiveNumber(options.heartbeatIntervalMs, "heartbeat-interval-ms");
    const agentTypes = resolveDemoAgentTypes(agentTypeOption, runnerCount);

    const contexts = await Promise.all(
      agentTypes.map((agentType, runnerIndex) =>
        enrollDemoRunner({
          controlNodeUrl: config.controlNodeUrl,
          allowSelfSigned: config.allowSelfSigned,
          baseRunnerName: config.runnerName,
          agentType,
          runnerIndex,
          scenario,
        }),
      ),
    );

    const stopHeartbeatLoops = await Promise.all(
      contexts.map((context) =>
        startHeartbeatLoop({
          client: context.client,
          intervalMs: heartbeatIntervalMs,
          getActiveSessionCount: () => context.activeSessionCount,
          metadata: {
            mode: "demo",
            scenario,
            runnerId: context.runnerId,
            agentType: context.agentType,
          },
        }),
      ),
    );

    try {
      await Promise.all(
        contexts.map((context, runnerIndex) =>
          runDemoScenario({
            context,
            scenario,
            cycles,
            intervalMs,
            runnerIndex,
          }),
        ),
      );
    } finally {
      await Promise.all(stopHeartbeatLoops.map((stop) => stop()));
    }

    console.log(`Completed ${scenario} demo with ${runnerCount} runner(s) across ${cycles} cycle(s).`);
  });

program.command("show-config").action(async () => {
  const config = await readConfig();
  console.log(JSON.stringify(config, null, 2));
});

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
