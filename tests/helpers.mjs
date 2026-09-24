import http from "node:http";

export const FAKE_TOKEN = "dsk_test_fixture_token";

export async function startMockMcp({
  toolCount = 3, token = FAKE_TOKEN, invalidCatalog = false, duplicate = false,
  status = 200, delayMs = 0, pageSize = Infinity, invalidJsonRpc = false, tokenProfiles,
} = {}) {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const bearer = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : undefined;
    const profile = tokenProfiles?.[bearer];
    if (tokenProfiles ? !profile : bearer !== token) {
      return json(response, 401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized" } });
    }
    if (status !== 200) return json(response, status, { jsonrpc: "2.0", id: null, error: { code: -32002, message: "forbidden" } });
    const payload = JSON.parse(body || "{}");
    calls.push(payload.method);
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (payload.method === "notifications/initialized") {
      response.writeHead(202).end();
      return;
    }
    if (payload.method === "initialize") {
      return json(response, 200, {
        jsonrpc: invalidJsonRpc ? "1.0" : "2.0",
        id: payload.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "deskcomm-mock", version: "test" },
        },
      });
    }
    if (payload.method === "tools/list") {
      const start = Number(payload.params?.cursor ?? 0);
      const visibleCount = profile?.toolCount ?? toolCount;
      const end = Math.min(visibleCount, start + pageSize);
      const tools = Array.from({ length: end - start }, (_, offset) => ({
        name: `crm_fixture_${start + offset + 1}`,
        description: `Fixture tool ${start + offset + 1}`,
        inputSchema: { type: "object", properties: {}, required: [] },
      }));
      if (invalidCatalog && tools[0]) tools[0].inputSchema = { type: "array" };
      if (duplicate && tools.length > 1) tools[1].name = tools[0].name;
      return json(response, 200, { jsonrpc: "2.0", id: payload.id, result: { tools, ...(end < visibleCount ? { nextCursor: String(end) } : {}) } });
    }
    if (payload.method === "tools/call") {
      return json(response, 200, {
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          structuredContent: { human_action_required: true, code: "fixture_human", resource: { type: "channel" } },
          content: [{ type: "text", text: JSON.stringify({
            human_action_required: true,
            reason: "fixture_requires_human",
            href: "/app/settings",
          }) }],
        },
      });
    }
    return json(response, 200, { jsonrpc: "2.0", id: payload.id, error: { code: -32601, message: "not found" } });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/api/mcp`,
    calls,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export function pathOptionsFor(home, platform = process.platform) {
  return {
    home,
    platform,
    env: platform === "win32"
      ? { USERPROFILE: home, APPDATA: `${home}/AppData/Roaming`, USERNAME: process.env.USERNAME }
      : { HOME: home, XDG_CONFIG_HOME: `${home}/.config` },
  };
}

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
