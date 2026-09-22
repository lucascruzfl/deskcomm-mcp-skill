#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import readline from "node:readline";

const credentialFile = argument("--credential");
if (!credentialFile) stop("credential_path_missing");

let credential;
try {
  credential = JSON.parse(await readFile(credentialFile, "utf8"));
  if (!credential.url || !String(credential.token).startsWith("dsk_")) throw new Error();
} catch {
  stop("credential_unavailable");
}

let protocolVersion = "2025-06-18";
let sessionId;
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  if (!line.trim()) continue;
  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
    continue;
  }
  if (payload?.params?.protocolVersion) protocolVersion = payload.params.protocolVersion;
  try {
    const messages = await forward(payload);
    for (const message of messages) process.stdout.write(`${JSON.stringify(message)}\n`);
  } catch (error) {
    if (payload.id !== undefined) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: payload.id, error: { code: -32603, message: safeMessage(error) } })}\n`);
    }
  }
}

async function forward(payload) {
  const headers = {
    Authorization: `Bearer ${credential.token}`,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": protocolVersion,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const response = await fetch(credential.url, { method: "POST", headers, body: JSON.stringify(payload) });
  const nextSession = response.headers.get("mcp-session-id");
  if (nextSession) sessionId = nextSession;
  const body = await response.text();
  if (!response.ok) throw new Error(`mcp_http_${response.status}`);
  if (!body.trim()) return [];
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    return body.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim()).filter(Boolean).map((line) => JSON.parse(line));
  }
  return [JSON.parse(body)];
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeMessage(error) {
  const message = String(error?.message ?? "mcp_transport_error");
  return /^mcp_http_\d+$/.test(message) ? message : "mcp_transport_error";
}

function stop(code) {
  process.stderr.write(`${code}\n`);
  process.exit(1);
}
