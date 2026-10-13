import { readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Generate from the actual lock and installed package licenses; no network.
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
let output =
  "# Third-party notices\n\nGenerated from package-lock.json and installed packages. Original licenses remain\napplicable; the RelayOps MIT license does not replace them. Includes development\nand transitive tools. Optional packages not installed here have their lockfile license\nidentifier only. Regenerate after npm ci: `node scripts/third-party-notices.mjs`.\n\n";
for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  if (!path) continue;
  const name = path.slice(path.lastIndexOf("node_modules/") + 13);
  output += `## ${name} ${entry.version}\n\nLicense: ${entry.license ?? "See upstream package"}.\n\n`;
  if (!existsSync(path)) {
    output +=
      "Optional platform package is not installed in this checkout.\n\n";
    continue;
  }
  const files = readdirSync(path).filter((file) =>
    /^(?:LICEN[CS]E|COPYING|NOTICE|OFL)(?:[._-].*)?$/i.test(file),
  );
  for (const file of files)
    output += `### ${file}\n\n\`\`\`text\n${readFileSync(join(path, file), "utf8").trim()}\n\`\`\`\n\n`;
  if (!files.length)
    output +=
      "No top-level notice file is bundled; retain upstream notices on redistribution.\n\n";
}
writeFileSync(
  "THIRD_PARTY_NOTICES.md",
  output
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trimEnd() + "\n",
);
console.log("Generated third-party notices from locked packages.");
