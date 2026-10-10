import { z } from "zod";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_TIME } from "../shared/time.js";

export const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export function config(env = process.env) {
  const values = z
    .object({
      HOST: z.literal("127.0.0.1").default("127.0.0.1"),
      PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
      DATABASE_PATH: z.string().default("runtime/relayops-demo.sqlite"),
      DEMO_CLOCK: z.iso.datetime().default(FIXTURE_TIME),
    })
    .parse(env);
  const databasePath = resolve(projectRoot, values.DATABASE_PATH);
  if (databasePath !== resolve(projectRoot, "runtime/relayops-demo.sqlite"))
    throw new Error(
      "Only runtime/relayops-demo.sqlite is supported by the local sandbox",
    );
  return { ...values, databasePath };
}
