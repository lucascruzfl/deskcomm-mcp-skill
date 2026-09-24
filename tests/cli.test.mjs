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

test("CLI administra dois clientes na mesma VPS sem misturar tokens", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "deskcomm-cli-profiles-"));
  const home = path.join(base, "User Home");
  const project = path.join(base, "My Project");
  await mkdir(project, { recursive: true });
  const secondToken = ["dsk", "test_second_client"].join("_");
  const mock = await startMockMcp({ tokenProfiles: {
    [FAKE_TOKEN]: { toolCount: 2 }, [secondToken]: { toolCount: 6 },
  } });
  const env = {
    ...process.env,
    HOME: home, USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    FIXTURE_MCP_TOKEN_A: FAKE_TOKEN,
    FIXTURE_MCP_TOKEN_B: secondToken,
  };
  try {
    const commands = [
      ["profiles", "add", "Lucas", "--url", mock.url, "--token-env", "FIXTURE_MCP_TOKEN_A"],
      ["profiles", "add", "Vip Stetic", "--url", mock.url, "--token-env", "FIXTURE_MCP_TOKEN_B"],
      ["profiles", "update", "vip-stetic", "--url", mock.url],
      ["profiles", "set-default", "vip-stetic"],
      ["codex", "--global", "--profile", "lucas"],
      ["codex", "--global", "--profile", "vip-stetic"],
      ["claude", "--global", "--profile", "lucas"],
      ["claude", "--global", "--profile", "vip-stetic"],
      ["profiles", "list"],
      ["profiles", "show", "vip-stetic"],
      ["verify-connection", "--profile", "vip-stetic"],
      ["verify-all"],
    ];
    for (const args of commands) {
      const result = await run(args, { cwd: project, env });
      assert.equal(result.code, 0, `${args.join(" ")}: ${result.stderr}`);
      assert.doesNotMatch(result.stdout + result.stderr, /dsk_test_/);
      if (args[0] === "verify-all") {
        assert.match(result.stdout, /lucas.*tools\/list: 2/);
        assert.match(result.stdout, /vip-stetic.*tools\/list: 6/);
      }
    }
    const removed = await run(["profiles", "remove", "vip-stetic", "--delete-credential"], { cwd: project, env });
    assert.equal(removed.code, 0, removed.stderr);
    assert.match(removed.stdout, /integrações: 2; credencial: apagada/);
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
