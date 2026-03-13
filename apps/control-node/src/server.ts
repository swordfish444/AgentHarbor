import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { prisma } from "./lib/prisma.js";
import { getHttpsOptions } from "./lib/tls.js";
import { registerV1Routes } from "./routes/v1.js";

export const buildServer = async () => {
  const app = Fastify({
    logger: true,
    https: getHttpsOptions(),
  } as any);

  await app.register(cors, { origin: true });
  await registerV1Routes(app);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
};

export const startServer = async () => {
  const app = await buildServer();
  await app.listen({ host: env.host, port: env.port });
  return app;
};
