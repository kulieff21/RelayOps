import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseEnv } from "node:util";

// Read-only release check. Never prints a credential, matching source, raw git error,
// local configuration or provider response. No network or model is invoked.
function git(...args: string[]) {
  const result = spawnSync("git", args, { maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("PUBLIC_RELEASE_GIT_FAILED");
  return result.stdout;
}
const signatures = [
  /sk-or-v1-[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9_-]{30,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /\b\d{6,12}:[A-Za-z0-9_-]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const forbiddenNames = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "CLUADE.md",
  "LOG.md",
  "PLAN.md",
  "plan.md",
  "TASKS.md",
]);
const forbiddenDirectories = new Set([
  ".local",
  ".codex",
  ".claude",
  ".agents",
  "runtime",
  "artifacts",
  "logs",
  "node_modules",
  "dist",
]);
function checkNames(names: string[]) {
  for (const name of names) {
    const parts = name.split("/"),
      leaf = parts.at(-1)!;
    if (
      forbiddenNames.has(leaf) ||
      parts.some((part) => forbiddenDirectories.has(part)) ||
      (leaf.startsWith(".env") && !leaf.endsWith(".example")) ||
      /^SESSION/.test(leaf) ||
      /\.(?:key|pem|sqlite(?:3)?|db)(?:-|$)/.test(leaf)
    )
      throw new Error("PUBLIC_RELEASE_PRIVATE_PATH");
  }
}
function lines(buffer: Buffer) {
  return buffer.toString("utf8").split(/\r?\n/).filter(Boolean);
}
function paths(buffer: Buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

try {
  if (JSON.parse(readFileSync("package.json", "utf8")).name !== "relayops")
    throw new Error("PUBLIC_RELEASE_WRONG_PROJECT");
  const secrets: Buffer[] = [];
  if (existsSync(".env")) {
    for (const [name, value] of Object.entries(
      parseEnv(readFileSync(".env", "utf8")),
    )) {
      if (
        value &&
        (/(?:_API_KEY|_TOKEN)$/.test(name) ||
          (name.startsWith("TELEGRAM_APPROVER_") && /^\d{6,}$/.test(value)))
      )
        secrets.push(Buffer.from(value));
    }
  }
  function checkContent(content: Buffer) {
    if (
      secrets.some((secret) => content.includes(secret)) ||
      signatures.some((pattern) => pattern.test(content.toString("utf8")))
    )
      throw new Error("PUBLIC_RELEASE_SECRET_FOUND");
  }
  const workFiles = [
    ...new Set(
      paths(
        git("ls-files", "--cached", "--others", "--exclude-standard", "-z"),
      ),
    ),
  ];
  checkNames(workFiles);
  for (const name of workFiles) {
    if (existsSync(name)) {
      if (!lstatSync(name).isFile())
        throw new Error("PUBLIC_RELEASE_UNSUPPORTED_FILE");
      checkContent(readFileSync(name));
    }
  }
  const staged = paths(
    git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"),
  );
  checkNames(staged);
  for (const name of staged) checkContent(git("show", `:${name}`));
  const commits = lines(git("rev-list", "--all"));
  for (const commit of commits) {
    const names = paths(git("ls-tree", "-r", "--name-only", "-z", commit));
    checkNames(names);
    checkContent(git("show", commit));
  }
  let assets = 0;
  function frontend(directory: string) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name),
        stat = lstatSync(path);
      if (stat.isDirectory()) frontend(path);
      else if (stat.isFile()) {
        checkContent(readFileSync(path));
        assets++;
      } else throw new Error("PUBLIC_RELEASE_UNSUPPORTED_ASSET");
    }
  }
  if (!existsSync("dist/web/index.html"))
    throw new Error("PUBLIC_RELEASE_BUILD_REQUIRED");
  frontend("dist/web");
  console.log(
    JSON.stringify({
      status: "passed",
      check: "public-release",
      workingFiles: workFiles.length,
      stagedFiles: staged.length,
      historyCommits: commits.length,
      frontendAssets: assets,
      savedConfigurationPresent: existsSync(".env"),
      project: basename(process.cwd()),
    }),
  );
} catch (error) {
  console.error(
    error instanceof Error && /^PUBLIC_RELEASE_[A-Z_]+$/.test(error.message)
      ? error.message
      : "PUBLIC_RELEASE_CHECK_FAILED",
  );
  process.exitCode = 1;
}
