import { loadCredential, saveCredential } from "./credentials.mjs";
import { removeIfExists } from "./fs-safe.mjs";
import { installationStatus, uninstall } from "./installer.mjs";
import { verifyConnection } from "./mcp-client.mjs";
import { credentialPath, sanitizeProfile } from "./paths.mjs";
import { assertTokenIsolated, displayName, findProfile, loadProfiles, saveProfiles, unregisterProfile } from "./profiles.mjs";
import { loadState } from "./state.mjs";
import { normalizeMcpUrl } from "./url.mjs";

export async function addProfile({ name, url, token, pathOptions = {}, fetchImpl = fetch }) {
  const safeName = displayName(name);
  const id = sanitizeProfile(name);
  const catalog = await loadProfiles(pathOptions);
  if (findProfile(catalog, id)) throw new Error(`Perfil '${id}' já existe. Use profiles update.`);
  const endpoint = normalizeMcpUrl(url);
  await assertTokenIsolated(id, token, pathOptions);
  const verification = await verifyConnection({ url: endpoint, token, fetchImpl });
  await saveCredential({ profile: id, url: endpoint, token, pathOptions });
  const record = { id, name: safeName, url: endpoint, credential_ref: id };
  await saveProfiles({
    ...catalog,
    profiles: [...catalog.profiles, record],
    default_profile: catalog.default_profile ?? (catalog.profiles.length === 0 ? id : null),
  }, pathOptions);
  return { ...record, verification };
}

export async function listProfiles(pathOptions = {}) {
  const catalog = await loadProfiles(pathOptions);
  const state = await loadState(pathOptions);
  return {
    default_profile: catalog.default_profile,
    profiles: catalog.profiles.map((item) => ({
      ...item,
      installations: state.installations.filter((record) => record.profile === item.id)
        .map((record) => ({ client: record.client, scope: record.scope, project_root: record.project_root })),
    })),
  };
}

export async function showProfile(name, pathOptions = {}) {
  const listing = await listProfiles(pathOptions);
  const profile = findProfile(listing, name);
  if (!profile) throw new Error(`Perfil '${sanitizeProfile(name)}' não existe.`);
  return { ...profile, is_default: listing.default_profile === profile.id };
}

export async function verifyAllProfiles({ pathOptions = {}, fetchImpl = fetch } = {}) {
  const catalog = await loadProfiles(pathOptions);
  const results = [];
  for (const profile of catalog.profiles) {
    try {
      const credential = await loadCredential({ profile: profile.id, pathOptions });
      if (credential.url !== profile.url) throw new Error("URL do perfil diverge da credencial; nenhuma conexão foi feita.");
      const verified = await verifyConnection({ url: credential.url, token: credential.token, fetchImpl });
      results.push({ profile: profile.id, endpoint: profile.url, ok: true, tool_count: verified.tool_count,
        duplicates: verified.duplicate_count, schemas_ok: verified.schemas_ok });
    } catch (error) {
      results.push({ profile: profile.id, endpoint: profile.url, ok: false, error: error.message });
    }
  }
  return results;
}

export async function removeProfile({ name, deleteCredential = false, pathOptions = {} }) {
  const id = sanitizeProfile(name);
  const catalog = await loadProfiles(pathOptions);
  if (!findProfile(catalog, id)) throw new Error(`Perfil '${id}' não existe.`);
  const state = await loadState(pathOptions);
  const installations = state.installations.filter((record) => record.profile === id);
  for (const record of installations) {
    const status = await installationStatus({
      client: record.client, scope: record.scope, profile: id,
      projectRoot: record.project_root ?? process.cwd(), pathOptions,
    });
    if (!status.configManaged) {
      throw new Error(`Configuração MCP divergente em ${record.client}/${record.scope}; perfil preservado.`);
    }
  }
  for (const record of installations) {
    await uninstall({
      client: record.client, scope: record.scope, profile: id,
      projectRoot: record.project_root ?? process.cwd(), pathOptions,
      removeCredential: false,
    });
  }
  await unregisterProfile(id, pathOptions);
  if (deleteCredential) await removeIfExists(credentialPath(pathOptions, id));
  return { profile: id, removed_installations: installations.length, removed_credential: deleteCredential };
}
