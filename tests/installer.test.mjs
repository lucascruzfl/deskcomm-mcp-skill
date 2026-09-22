import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { doctor } from "../src/doctor.mjs";
import { install, uninstall, updateInstallations } from "../src/installer.mjs";
import { FAKE_TOKEN, pathOptionsFor, startMockMcp } from "./helpers.mjs";

for (const client of ["codex", "claude"]) {
  for (const scope of ["project", "global"]) {
    test(`${client}: fresh install, reinstall, update e uninstall em ${scope}`, async () => {
      const base = await mkdtemp(path.join(os.tmpdir(), "deskcomm skill space "));
      const home = path.join(base, "User Home");
      const projectRoot = path.join(base, "Project Root");
      const pathOptions = pathOptionsFor(home);
      const mock = await startMockMcp({ toolCount: 203 });
      try {
        const first = await install({ client, scope, profile: "acme", projectRoot, pathOptions, url: mock.url, token: FAKE_TOKEN });
        assert.equal(first.verification.tool_count, 203);
        const configBefore = await readFile(first.configFile, "utf8");
        assert.doesNotMatch(configBefore, new RegExp(FAKE_TOKEN));

        await install({ client, scope, profile: "acme", projectRoot, pathOptions, url: mock.url, token: FAKE_TOKEN });
        const configAfter = await readFile(first.configFile, "utf8");
        const needle = client === "codex" ? "[mcp_servers.deskcomm-acme]" : '"deskcomm-acme"';
        assert.equal(configAfter.split(needle).length - 1, 1);

        const updated = await updateInstallations({ pathOptions });
        assert.equal(updated.updated, 1);
        const removed = await uninstall({ client, scope, profile: "acme", projectRoot, pathOptions, removeCredential: true });
        assert.equal(removed.removedConfig, true);
        assert.equal(removed.removedCredential, true);
      } finally {
        await mock.close();
      }
    });
  }
}

test("preserva outro MCP e configuração existente", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "deskcomm-existing-"));
  const home = path.join(base, "home");
  const projectRoot = path.join(base, "project");
  const pathOptions = pathOptionsFor(home);
  const codexFile = path.join(projectRoot, ".codex", "config.toml");
  const claudeFile = path.join(projectRoot, ".mcp.json");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(path.dirname(codexFile), { recursive: true }));
  await writeFile(codexFile, 'model = "fixture"\n\n[mcp_servers.other]\nurl = "https://other.invalid/mcp"\n');
  await import("node:fs/promises").then(({ mkdir }) => mkdir(projectRoot, { recursive: true }));
  await writeFile(claudeFile, JSON.stringify({ setting: true, mcpServers: { other: { command: "other" } } }));
  const mock = await startMockMcp();
  try {
    await install({ client: "codex", scope: "project", projectRoot, pathOptions, url: mock.url, token: FAKE_TOKEN });
    await install({ client: "claude", scope: "project", projectRoot, pathOptions, url: mock.url, token: FAKE_TOKEN });
    assert.match(await readFile(codexFile, "utf8"), /mcp_servers\.other/);
    assert.match(await readFile(codexFile, "utf8"), /model = "fixture"/);
    const claude = JSON.parse(await readFile(claudeFile, "utf8"));
    assert.equal(claude.setting, true);
    assert.equal(claude.mcpServers.other.command, "other");
  } finally {
    await mock.close();
  }
});

test("doctor valida config, skill, permissão e conexão sem revelar token", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "deskcomm-doctor-"));
  const home = path.join(base, "home");
  const projectRoot = path.join(base, "project");
  const pathOptions = pathOptionsFor(home);
  const mock = await startMockMcp({ toolCount: 5 });
  try {
    await install({ client: "codex", scope: "project", projectRoot, pathOptions, url: mock.url, token: FAKE_TOKEN });
    const result = await doctor({ client: "codex", scope: "project", projectRoot, pathOptions });
    assert.equal(result.ok, true);
    assert.equal(result.checks.find((item) => item.name === "connection").ok, true);
    assert.doesNotMatch(JSON.stringify(result.checks), new RegExp(FAKE_TOKEN));
  } finally {
    await mock.close();
  }
});

for (const client of ["codex", "claude"]) {
  test(`${client}: não sobrescreve nem remove entrada homônima não gerenciada`, async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "deskcomm-unmanaged-"));
    const home = path.join(base, "home");
    const projectRoot = path.join(base, "project");
    const pathOptions = pathOptionsFor(home);
    const configFile = client === "codex"
      ? path.join(projectRoot, ".codex", "config.toml")
      : path.join(projectRoot, ".mcp.json");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(path.dirname(configFile), { recursive: true }));
    const original = client === "codex"
      ? '[mcp_servers.deskcomm]\nurl = "https://manual.invalid/api/mcp"\n'
      : `${JSON.stringify({ mcpServers: { deskcomm: { command: "manual" } } }, null, 2)}\n`;
    await writeFile(configFile, original);
    const mock = await startMockMcp();
    try {
      await assert.rejects(
        install({ client, scope: "project", projectRoot, pathOptions, url: mock.url, token: FAKE_TOKEN }),
        /não foi criado por este instalador/,
      );
      const removed = await uninstall({ client, scope: "project", projectRoot, pathOptions, removeCredential: true });
      assert.equal(removed.removedConfig, false);
      assert.equal(await readFile(configFile, "utf8"), original);
    } finally {
      await mock.close();
    }
  });
}
