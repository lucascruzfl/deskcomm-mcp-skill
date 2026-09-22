import { ESSENTIAL_TOOL_HINTS } from "./constants.mjs";

export async function requestMcp({ url, token, payload, fetchImpl = fetch, sessionId, timeoutMs = 15000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw publicConnectionError(response.status);
    const messages = parseMcpBody(body, response.headers.get("content-type"));
    return { messages, sessionId: response.headers.get("mcp-session-id") ?? sessionId };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Tempo limite ao conectar ao MCP.");
    if (/^MCP recusou/.test(error?.message ?? "")) throw error;
    throw new Error("Não foi possível conectar ao endpoint MCP. Confira URL, rede e TLS.");
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyConnection({ url, token, fetchImpl = fetch, timeoutMs = 15000 }) {
  const initialized = await requestMcp({
    url,
    token,
    fetchImpl,
    timeoutMs,
    payload: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "deskcomm-mcp-skill", version: "0.1.0" },
      },
    },
  });
  const initMessage = findResponse(initialized.messages, 1);
  if (!initMessage?.result?.serverInfo || !initMessage?.result?.capabilities) {
    throw new Error("Handshake MCP inválido: metadata do servidor ausente.");
  }

  await requestMcp({
    url,
    token,
    fetchImpl,
    timeoutMs,
    sessionId: initialized.sessionId,
    payload: { jsonrpc: "2.0", method: "notifications/initialized" },
  });
  const listed = await requestMcp({
    url,
    token,
    fetchImpl,
    timeoutMs,
    sessionId: initialized.sessionId,
    payload: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  });
  const listMessage = findResponse(listed.messages, 2);
  const tools = listMessage?.result?.tools;
  if (!Array.isArray(tools) || tools.length === 0) throw new Error("tools/list não retornou ferramentas.");
  const invalid = tools.find((tool) =>
    !tool || typeof tool.name !== "string" || !tool.name || typeof tool.description !== "string" ||
    !tool.inputSchema || typeof tool.inputSchema !== "object"
  );
  if (invalid) throw new Error("tools/list retornou uma ferramenta sem name, description ou inputSchema válidos.");
  const names = new Set(tools.map((tool) => tool.name));
  return {
    ok: true,
    server: initMessage.result.serverInfo,
    protocol_version: initMessage.result.protocolVersion,
    tool_count: tools.length,
    tools,
    missing_essential_hints: ESSENTIAL_TOOL_HINTS.filter((name) => !names.has(name)),
  };
}

export async function generateToolsReference({ url, token, fetchImpl = fetch }) {
  const result = await verifyConnection({ url, token, fetchImpl });
  const lines = [
    "# Deskcomm MCP tools — generated snapshot",
    "",
    "> Generated snapshot. Runtime source of truth: `tools/list`.",
    "",
    `Generated at: ${new Date().toISOString()}`,
    `Visible tools for this token: ${result.tool_count}`,
    "",
  ];
  for (const tool of [...result.tools].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`## ${tool.name}`, "", tool.description, "", "```json", JSON.stringify(tool.inputSchema, null, 2), "```", "");
  }
  return `${lines.join("\n")}\n`;
}

export function parseMcpBody(body, contentType = "") {
  if (!body.trim()) return [];
  if (contentType?.includes("text/event-stream") || body.startsWith("event:")) {
    return body.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim()).filter(Boolean).map((line) => JSON.parse(line));
  }
  return [JSON.parse(body)];
}

function findResponse(messages, id) {
  return messages.find((message) => message?.id === id);
}

function publicConnectionError(status) {
  if (status === 401 || status === 403) return new Error("MCP recusou a autenticação. Confira o token e suas permissões.");
  return new Error(`MCP recusou a conexão (HTTP ${status}).`);
}
