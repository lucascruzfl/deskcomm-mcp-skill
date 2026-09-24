import { VERSION } from "./constants.mjs";

export async function requestMcp({ url, token, payload, fetchImpl = fetch, sessionId, timeoutMs = 15000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const response = await fetchImpl(url, {
      method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw publicConnectionError(response.status);
    return {
      messages: parseMcpBody(body, response.headers.get("content-type")),
      sessionId: response.headers.get("mcp-session-id") ?? sessionId,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Tempo limite ao conectar ao MCP.");
    if (error?.safeMcpError) throw error;
    const cause = String(error?.cause?.code ?? "");
    if (cause.startsWith("CERT_") || cause.includes("TLS")) throw new Error("Falha TLS ao conectar ao endpoint MCP.");
    throw new Error("Não foi possível conectar ao endpoint MCP. Confira URL, rede e TLS.");
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyConnection({ url, token, fetchImpl = fetch, timeoutMs = 15000 }) {
  const initialized = await requestMcp({
    url, token, fetchImpl, timeoutMs,
    payload: {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "deskcomm-mcp-skill", version: VERSION } },
    },
  });
  const initMessage = findResponse(initialized.messages, 1);
  if (!isObject(initMessage?.result?.serverInfo) ||
      typeof initMessage.result.serverInfo.name !== "string" ||
      typeof initMessage.result.protocolVersion !== "string" ||
      !isObject(initMessage.result.capabilities)) {
    throw new Error("Handshake MCP inválido: metadata do servidor ausente ou JSON-RPC inválido.");
  }
  await requestMcp({
    url, token, fetchImpl, timeoutMs, sessionId: initialized.sessionId,
    payload: { jsonrpc: "2.0", method: "notifications/initialized" },
  });
  const tools = [];
  const cursors = new Set();
  let cursor;
  do {
    const listed = await requestMcp({
      url, token, fetchImpl, timeoutMs, sessionId: initialized.sessionId,
      payload: { jsonrpc: "2.0", id: 2, method: "tools/list", params: cursor ? { cursor } : {} },
    });
    const result = findResponse(listed.messages, 2)?.result;
    if (!Array.isArray(result?.tools)) throw new Error("tools/list retornou JSON-RPC ou catálogo inválido.");
    tools.push(...result.tools);
    cursor = result.nextCursor;
    if (cursor !== undefined && (typeof cursor !== "string" || !cursor || cursors.has(cursor))) {
      throw new Error("tools/list retornou cursor inválido ou repetido.");
    }
    if (cursor) cursors.add(cursor);
  } while (cursor);
  const names = new Set();
  const duplicates = [];
  for (const tool of tools) {
    if (!isObject(tool) || typeof tool.name !== "string" || !tool.name.trim() ||
        typeof tool.description !== "string" || !isObject(tool.inputSchema) ||
        tool.inputSchema.type !== "object" ||
        (tool.inputSchema.properties !== undefined && !isObject(tool.inputSchema.properties)) ||
        (tool.inputSchema.required !== undefined &&
          (!Array.isArray(tool.inputSchema.required) || !tool.inputSchema.required.every((x) => typeof x === "string")))) {
      throw new Error("tools/list retornou name, description ou inputSchema inválidos.");
    }
    if (names.has(tool.name)) duplicates.push(tool.name);
    names.add(tool.name);
  }
  if (duplicates.length) throw new Error(`tools/list retornou ${duplicates.length} nome(s) duplicado(s).`);
  return {
    ok: true, endpoint_ok: true, handshake_ok: true,
    server: initMessage.result.serverInfo,
    protocol_version: initMessage.result.protocolVersion,
    tool_count: tools.length, duplicate_count: 0, schemas_ok: true, tools,
  };
}

export async function generateToolsReference({ url, token, profile = "default", fetchImpl = fetch }) {
  const result = await verifyConnection({ url, token, fetchImpl });
  const lines = [
    "# Snapshot diagnóstico de tools Deskcomm MCP", "",
    "> Snapshot do token indicado. O `tools/list` em runtime sempre prevalece.", "",
    `Data: ${new Date().toISOString()}`,
    `Servidor: ${result.server.name} ${result.server.version ?? "versão não informada"}`,
    `Perfil: ${profile}`,
    `Tools visíveis: ${result.tool_count}`, "",
  ];
  for (const tool of [...result.tools].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`## ${tool.name}`, "", tool.description, "", "```json", JSON.stringify(tool.inputSchema, null, 2), "```", "");
  }
  return `${lines.join("\n")}\n`;
}

export function parseMcpBody(body, contentType = "") {
  if (!body.trim()) return [];
  try {
    if (contentType?.includes("text/event-stream") || body.startsWith("event:")) {
      return body.split(/\r?\n/).filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim()).filter(Boolean).map((line) => JSON.parse(line));
    }
    return [JSON.parse(body)];
  } catch {
    throw safeError("Resposta MCP não contém JSON válido.");
  }
}

function findResponse(messages, id) {
  const message = messages.find((item) => item?.id === id);
  if (!message || message.jsonrpc !== "2.0") throw new Error("Resposta JSON-RPC inválida ou ausente.");
  if (message.error) throw new Error(`MCP retornou erro JSON-RPC ${Number(message.error.code) || "desconhecido"}.`);
  return message;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeError(message) {
  return Object.assign(new Error(message), { safeMcpError: true });
}

function publicConnectionError(status) {
  if (status === 401) return safeError("MCP recusou autenticação (HTTP 401). Confira o token.");
  if (status === 403) return safeError("MCP recusou autorização (HTTP 403). Confira scopes e capabilities.");
  return safeError(`MCP recusou a conexão (HTTP ${status}).`);
}
