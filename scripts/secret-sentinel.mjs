import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const patterns = [
  /dsk_(?!test_fixture_token|wrong_secret_value)[A-Za-z0-9_-]{12,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{12,}/,
  /re_[A-Za-z0-9]{25,}/,
  /\/root\/DeskcommCRM/,
  /crm\.cruzlucas\.com\.br/,
];
const failures = [];
for (const file of files) {
  if (file.startsWith(".git/") || /\.(png|jpg|jpeg|tgz|ico)$/.test(file)) continue;
  const content = await readFile(file, "utf8").catch(() => "");
  for (const pattern of patterns) if (pattern.test(content)) failures.push(file);
}
if (failures.length) {
  process.stderr.write(`Secret sentinel: padrões sensíveis em ${[...new Set(failures)].join(", ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Secret sentinel: OK\n");
}
