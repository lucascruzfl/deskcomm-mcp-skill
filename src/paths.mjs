import path from "node:path";

import { DEFAULT_PROFILE, SKILL_NAME } from "./constants.mjs";

export function sanitizeProfile(value = DEFAULT_PROFILE) {
  const normalized = String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const clean = normalized.replace(/^-+|-+$/g, "");
  if (!clean || clean.length > 48) {
    throw new Error("Perfil inválido: use letras, números, hífen ou sublinhado (até 48 caracteres).");
  }
  return clean;
}

export function configRoot({ platform = process.platform, env = process.env, home } = {}) {
  const userHome = home ?? env.HOME ?? env.USERPROFILE;
  if (!userHome) throw new Error("Não foi possível determinar o diretório do usuário.");
  if (platform === "win32") {
    return path.join(env.APPDATA ?? path.join(userHome, "AppData", "Roaming"), "DeskcommMCP");
  }
  return path.join(env.XDG_CONFIG_HOME ?? path.join(userHome, ".config"), "deskcomm-mcp");
}

export function credentialPath(options = {}, profile = DEFAULT_PROFILE) {
  return path.join(configRoot(options), "profiles", `${sanitizeProfile(profile)}.json`);
}

export function statePath(options = {}) {
  return path.join(configRoot(options), "state.json");
}

export function runtimeDir(options = {}) {
  return path.join(configRoot(options), "runtime");
}

export function codexConfigPath({ scope, projectRoot, env = process.env, home } = {}) {
  if (scope === "project") return path.join(projectRoot ?? process.cwd(), ".codex", "config.toml");
  const userHome = home ?? env.HOME ?? env.USERPROFILE;
  return path.join(env.CODEX_HOME ?? path.join(userHome, ".codex"), "config.toml");
}

export function claudeConfigPath({ scope, projectRoot, env = process.env, home } = {}) {
  if (scope === "project") return path.join(projectRoot ?? process.cwd(), ".mcp.json");
  const userHome = home ?? env.HOME ?? env.USERPROFILE;
  return path.join(userHome, ".claude.json");
}

export function skillInstallPath({ client, scope, projectRoot, env = process.env, home } = {}) {
  const userHome = home ?? env.HOME ?? env.USERPROFILE;
  if (scope === "project") {
    const base = client === "codex" ? ".agents" : ".claude";
    return path.join(projectRoot ?? process.cwd(), base, "skills", SKILL_NAME);
  }
  const base = client === "codex" ? ".agents" : ".claude";
  return path.join(userHome, base, "skills", SKILL_NAME);
}

export function serverName(profile = DEFAULT_PROFILE) {
  const clean = sanitizeProfile(profile);
  return clean === DEFAULT_PROFILE ? "deskcomm" : `deskcomm-${clean}`;
}
