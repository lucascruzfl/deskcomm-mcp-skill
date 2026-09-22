import { VERSION } from "./constants.mjs";
import { atomicWrite, readJson } from "./fs-safe.mjs";
import { statePath } from "./paths.mjs";

export async function loadState(pathOptions = {}) {
  return readJson(statePath(pathOptions), { installer_version: VERSION, installations: [] });
}

export async function saveState(state, pathOptions = {}) {
  await atomicWrite(
    statePath(pathOptions),
    `${JSON.stringify({ ...state, installer_version: VERSION }, null, 2)}\n`,
    { mode: 0o600, backup: false },
  );
}

export function installationKey(record) {
  return [record.client, record.scope, record.project_root ?? "", record.profile].join("|");
}

export function upsertInstallation(state, record) {
  const key = installationKey(record);
  return {
    ...state,
    installations: [...state.installations.filter((item) => installationKey(item) !== key), record],
  };
}
