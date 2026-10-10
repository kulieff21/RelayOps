import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { projectRoot } from "../src/server/config.js";

// Dedicated port: never stop an unrelated listener occupying it.
const port = 3099;
const child = spawn(process.execPath, ["dist/server/main.js"], {
  cwd: projectRoot,
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += String(chunk);
});
const exited = new Promise<void>((resolve) =>
  child.on("exit", () => resolve()),
);
try {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Sandbox startup timeout")),
      10000,
    );
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("RelayOps sandbox API:")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited ${code}: ${stderr}`));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const response = await fetch(`${origin}/health`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { mode: string }).mode, "sandbox");
  const catalog = await fetch(`${origin}/api/products?locale=az&q=NET-SW`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(catalog.status, 200);
  const data = (await catalog.json()) as { data: { name: string }[] };
  assert.match(data.data[0]!.name, /şəbəkə/);
  console.log(
    "Compiled server HTTP smoke passed (health and Azerbaijani catalog).",
  );
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
  await exited;
}
