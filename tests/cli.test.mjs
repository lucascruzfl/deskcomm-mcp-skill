import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { FAKE_TOKEN, startMockMcp } from "./helpers.mjs";

test("CLI instala, verifica, diagnostica, atualiza e remove sem expor token", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "deskcomm-cli-"));
  const home = path.join(base, "User Home");
  const project = path.join(base, "My Project");
  await mkdir(project, { recursive: true });
  const mock = await startMockMcp({ toolCount: 2 });
  const env = {
    ...process.env,
    HOME: home, USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    FIXTURE_MCP_TOKEN: FAKE_TOKEN,
  };
  try {
    for (const args of [
      ["codex", "--url", mock.url, "--token-env", "FIXTURE_MCP_TOKEN"],
      ["verify-connection"],
      ["doctor", "codex"],
      ["update"],
      ["uninstall", "codex", "--keep-credential"],
    ]) {
      const result = await run(args, { cwd: project, env });
      assert.equal(result.code, 0, `${args[0]}: ${result.stderr}`);
      assert.doesNotMatch(result.stdout + result.stderr, new RegExp(FAKE_TOKEN));
      if (args[0] === "verify-connection") {
        assert.match(result.stdout, /Endpoint OK.*Handshake OK.*tools\/list: 2.*Duplicates: 0.*Schemas: OK/);
      }
    }
    assert.deepEqual(mock.calls.includes("tools/call"), false);
  } finally { await mock.close(); }
});

function run(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve("bin/deskcomm-mcp-skill.mjs"), ...args], {
      ...options, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
