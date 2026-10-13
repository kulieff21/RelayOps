import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { projectRoot } from "../src/server/config.js";

test("supervised visitor launcher exits after npm preparation failure instead of retaining its IPC channel", async (t) => {
  const child = fork(join(projectRoot, "scripts/launch-demo.mjs"), [], {
    env: {
      ...process.env,
      npm_execpath: join(tmpdir(), `relayops-absent-npm-${randomUUID()}.cjs`),
    },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  t.after(() => {
    if (child.exitCode === null) child.kill();
  });
  const code = await new Promise<number | null>((done, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Failed launcher retained a live supervisor channel"));
    }, 10000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (value) => {
      clearTimeout(timer);
      done(value);
    });
  });
  assert.equal(code, 1);
  assert.equal(child.connected, false);
});
