import { prisma } from "../src/lib/prisma.js";
import { resetDemoData, seedDemoData } from "../src/lib/demo-harness.js";
import { buildDemoUrls, resolveDemoScriptConfig } from "./lib/runtime.js";

const run = async () => {
  const config = resolveDemoScriptConfig();
  const resetResult = await resetDemoData(prisma);
  const seedResult = await seedDemoData({
    baseUrl: config.controlNodeBaseUrl,
    allowSelfSigned: config.allowSelfSigned,
  });
  const urls = buildDemoUrls(config.dashboardBaseUrl, seedResult.demoStartMs);

  console.log(`Reset ${resetResult.runnerCount} demo runners and ${resetResult.eventCount} demo events.`);
  console.log(
    `Warm-started ${seedResult.runnerCount} runners, ${seedResult.sessionCount} sessions, and ${seedResult.eventCount} events.`,
  );
  console.log(`Failed sessions: ${seedResult.failedSessionCount}. Running sessions: ${seedResult.runningSessionCount}.`);
  console.log(`Live dashboard: ${urls.liveDashboardUrl}`);
  console.log(`Dashboard fallback: ${urls.demoDashboardUrl}`);
  console.log(`Wallboard: ${urls.wallboardUrl}`);
  console.log("Optional live overlay: pnpm demo:burst");
};

run()
  .catch((error) => {
    console.error("Failed to warm-start the demo data.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
