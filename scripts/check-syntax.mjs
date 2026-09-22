import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["bin", "src", "runtime", "scripts", "tests"];
const files = [];
for (const root of roots) await collect(root, files);
let failed = false;
for (const file of files.filter((name) => name.endsWith(".mjs"))) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;

async function collect(directory, output) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(target, output);
    else output.push(target);
  }
}
