import { runDemoBurst } from "../src/lib/demo-harness.js";
import { resolveDemoScriptConfig } from "./lib/runtime.js";

const run = async () => {
  const config = resolveDemoScriptConfig();
  const result = await runDemoBurst({
    baseUrl: config.controlNodeBaseUrl,
    allowSelfSigned: config.allowSelfSigned,
  });

  console.log(`Burst completed with ${result.runnerCount} temporary runners and ${result.eventCount} live events.`);
};

run().catch((error) => {
  console.error("Failed to run the demo burst.");
  console.error(error);
  process.exitCode = 1;
});
