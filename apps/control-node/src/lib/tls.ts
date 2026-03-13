import fs from "node:fs";
import selfsigned from "selfsigned";
import { env } from "../env.js";

export const getHttpsOptions = () => {
  if (!env.tlsEnabled) {
    return undefined;
  }

  if (env.tlsCertPath && env.tlsKeyPath) {
    return {
      cert: fs.readFileSync(env.tlsCertPath),
      key: fs.readFileSync(env.tlsKeyPath),
    };
  }

  const pems = selfsigned.generate(
    [{ name: "commonName", value: "localhost" }],
    { days: 365, algorithm: "sha256", keySize: 2048 },
  );

  return {
    cert: pems.cert,
    key: pems.private,
  };
};
