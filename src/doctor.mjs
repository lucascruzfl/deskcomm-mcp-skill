import { spawnSync } from "node:child_process";

import { credentialMode } from "./credentials.mjs";
import { installationStatus } from "./installer.mjs";
import { verifyConnection } from "./mcp-client.mjs";
import { normalizeMcpUrl } from "./url.mjs";

export async function doctor(options) {
  const status = await installationStatus(options);
  const checks = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push(check("node", nodeMajor >= 20, `Node ${process.versions.node}`));
  const clientCommand = options.client === "claude" ? "claude" : "codex";
  const clientAvailable = commandExists(clientCommand, options.env, options.pathOptions?.platform);
  checks.push({ ...check("client", clientAvailable,
    `${clientCommand} ${clientAvailable ? "disponível" : "ausente"} no PATH`), optional: true });
  checks.push(check("config", status.occurrences === 1,
    status.occurrences === 1 ? status.configFile : `${status.occurrences} entradas encontradas`));
  checks.push(check("duplicate_config", status.occurrences <= 1,
    status.occurrences > 1 ? "Configuração duplicada" : "sem duplicidade"));
  checks.push(check("config_managed", status.configManaged, status.configManaged ? "entrada Deskcomm gerenciada" : "ausente ou alterada fora do instalador"));
  checks.push(check("skill", status.skillInstalled, status.skillDir));
  checks.push(check("credential", Boolean(status.credential), status.credentialFile));

  if (status.credential) {
    let urlOk = false;
    try { urlOk = normalizeMcpUrl(status.credential.url) === status.credential.url; } catch { /* diagnostic below */ }
    checks.push(check("url_https_endpoint", urlOk, urlOk ? "URL MCP válida" : "URL MCP inválida ou insegura"));
    const mode = await credentialMode(status.credentialFile);
    const windows = (options.pathOptions?.platform ?? process.platform) === "win32";
    const permissionOk = windows ? true : mode === 0o600;
    checks.push(check("credential_permissions", permissionOk,
      windows ? "ACL deve ser conferida com icacls" : `modo ${mode?.toString(8) ?? "ausente"}`));
    try {
      if (!urlOk) throw new Error("URL MCP inválida ou insegura.");
      const connection = await verifyConnection({
        url: status.credential.url,
        token: status.credential.token,
        fetchImpl: options.fetchImpl ?? fetch,
      });
      checks.push(check("connection", true, `tools/list: ${connection.tool_count}`));
      checks.push(check("schemas", connection.schemas_ok, "name, description e inputSchema válidos; duplicatas: 0"));
    } catch (error) {
      checks.push(check("connection", false, error.message));
    }
  }
  return { ok: checks.every((item) => item.ok || item.optional), checks, status };
}

function commandExists(command, env = process.env, platform = process.platform) {
  const probe = platform === "win32" ? "where" : "sh";
  const args = platform === "win32" ? [command] : ["-lc", `command -v ${command}`];
  return spawnSync(probe, args, { stdio: "ignore", env, windowsHide: true }).status === 0;
}

function check(name, ok, detail) {
  return { name, ok, detail };
}
