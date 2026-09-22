#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const index = process.argv.indexOf("--credential");
if (index < 0 || !process.argv[index + 1]) fail("credential_path_missing");

try {
  const value = JSON.parse(await readFile(process.argv[index + 1], "utf8"));
  if (typeof value.token !== "string" || !value.token.startsWith("dsk_")) fail("credential_invalid");
  process.stdout.write(`${JSON.stringify({ Authorization: `Bearer ${value.token}` })}\n`);
} catch {
  fail("credential_unavailable");
}

function fail(code) {
  process.stderr.write(`${code}\n`);
  process.exit(1);
}
