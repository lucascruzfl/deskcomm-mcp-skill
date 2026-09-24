import path from "node:path";
import os from "node:os";

import { DEFAULT_PROFILE, SKILL_NAME } from "./constants.mjs";

export function sanitizeProfile(value = DEFAULT_PROFILE) {
  const normalized = String(value).trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const clean = normalized.replace(/^-+|-+$/g, "");
  if (!clean || clean.length > 48) {
    throw new Error("Perfil inválido: use letras, números, hífen ou sublinhado (até 48 caracteres).");
  }
  return clean;
}

export function configRoot({ platform = process.platform, env = process.env, home } = {}) {
  const userHome = home ?? (platform === "win32" ? env.USERPROFILE : env.HOME) ?? os.homedir();
  if (!userHome) throw new Error("Não foi possível determinar o diretório do usuário.");
  const paths = platform === "win32" ? path.win32 : path;
  if (platform === "win32") {
    return paths.join(env.APPDATA ?? paths.join(userHome, "AppData", "Roaming"), "DeskcommMCP");
  }
  return paths.join(env.XDG_CONFIG_HOME ?? paths.join(userHome, ".config"), "deskcomm-mcp");
}

export function credentialPath(options = {}, profile = DEFAULT_PROFILE) {
  return (options.platform === "win32" ? path.win32 : path).join(configRoot(options), "profiles", `${sanitizeProfile(profile)}.json`);
}

export function statePath(options = {}) {
  return (options.platform === "win32" ? path.win32 : path).join(configRoot(options), "state.json");
}

export function profilesPath(options = {}) {
  return (options.platform === "win32" ? path.win32 : path).join(configRoot(options), "profiles.json");
}

export function runtimeDir(options = {}) {
  return (options.platform === "win32" ? path.win32 : path).join(configRoot(options), "runtime");
}

export function codexConfigPath({ scope, projectRoot, env = process.env, home, platform = process.platform } = {}) {
  const paths = platform === "win32" ? path.win32 : path;
  if (scope === "project") return paths.join(projectRoot ?? process.cwd(), ".codex", "config.toml");
  const userHome = home ?? (platform === "win32" ? env.USERPROFILE : env.HOME) ?? os.homedir();
  return paths.join(env.CODEX_HOME ?? paths.join(userHome, ".codex"), "config.toml");
}

export function claudeConfigPath({ scope, projectRoot, env = process.env, home, platform = process.platform } = {}) {
  const paths = platform === "win32" ? path.win32 : path;
  if (scope === "project") return paths.join(projectRoot ?? process.cwd(), ".mcp.json");
  const userHome = home ?? (platform === "win32" ? env.USERPROFILE : env.HOME) ?? os.homedir();
  return paths.join(userHome, ".claude.json");
}

export function skillInstallPath({ client, scope, projectRoot, env = process.env, home, platform = process.platform } = {}) {
  const paths = platform === "win32" ? path.win32 : path;
  const userHome = home ?? (platform === "win32" ? env.USERPROFILE : env.HOME) ?? os.homedir();
  if (scope === "project") {
    const base = client === "codex" ? ".agents" : ".claude";
    return paths.join(projectRoot ?? process.cwd(), base, "skills", SKILL_NAME);
  }
  const base = client === "codex" ? ".agents" : ".claude";
  return paths.join(userHome, base, "skills", SKILL_NAME);
}

export function serverName(profile = DEFAULT_PROFILE) {
  const clean = sanitizeProfile(profile);
  return clean === DEFAULT_PROFILE ? "deskcomm" : `deskcomm-${clean}`;
}
