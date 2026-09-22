import { atomicWrite, readJson } from "./fs-safe.mjs";

export function claudeServerDefinition({ nodePath, bridgePath, credentialFile }) {
  return {
    type: "stdio",
    command: nodePath,
    args: [bridgePath, "--credential", credentialFile],
    env: {},
  };
}

export async function installClaudeConfig({ configFile, name, definition }) {
  const current = await readJson(configFile, {});
  const servers = isObject(current.mcpServers) ? current.mcpServers : {};
  const next = { ...current, mcpServers: { ...servers, [name]: definition } };
  await atomicWrite(configFile, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
    backup: Object.keys(current).length > 0,
  });
}

export async function uninstallClaudeConfig({ configFile, name }) {
  const current = await readJson(configFile, null);
  if (!current || !isObject(current.mcpServers) || !(name in current.mcpServers)) return false;
  const { [name]: _removed, ...remaining } = current.mcpServers;
  const next = { ...current, mcpServers: remaining };
  await atomicWrite(configFile, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, backup: true });
  return true;
}

export function countClaudeServer(config, name) {
  return isObject(config?.mcpServers) && name in config.mcpServers ? 1 : 0;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
