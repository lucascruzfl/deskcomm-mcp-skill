import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { requestMcp, verifyConnection } from "../src/mcp-client.mjs";
import { FAKE_TOKEN, startMockMcp } from "./helpers.mjs";

for (const toolCount of [202, 203, 250]) {
  test(`tools/list dinâmico aceita ${toolCount} tools`, async () => {
    const mock = await startMockMcp({ toolCount });
    try {
      const result = await verifyConnection({ url: mock.url, token: FAKE_TOKEN });
      assert.equal(result.tool_count, toolCount);
      if (toolCount > 202) assert(result.tools.some((tool) => tool.name === "crm_unknown_future_tool"));
    } finally {
      await mock.close();
    }
  });
}

test("rejeita token inválido sem repeti-lo no erro", async () => {
  const mock = await startMockMcp();
  try {
    await assert.rejects(
      verifyConnection({ url: mock.url, token: "dsk_wrong_secret_value" }),
      (error) => !error.message.includes("dsk_wrong_secret_value") && /autenticação/.test(error.message),
    );
  } finally {
    await mock.close();
  }
});

test("rejeita catálogo sem metadata obrigatória", async () => {
  const mock = await startMockMcp({ invalidCatalog: true });
  try {
    await assert.rejects(verifyConnection({ url: mock.url, token: FAKE_TOKEN }), /inputSchema/);
  } finally {
    await mock.close();
  }
});

test("mock simula human_action_required", async () => {
  const mock = await startMockMcp();
  try {
    const response = await requestMcp({
      url: mock.url,
      token: FAKE_TOKEN,
      payload: { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "crm_fixture_1", arguments: {} } },
    });
    assert.match(JSON.stringify(response.messages), /human_action_required/);
  } finally {
    await mock.close();
  }
});

test("URL sem servidor falha de modo sanitizado", async () => {
  await assert.rejects(
    verifyConnection({ url: "http://127.0.0.1:9/api/mcp", token: FAKE_TOKEN, timeoutMs: 200 }),
    /Não foi possível conectar/,
  );
});

test("bridge stdio encaminha handshake, tools/list e human_action", async () => {
  const mock = await startMockMcp({ toolCount: 7 });
  const directory = await mkdtemp(path.join(os.tmpdir(), "deskcomm-bridge-"));
  const credential = path.join(directory, "credential.json");
  await writeFile(credential, JSON.stringify({ url: mock.url, token: FAKE_TOKEN }), { mode: 0o600 });
  const bridge = spawn(process.execPath, [path.resolve("runtime/bridge.mjs"), "--credential", credential], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const responses = [];
  let buffer = "";
  bridge.stdout.setEncoding("utf8");
  bridge.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines.filter(Boolean)) responses.push(JSON.parse(line));
  });
  try {
    bridge.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } })}\n`);
    await waitFor(() => responses.some((item) => item.id === 1));
    bridge.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    bridge.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
    bridge.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "crm_fixture_1", arguments: {} } })}\n`);
    await waitFor(() => responses.some((item) => item.id === 3));
    assert.equal(responses.find((item) => item.id === 2).result.tools.length, 7);
    assert.match(JSON.stringify(responses.find((item) => item.id === 3)), /human_action_required/);
  } finally {
    bridge.kill("SIGTERM");
    await mock.close();
  }
});

async function waitFor(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timeout waiting for bridge");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
