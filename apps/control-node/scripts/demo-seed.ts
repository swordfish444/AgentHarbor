import { seedDemoData } from "../src/lib/demo-harness.js";
import { buildDemoUrls, resolveDemoScriptConfig } from "./lib/runtime.js";

const run = async () => {
  const config = resolveDemoScriptConfig();
  const result = await seedDemoData({
    baseUrl: config.controlNodeBaseUrl,
    allowSelfSigned: config.allowSelfSigned,
  });
  const urls = buildDemoUrls(config.dashboardBaseUrl, result.demoStartMs);

  console.log(`Seeded ${result.runnerCount} runners, ${result.sessionCount} sessions, and ${result.eventCount} events.`);
  console.log(`Failed sessions: ${result.failedSessionCount}. Running sessions: ${result.runningSessionCount}.`);
  console.log(`Live dashboard: ${urls.liveDashboardUrl}`);
  console.log(`Dashboard fallback: ${urls.demoDashboardUrl}`);
  console.log(`Wallboard: ${urls.wallboardUrl}`);
};

run().catch((error) => {
  console.error("Failed to seed demo data.");
  console.error(error);
  process.exitCode = 1;
});
