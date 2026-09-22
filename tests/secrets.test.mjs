import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { install } from "../src/installer.mjs";
import { FAKE_TOKEN, pathOptionsFor, startMockMcp } from "./helpers.mjs";

test("token fica somente na credencial 0600 fora do projeto", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "deskcomm-secret-"));
  const home = path.join(base, "home");
  const projectRoot = path.join(base, "project");
  const pathOptions = pathOptionsFor(home);
  const mock = await startMockMcp();
  try {
    const result = await install({ client: "codex", scope: "project", projectRoot, pathOptions, url: mock.url, token: FAKE_TOKEN });
    assert(!result.credentialFile.startsWith(projectRoot));
    assert.equal((await stat(result.credentialFile)).mode & 0o777, 0o600);
    const projectText = await collectText(projectRoot);
    assert.doesNotMatch(projectText, new RegExp(FAKE_TOKEN));
    assert.match(await readFile(result.credentialFile, "utf8"), new RegExp(FAKE_TOKEN));
  } finally {
    await mock.close();
  }
});

test("repositório não contém padrão de token real além da fixture declarada", async () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const text = await collectText(root, new Set([".git", "node_modules"]));
  const matches = text.match(/dsk_[A-Za-z0-9_-]{12,}/g) ?? [];
  assert(matches.every((value) => value === FAKE_TOKEN || value === "dsk_wrong_secret_value"));
});

async function collectText(root, ignored = new Set()) {
  let output = "";
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) output += await collectText(target, ignored);
    else if (!/\.(tgz|png|jpg|lock)$/.test(entry.name)) output += await readFile(target, "utf8").catch(() => "");
  }
  return output;
}
