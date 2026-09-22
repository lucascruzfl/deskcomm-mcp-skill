import http from "node:http";

export const FAKE_TOKEN = "dsk_test_fixture_token";

export async function startMockMcp({ toolCount = 3, token = FAKE_TOKEN, invalidCatalog = false } = {}) {
  const server = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    if (request.headers.authorization !== `Bearer ${token}`) {
      return json(response, 401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized" } });
    }
    const payload = JSON.parse(body || "{}");
    if (payload.method === "notifications/initialized") {
      response.writeHead(202).end();
      return;
    }
    if (payload.method === "initialize") {
      return json(response, 200, {
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "deskcomm-mock", version: "test" },
        },
      });
    }
    if (payload.method === "tools/list") {
      const tools = Array.from({ length: toolCount }, (_, index) => ({
        name: index === toolCount - 1 && toolCount > 202 ? "crm_unknown_future_tool" : `crm_fixture_${index + 1}`,
        description: `Fixture tool ${index + 1}`,
        inputSchema: { type: "object", properties: {} },
      }));
      if (invalidCatalog) delete tools[0].inputSchema;
      return json(response, 200, { jsonrpc: "2.0", id: payload.id, result: { tools } });
    }
    if (payload.method === "tools/call") {
      return json(response, 200, {
        jsonrpc: "2.0",
        id: payload.id,
        result: {
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
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export function pathOptionsFor(home, platform = "linux") {
  return {
    home,
    platform,
    env: platform === "win32"
      ? { USERPROFILE: home, APPDATA: `${home}/AppData/Roaming`, USERNAME: "FixtureUser" }
      : { HOME: home, XDG_CONFIG_HOME: `${home}/.config` },
  };
}

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
