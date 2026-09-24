import { chmod, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { VERSION } from "./constants.mjs";
import { atomicWrite, readJson } from "./fs-safe.mjs";
import { credentialPath } from "./paths.mjs";

export async function saveCredential({ profile, url, token, pathOptions = {} }) {
  if (!/^dsk_[^\s]+$/.test(String(token ?? ""))) {
    throw new Error("Token MCP inválido: o valor deve começar com dsk_.");
  }
  const file = credentialPath(pathOptions, profile);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const candidate = `${file}.candidate-${process.pid}-${Date.now()}`;
  await atomicWrite(
    candidate,
    `${JSON.stringify({ profile, url, token, installer_version: VERSION }, null, 2)}\n`,
    { mode: 0o600, backup: false },
  );
  const protection = await protectCredential(candidate, pathOptions.platform ?? process.platform, pathOptions.env ?? process.env);
  if (!protection.ok) {
    await rm(candidate, { force: true });
    throw new Error("Não foi possível proteger a credencial no sistema. Instalação interrompida.");
  }
  await rename(candidate, file);
  return { file, protection };
}

export async function loadCredential({ profile, pathOptions = {} }) {
  const file = credentialPath(pathOptions, profile);
  const value = await readJson(file, null);
  if (!value || typeof value.url !== "string" || typeof value.token !== "string") {
    throw new Error(`Credencial do perfil '${profile}' não foi encontrada ou está inválida.`);
  }
  return { ...value, file };
}

export async function credentialMode(file) {
  const { stat } = await import("node:fs/promises");
  try {
    const info = await stat(file);
    return info.mode & 0o777;
  } catch {
    return null;
  }
}

async function protectCredential(file, platform, env) {
  if (platform !== "win32") {
    await chmod(file, 0o600);
    return { ok: true, method: "chmod-0600" };
  }
  const user = env.USERNAME;
  if (!user) return { ok: false, method: "windows-acl", warning: "USERNAME não disponível para restringir ACL." };
  const result = spawnSync("icacls", [file, "/inheritance:r", "/grant:r", `${user}:(R,W)`], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0
    ? { ok: true, method: "windows-icacls" }
    : { ok: false, method: "windows-acl", warning: "Não foi possível confirmar a ACL restrita com icacls." };
}
