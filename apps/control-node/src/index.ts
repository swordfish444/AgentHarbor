import { startServer } from "./server.js";

startServer().catch((error) => {
  console.error("Failed to start AgentHarbor control node", error);
  process.exitCode = 1;
});
