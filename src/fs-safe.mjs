import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readText(file, fallback = "") {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function readJson(file, fallback) {
  const raw = await readText(file, "");
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Configuração JSON inválida em ${file}. O arquivo foi preservado.`);
  }
}

export async function atomicWrite(file, content, { mode = 0o600, backup = true } = {}) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const existing = await readText(file, null);
  if (backup && existing !== null) await copyFile(file, `${file}.bak`);
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, { encoding: "utf8", mode });
  await chmod(temporary, mode).catch(() => {});
  await rename(temporary, file);
  await chmod(file, mode).catch(() => {});
}

export async function removeIfExists(target) {
  await rm(target, { recursive: true, force: true });
}
