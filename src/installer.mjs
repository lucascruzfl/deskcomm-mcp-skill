import { cp, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CLIENTS, DEFAULT_PROFILE, SCOPES, VERSION } from "./constants.mjs";
import { installCodexConfig, headerHelperCommand, uninstallCodexConfig } from "./config-codex.mjs";
import { claudeServerDefinition, installClaudeConfig, uninstallClaudeConfig } from "./config-claude.mjs";
import { loadCredential, saveCredential } from "./credentials.mjs";
import { atomicWrite, readJson, readText, removeIfExists } from "./fs-safe.mjs";
import {
  claudeConfigPath,
  codexConfigPath,
  credentialPath,
  runtimeDir,
  sanitizeProfile,
  serverName,
  skillInstallPath,
} from "./paths.mjs";
import { loadState, saveState, upsertInstallation } from "./state.mjs";
import { assertTokenIsolated, findProfile, loadProfiles, registerProfile, saveProfiles, unregisterProfile } from "./profiles.mjs";
import { normalizeMcpUrl } from "./url.mjs";
import { verifyConnection } from "./mcp-client.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function install(options) {
  const client = validateClient(options.client);
  const scope = validateScope(options.scope ?? "project");
  const profile = sanitizeProfile(options.profile ?? DEFAULT_PROFILE);
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const pathOptions = options.pathOptions ?? {};
  const oldCredential = await tryLoadCredential(profile, pathOptions);
  const catalog = await loadProfiles(pathOptions);
  const metadata = findProfile(catalog, profile);
  if (metadata && oldCredential && metadata.url !== oldCredential.url) {
    throw new Error("URL do perfil diverge da credencial; nenhuma conexão foi feita.");
  }
  const url = normalizeMcpUrl(options.url ?? oldCredential?.url);
  const token = options.token ?? oldCredential?.token;
  if (!token) throw new Error("Token MCP ausente. Use entrada interativa, stdin ou uma variável de ambiente.");
  await assertTokenIsolated(profile, token, pathOptions);
  let state = await loadState(pathOptions);
  const sameProfileInstallations = state.installations.filter((record) => record.profile === profile);
  if (oldCredential && (oldCredential.url !== url || oldCredential.token !== token) &&
      sameProfileInstallations.length > 1) {
    throw new Error("Este perfil é usado por várias instalações. Use profiles update para atualizar todas juntas.");
  }
  const verification = options.verify === false
    ? null
    : await verifyConnection({ url, token, fetchImpl: options.fetchImpl ?? fetch });
  const skillDir = skillInstallPath({ client, scope, projectRoot, ...pathOptions });
  const name = serverName(profile);
  const configFile = client === "codex"
    ? codexConfigPath({ scope, projectRoot, ...pathOptions })
    : claudeConfigPath({ scope, projectRoot, ...pathOptions });
  const managedRecord = state.installations.find((record) => sameInstallation(record, {
    client, scope, profile, project_root: scope === "project" ? projectRoot : null,
  }));
  const managed = Boolean(managedRecord);
  if (!managed && await configHasServer(client, configFile, name)) {
    throw new Error(`Já existe um servidor MCP chamado '${name}' que não foi criado por este instalador. Nada foi sobrescrito.`);
  }
  if (managed && !(await configIsManaged(client, configFile, name, credentialPath(pathOptions, profile), pathOptions, managedRecord.config_definition))) {
    throw new Error("A entrada MCP Deskcomm foi alterada fora do instalador. Configuração preservada.");
  }
  if (await exists(skillDir) && !(await isManagedSkill(skillDir))) {
    throw new Error("Já existe uma Skill Deskcomm não gerenciada neste destino. Arquivos preservados.");
  }
  const saved = await saveCredential({ profile, url, token, pathOptions });
  const runtime = await installRuntime(pathOptions);
  await installSkill(skillDir);

  let configDefinition;
  if (client === "codex") {
    const helperCommand = headerHelperCommand({
      nodePath: options.nodePath ?? process.execPath,
      helperPath: runtime.headerHelper,
      credentialFile: saved.file,
      platform: pathOptions.platform,
    });
    configDefinition = { url, helper_command: helperCommand };
    await installCodexConfig({ configFile, name, url, helperCommand });
  } else {
    configDefinition = claudeServerDefinition({
      nodePath: options.nodePath ?? process.execPath,
      bridgePath: runtime.bridge,
      credentialFile: saved.file,
    });
    await installClaudeConfig({
      configFile,
      name,
      definition: configDefinition,
    });
  }

  state = upsertInstallation(state, {
    client,
    scope,
    profile,
    server_name: name,
    project_root: scope === "project" ? projectRoot : null,
    config_file: configFile,
    skill_dir: skillDir,
    credential_file: saved.file,
    config_definition: configDefinition,
    installed_version: VERSION,
  });
  await saveState(state, pathOptions);
  await registerProfile({ name: options.profileName ?? profile, url, pathOptions, preferName: !oldCredential });
  return { client, scope, profile, url, configFile, skillDir, credentialFile: saved.file, protection: saved.protection, verification };
}

