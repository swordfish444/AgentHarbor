import { prisma } from "../src/lib/prisma.js";
import { resetDemoData } from "../src/lib/demo-harness.js";
import { resolveDemoScriptConfig } from "./lib/runtime.js";

const run = async () => {
  resolveDemoScriptConfig();
  const result = await resetDemoData(prisma);

  console.log(`Removed ${result.runnerCount} demo runners.`);
  console.log(`Removed ${result.sessionCount} demo sessions.`);
  console.log(`Removed ${result.eventCount} demo telemetry events.`);
  console.log(`Pruned ${result.machineCount} orphaned machines.`);
};

run()
  .catch((error) => {
    console.error("Failed to reset demo data.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
