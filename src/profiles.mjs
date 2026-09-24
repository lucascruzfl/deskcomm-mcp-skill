import { readdir } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_PROFILE } from "./constants.mjs";
import { atomicWrite, readJson } from "./fs-safe.mjs";
import { configRoot, credentialPath, profilesPath, sanitizeProfile } from "./paths.mjs";
import { normalizeMcpUrl } from "./url.mjs";

export async function loadProfiles(pathOptions = {}) {
  const stored = await readJson(profilesPath(pathOptions), null);
  if (stored !== null) return validateCatalog(stored);
  const profiles = [];
  for (const id of await listCredentialIds(pathOptions)) {
    const credential = await readJson(credentialPath(pathOptions, id), null);
    if (!credential || typeof credential.url !== "string") continue;
    profiles.push({ id, name: id, url: credential.url, credential_ref: id });
  }
  return validateCatalog({
    schema_version: 1,
    default_profile: profiles.find((item) => item.id === DEFAULT_PROFILE)?.id ??
      (profiles.length === 1 ? profiles[0].id : null),
    profiles,
  });
}

export async function saveProfiles(catalog, pathOptions = {}) {
  const valid = validateCatalog(catalog);
  await atomicWrite(profilesPath(pathOptions), `${JSON.stringify(valid, null, 2)}\n`, {
    mode: 0o600, backup: false,
  });
  return valid;
}

export async function listCredentialIds(pathOptions = {}) {
  const paths = pathOptions.platform === "win32" ? path.win32 : path;
  const directory = paths.join(configRoot(pathOptions), "profiles");
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return entries.filter((entry) => entry.isFile() && /^[a-z0-9_-]+\.json$/.test(entry.name))
    .map((entry) => entry.name.slice(0, -5));
}

export async function assertTokenIsolated(profile, token, pathOptions = {}) {
  const id = sanitizeProfile(profile);
  for (const otherId of await listCredentialIds(pathOptions)) {
    if (otherId === id) continue;
    const other = await readJson(credentialPath(pathOptions, otherId), null);
    if (other?.token === token) {
      throw new Error(`Token já está associado ao perfil '${otherId}'. Use um token próprio para cada cliente.`);
    }
  }
}

export function findProfile(catalog, name) {
  const id = sanitizeProfile(name);
  return catalog.profiles.find((item) => item.id === id) ?? null;
}

export function displayName(value) {
  const name = String(value ?? "").trim();
  if (!name || name.length > 80 || /[\x00-\x1f\x7f]/.test(name) || /^dsk_[A-Za-z0-9_-]{12,}$/.test(name)) {
    throw new Error("Nome de perfil inválido. Use um nome de cliente, nunca um token.");
  }
  return name;
}

export async function registerProfile({ name, url, pathOptions = {}, mustBeNew = false, preferName = false }) {
  const safeName = displayName(name);
  const id = sanitizeProfile(name);
  const normalizedUrl = normalizeMcpUrl(url);
  const catalog = await loadProfiles(pathOptions);
  const existing = catalog.profiles.find((item) => item.id === id);
  if (mustBeNew && existing) throw new Error(`Perfil '${id}' já existe. Use profiles update para alterá-lo.`);
  const record = {
    id,
    name: preferName ? safeName : existing?.name ?? safeName,
    url: normalizedUrl,
    credential_ref: id,
  };
  const profiles = existing
    ? catalog.profiles.map((item) => item.id === id ? record : item)
    : [...catalog.profiles, record];
  await saveProfiles({
    ...catalog,
    profiles,
    default_profile: catalog.default_profile ?? (profiles.length === 1 ? id : null),
  }, pathOptions);
  return record;
}

export async function setDefaultProfile(name, pathOptions = {}) {
  const catalog = await loadProfiles(pathOptions);
  const record = findProfile(catalog, name);
  if (!record) throw new Error(`Perfil '${sanitizeProfile(name)}' não existe.`);
  await saveProfiles({ ...catalog, default_profile: record.id }, pathOptions);
  return record;
}

export async function unregisterProfile(name, pathOptions = {}) {
  const catalog = await loadProfiles(pathOptions);
  const record = findProfile(catalog, name);
  if (!record) throw new Error(`Perfil '${sanitizeProfile(name)}' não existe.`);
  await saveProfiles({
    ...catalog,
    default_profile: catalog.default_profile === record.id ? null : catalog.default_profile,
    profiles: catalog.profiles.filter((item) => item.id !== record.id),
  }, pathOptions);
  return record;
}

export function validateCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.profiles)) throw new Error("Catálogo de perfis inválido.");
  if (Object.keys(catalog).some((key) => !["schema_version", "default_profile", "profiles"].includes(key))) {
    throw new Error("Catálogo de perfis contém campos não permitidos.");
  }
  const ids = new Set();
  for (const record of catalog.profiles) {
    if (record && Object.keys(record).some((key) => !["id", "name", "url", "credential_ref"].includes(key))) {
      throw new Error("Perfil contém campos não permitidos; nenhum segredo foi exibido.");
    }
    if (!record || typeof record.id !== "string" || sanitizeProfile(record.id) !== record.id ||
        typeof record.name !== "string" || !record.name.trim() ||
        typeof record.url !== "string" || record.credential_ref !== record.id) {
      throw new Error("Catálogo de perfis contém metadata inválida.");
    }
    try { displayName(record.name); } catch { throw new Error("Catálogo de perfis contém nome inválido."); }
    try {
      if (normalizeMcpUrl(record.url) !== record.url) throw new Error();
    } catch {
      throw new Error("Catálogo de perfis contém URL inválida ou insegura.");
    }
    if (ids.has(record.id)) throw new Error(`Perfil duplicado: ${record.id}.`);
    ids.add(record.id);
  }
  if (catalog.default_profile !== null && catalog.default_profile !== undefined &&
      !ids.has(catalog.default_profile)) throw new Error("Perfil padrão inexistente no catálogo.");
  return {
    schema_version: 1,
    default_profile: catalog.default_profile ?? null,
    profiles: catalog.profiles.map((record) => ({
      id: record.id, name: record.name, url: record.url, credential_ref: record.credential_ref,
    })),
  };
}