export async function reconfigureProfile({ profile, url, token, pathOptions = {}, fetchImpl = fetch }) {
  const id = sanitizeProfile(profile);
  const catalog = await loadProfiles(pathOptions);
  const record = findProfile(catalog, id);
  if (!record) throw new Error(`Perfil '${id}' não existe.`);
  const previous = await loadCredential({ profile: id, pathOptions });
  if (previous.url !== record.url) throw new Error("URL do perfil diverge da credencial; corrija antes de atualizar.");
  const nextUrl = normalizeMcpUrl(url ?? previous.url);
  const nextToken = token ?? previous.token;
  await assertTokenIsolated(id, nextToken, pathOptions);
  const verification = await verifyConnection({ url: nextUrl, token: nextToken, fetchImpl });
  const state = await loadState(pathOptions);
  const installations = state.installations.filter((item) => item.profile === id);
  for (const item of installations) {
    if (!(await configIsManaged(item.client, item.config_file, item.server_name, item.credential_file, pathOptions, item.config_definition))) {
      throw new Error(`Configuração MCP divergente para ${item.client}/${item.scope}. Nada foi alterado.`);
    }
  }
  const codexChanges = installations.filter((value) => value.client === "codex" && value.config_definition?.url !== nextUrl);
  const originalConfigs = await Promise.all(codexChanges.map(async (item) => ({
    file: item.config_file, content: await readText(item.config_file, ""),
  })));
  const updated = state.installations.map((item) => {
    if (item.profile !== id || item.client !== "codex") return item;
    return { ...item, config_definition: { ...item.config_definition, url: nextUrl } };
  });
  await saveCredential({ profile: id, url: nextUrl, token: nextToken, pathOptions });
  try {
    for (const item of codexChanges) {
      await installCodexConfig({
        configFile: item.config_file, name: item.server_name, url: nextUrl,
        helperCommand: item.config_definition.helper_command,
      });
    }
    await saveState({ ...state, installations: updated }, pathOptions);
    await registerProfile({ name: record.name, url: nextUrl, pathOptions });
  } catch (error) {
    const restored = await Promise.allSettled([
      saveCredential({ profile: id, url: previous.url, token: previous.token, pathOptions }),
      ...originalConfigs.map((item) => atomicWrite(item.file, item.content, { mode: 0o600, backup: false })),
      saveState(state, pathOptions),
      saveProfiles(catalog, pathOptions),
    ]);
    if (restored.some((item) => item.status === "rejected")) {
      throw new Error("Falha ao atualizar perfil; recuperação incompleta. Rode doctor antes de usar esta conexão.");
    }
    throw error;
  }
  return { profile: id, url: nextUrl, verification, installations: installations.length };
}

