import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import { credentialMode } from "./credentials.mjs";
import { installationStatus } from "./installer.mjs";
import { verifyConnection } from "./mcp-client.mjs";

export async function doctor(options) {
  const status = await installationStatus(options);
  const checks = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push(check("node", nodeMajor >= 20, `Node ${process.versions.node}`));
  checks.push(check("client", commandExists(options.client === "claude" ? "claude" : "codex", options.env),
    options.client === "claude" ? "Claude Code CLI" : "Codex CLI"));
  checks.push(check("config", status.occurrences === 1,
    status.occurrences === 1 ? status.configFile : `${status.occurrences} entradas encontradas`));
  checks.push(check("duplicate_config", status.occurrences <= 1,
    status.occurrences > 1 ? "Configuração duplicada" : "sem duplicidade"));
  checks.push(check("skill", status.skillInstalled, status.skillDir));
  checks.push(check("credential", Boolean(status.credential), status.credentialFile));

  if (status.credential) {
    const mode = await credentialMode(status.credentialFile);
    const permissionOk = process.platform === "win32" ? true : mode === 0o600;
    checks.push(check("credential_permissions", permissionOk,
      process.platform === "win32" ? "ACL deve ser conferida com icacls" : `modo ${mode?.toString(8) ?? "ausente"}`));
    try {
      const connection = await verifyConnection({
        url: status.credential.url,
        token: status.credential.token,
        fetchImpl: options.fetchImpl ?? fetch,
      });
      checks.push(check("connection", true, `tools/list: ${connection.tool_count}`));
      if (connection.missing_essential_hints.length) {
        checks.push(check("operational_hints", true,
          `aviso: ${connection.missing_essential_hints.length} ferramentas operacionais esperadas não estão visíveis para este token`));
      }
    } catch (error) {
      checks.push(check("connection", false, error.message));
    }
  }
  return { ok: checks.every((item) => item.ok || item.name === "client" || item.name === "operational_hints"), checks, status };
}

function commandExists(command, env = process.env) {
  const probe = process.platform === "win32" ? "where" : "sh";
  const args = process.platform === "win32" ? [command] : ["-lc", `command -v ${command}`];
  return spawnSync(probe, args, { stdio: "ignore", env, windowsHide: true }).status === 0;
}

function check(name, ok, detail) {
  return { name, ok, detail };
}
