import { spawn, fork } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major !== 22 || minor < 16)
  throw new Error("Use Node 22.16+ within major 22.");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--skip-build"))
  throw new Error(
    "Only --skip-build is supported (requires an existing build).",
  );
let child;
let stopping = false;
function stop() {
  stopping = true;
  if (child?.connected) child.send("shutdown");
  else child?.kill("SIGTERM");
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
// Allows an owned test/preview supervisor to request the same graceful shutdown.
process.on("message", (message) => {
  if (message === "shutdown") stop();
});
process.on("disconnect", stop);
function runNpm(args) {
  if (!process.env.npm_execpath) throw new Error("Start with npm run demo.");
  return new Promise((done, reject) => {
    child = spawn(process.execPath, [process.env.npm_execpath, ...args], {
      cwd: root,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0 || stopping)
        reject(new Error("Demo preparation stopped."));
      else done();
    });
  });
}
try {
  if (!args.includes("--skip-build")) {
    await runNpm(["ci"]);
    await runNpm(["run", "build"]);
  }
  if (!stopping) {
    child = fork("dist/server/demo.js", [], {
      cwd: root,
      stdio: ["inherit", "inherit", "inherit", "ipc"],
    });
    child.once("error", () => {
      process.exitCode = 1;
    });
    child.once("exit", (code) => {
      process.exitCode = code ?? 1;
      if (process.connected) process.disconnect();
    });
  }
} catch {
  console.error("Demo preparation failed; check the command output above.");
  process.exitCode = 1;
  if (process.connected) process.disconnect();
}