export async function updateInstallations({ pathOptions = {}, fetchImpl = fetch } = {}) {
  const state = await loadState(pathOptions);
  for (const record of state.installations) {
    const credential = await loadCredential({ profile: record.profile, pathOptions });
    await verifyConnection({ url: credential.url, token: credential.token, fetchImpl });
    if (!(await isManagedSkill(record.skill_dir))) {
      throw new Error(`Skill não gerenciada ou ausente: ${record.skill_dir}. Update interrompido.`);
    }
    if (!(await configIsManaged(record.client, record.config_file, record.server_name, record.credential_file, pathOptions, record.config_definition))) {
      throw new Error(`Configuração MCP alterada: ${record.config_file}. Update interrompido.`);
    }
  }
  await installRuntime(pathOptions);
  for (const record of state.installations) await installSkill(record.skill_dir);
  await saveState({ ...state, installations: state.installations.map((record) => ({ ...record, installed_version: VERSION })) }, pathOptions);
  return { updated: state.installations.length, version: VERSION };
}

export async function uninstall(options) {
  const client = validateClient(options.client);
  const scope = validateScope(options.scope ?? "project");
  const profile = sanitizeProfile(options.profile ?? DEFAULT_PROFILE);
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const pathOptions = options.pathOptions ?? {};
  const name = serverName(profile);
  const state = await loadState(pathOptions);
  const managedRecord = state.installations.find((record) => sameInstallation(record, {
    client, scope, profile, project_root: scope === "project" ? projectRoot : null,
  }));
  if (!managedRecord) return { removedConfig: false, removedSkill: false, removedCredential: false };
  const configFile = managedRecord.config_file;
  const configManaged = await configIsManaged(client, configFile, name, managedRecord.credential_file, pathOptions, managedRecord.config_definition);
  const removedConfig = !configManaged ? false : client === "codex"
    ? await uninstallCodexConfig({ configFile, name })
    : await uninstallClaudeConfig({ configFile, name });
  const skillDir = managedRecord.skill_dir;
  const installations = state.installations.filter((record) => !(
    record.client === client && record.scope === scope && record.profile === profile &&
    (scope !== "project" || record.project_root === projectRoot)
  ));
  const hadManagedSkill = await isManagedSkill(skillDir) &&
    !installations.some((record) => record.skill_dir === skillDir);
  if (hadManagedSkill) await removeIfExists(skillDir);
  await saveState({ ...state, installations }, pathOptions);
  let removedCredential = false;
  if (options.removeCredential && !installations.some((record) => record.profile === profile) && configManaged) {
    const catalog = await loadProfiles(pathOptions);
    if (findProfile(catalog, profile)) await unregisterProfile(profile, pathOptions);
    await removeIfExists(credentialPath(pathOptions, profile));
    removedCredential = true;
  }
  return { removedConfig, removedSkill: hadManagedSkill, removedCredential };
}

export async function installationStatus({ client, scope = "project", profile = DEFAULT_PROFILE, projectRoot, pathOptions = {} }) {
  const cleanProfile = sanitizeProfile(profile);
  const root = path.resolve(projectRoot ?? process.cwd());
  const configFile = client === "codex"
    ? codexConfigPath({ scope, projectRoot: root, ...pathOptions })
    : claudeConfigPath({ scope, projectRoot: root, ...pathOptions });
  const name = serverName(cleanProfile);
  const skillDir = skillInstallPath({ client, scope, projectRoot: root, ...pathOptions });
  const credentialFile = credentialPath(pathOptions, cleanProfile);
  const config = client === "codex" ? await readText(configFile, "") : await readJson(configFile, {});
  const occurrences = client === "codex"
    ? config.split(`[mcp_servers.${name}]`).length - 1
    : (config?.mcpServers?.[name] ? 1 : 0);
  const state = await loadState(pathOptions);
  const record = state.installations.find((item) => sameInstallation(item, {
    client, scope, profile: cleanProfile, project_root: scope === "project" ? root : null,
  }));
  return {
    configFile,
    serverName: name,
    occurrences,
    skillInstalled: await isManagedSkill(skillDir),
    credential: await tryLoadCredential(cleanProfile, pathOptions),
    skillDir,
    credentialFile,
    configManaged: Boolean(record) && await configIsManaged(client, configFile, name, credentialFile, pathOptions, record.config_definition),
  };
}

