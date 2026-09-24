import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { requestMcp, verifyConnection } from "../src/mcp-client.mjs";
import { FAKE_TOKEN, startMockMcp } from "./helpers.mjs";

for (const toolCount of [0, 3, 400]) {
  test(`tools/list dinâmico aceita ${toolCount} tools`, async () => {
    const mock = await startMockMcp({ toolCount });
    try {
      const result = await verifyConnection({ url: mock.url, token: FAKE_TOKEN });
      assert.equal(result.tool_count, toolCount);
      assert.deepEqual(mock.calls.includes("tools/call"), false);
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

test("catálogo paginado e subconjunto de autorização são válidos", async () => {
  const mock = await startMockMcp({ toolCount: 7, pageSize: 2 });
  try {
    const result = await verifyConnection({ url: mock.url, token: FAKE_TOKEN });
    assert.equal(result.tool_count, 7);
    assert.equal(mock.calls.filter((method) => method === "tools/list").length, 4);
    assert.equal(result.duplicate_count, 0);
  } finally { await mock.close(); }
});

test("tokens com scopes diferentes recebem subconjuntos válidos", async () => {
  const readToken = "scope_read_fixture";
  const fullToken = "scope_full_fixture";
  const mock = await startMockMcp({
    tokenProfiles: {
      [readToken]: { scopes: ["contacts:read"], toolCount: 1 },
      [fullToken]: { scopes: ["contacts:read", "messages:write"], toolCount: 9 },
    },
  });
  try {
    assert.equal((await verifyConnection({ url: mock.url, token: readToken })).tool_count, 1);
    assert.equal((await verifyConnection({ url: mock.url, token: fullToken })).tool_count, 9);
  } finally { await mock.close(); }
});

test("rejeita nomes duplicados", async () => {
  const mock = await startMockMcp({ duplicate: true });
  try {
    await assert.rejects(verifyConnection({ url: mock.url, token: FAKE_TOKEN }), /duplicado/);
  } finally { await mock.close(); }
});

test("distingue 403 de 401 e valida JSON-RPC", async () => {
  const forbidden = await startMockMcp({ status: 403 });
  const invalid = await startMockMcp({ invalidJsonRpc: true });
  try {
    await assert.rejects(verifyConnection({ url: forbidden.url, token: FAKE_TOKEN }), /403/);
    await assert.rejects(verifyConnection({ url: invalid.url, token: FAKE_TOKEN }), /JSON-RPC/);
  } finally { await forbidden.close(); await invalid.close(); }
});

test("timeout é relatado sem segredo", async () => {
  const mock = await startMockMcp({ delayMs: 100 });
  try {
    await assert.rejects(verifyConnection({ url: mock.url, token: FAKE_TOKEN, timeoutMs: 10 }),
      (error) => /Tempo limite/.test(error.message) && !error.message.includes(FAKE_TOKEN));
  } finally { await mock.close(); }
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
    assert.equal(response.messages[0].result.structuredContent.code, "fixture_human");
    const error = await requestMcp({
      url: mock.url, token: FAKE_TOKEN,
      payload: { jsonrpc: "2.0", id: 10, method: "unknown/method" },
    });
    assert.equal(error.messages[0].error.code, -32601);
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