async function installRuntime(pathOptions) {
  const target = runtimeDir(pathOptions);
  await mkdir(target, { recursive: true, mode: 0o700 });
  const headerHelper = path.join(target, "header-helper.mjs");
  const bridge = path.join(target, "bridge.mjs");
  await cp(path.join(packageRoot, "runtime", "header-helper.mjs"), headerHelper);
  await cp(path.join(packageRoot, "runtime", "bridge.mjs"), bridge);
  return { headerHelper, bridge };
}

async function installSkill(target) {
  if (await isManagedSkill(target)) {
    await removeIfExists(path.join(target, "references"));
    await removeIfExists(path.join(target, "agents"));
  }
  await mkdir(target, { recursive: true, mode: 0o700 });
  const source = path.join(packageRoot, "skills", "deskcomm");
  await cp(path.join(source, "SKILL.md"), path.join(target, "SKILL.md"));
  await cp(path.join(source, "references"), path.join(target, "references"), { recursive: true, force: true });
  await cp(path.join(source, "agents"), path.join(target, "agents"), { recursive: true, force: true });
  await atomicWrite(
    path.join(target, ".deskcomm-mcp-skill.json"),
    `${JSON.stringify({ managed_by: "deskcomm-mcp-skill", version: VERSION })}\n`,
    { mode: 0o600, backup: false },
  );
}

async function isManagedSkill(target) {
  try {
    const marker = JSON.parse(await readFile(path.join(target, ".deskcomm-mcp-skill.json"), "utf8"));
    return marker.managed_by === "deskcomm-mcp-skill";
  } catch {
    return false;
  }
}

async function tryLoadCredential(profile, pathOptions) {
  try {
    return await loadCredential({ profile, pathOptions });
  } catch {
    return null;
  }
}

function validateClient(client) {
  if (!CLIENTS.has(client)) throw new Error("Cliente inválido. Use codex ou claude.");
  return client;
}

function validateScope(scope) {
  if (!SCOPES.has(scope)) throw new Error("Escopo inválido. Use project ou global.");
  return scope;
}

async function configHasServer(client, configFile, name) {
  if (client === "codex") {
    const content = await readText(configFile, "");
    return content.includes(`[mcp_servers.${name}]`);
  }
  const content = await readJson(configFile, {});
  return Boolean(content?.mcpServers?.[name]);
}

async function configIsManaged(client, configFile, name, credentialFile, pathOptions, expected) {
  if (client === "codex") {
    const content = await readText(configFile, "");
    const marker = `# managed by deskcomm-mcp-skill: ${name}\n[mcp_servers.${name}]`;
    if (!content.includes(marker)) return false;
    return !expected || content.includes(`${marker}\nurl = ${JSON.stringify(expected.url)}\nhttp_headers_helper = ${JSON.stringify(expected.helper_command)}\n`);
  }
  const content = await readJson(configFile, {});
  const server = content?.mcpServers?.[name];
  if (expected) return JSON.stringify(server) === JSON.stringify(expected);
  return server?.type === "stdio" && server?.args?.[0] === path.join(runtimeDir(pathOptions), "bridge.mjs") &&
    server?.args?.[1] === "--credential" && server?.args?.[2] === credentialFile;
}

async function exists(target) {
  try { await stat(target); return true; } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function sameInstallation(record, target) {
  return record.client === target.client && record.scope === target.scope &&
    record.profile === target.profile &&
    (target.scope !== "project" || record.project_root === target.project_root);
}
