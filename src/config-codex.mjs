import { atomicWrite, readText } from "./fs-safe.mjs";
import { MANAGED_COMMENT } from "./constants.mjs";

function escapeCommandArg(value, platform = process.platform) {
  const text = String(value);
  if (platform === "win32") {
    return `"${text.replace(/(\\*)"/g, (_, slashes) => `${slashes}${slashes}\\\"`).replace(/(\\+)$/, "$1$1")}"`;
  }
  return `'${text.replace(/'/g, `'"'"'`)}'`;
}

export function headerHelperCommand({ nodePath, helperPath, credentialFile, platform = process.platform }) {
  return [nodePath, helperPath, "--credential", credentialFile]
    .map((value) => escapeCommandArg(value, platform))
    .join(" ");
}

function sectionRange(content, section) {
  const lines = content.split(/(?<=\n)/);
  const target = `[${section}]`;
  let start = -1;
  let end = content.length;
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed === target) start = offset;
    else if (start >= 0 && trimmed.startsWith("[") && !trimmed.startsWith(`[${section}.`)) {
      end = offset;
      break;
    }
    offset += lines[index].length;
  }
  return start < 0 ? null : [start, end];
}

export function upsertCodexServer(content, { name, url, helperCommand }) {
  const section = `mcp_servers.${name}`;
  const marker = `# ${MANAGED_COMMENT}: ${name}`;
  const block = `${marker}\n[${section}]\nurl = ${JSON.stringify(url)}\nhttp_headers_helper = ${JSON.stringify(helperCommand)}\n`;
  const range = sectionRange(content, section);
  let removeStart = range?.[0] ?? -1;
  if (range) {
    const oldMarker = `${marker}\n`;
    if (content.slice(Math.max(0, removeStart - oldMarker.length), removeStart) === oldMarker) {
      removeStart -= oldMarker.length;
    }
  }
  const base = range ? `${content.slice(0, removeStart)}${content.slice(range[1])}` : content;
  return `${base.trimEnd()}${base.trim() ? "\n\n" : ""}${block}`;
}

export function removeCodexServer(content, name) {
  const range = sectionRange(content, `mcp_servers.${name}`);
  if (!range) return content;
  let start = range[0];
  const marker = `# ${MANAGED_COMMENT}: ${name}\n`;
  if (content.slice(Math.max(0, start - marker.length), start) === marker) start -= marker.length;
  return `${content.slice(0, start)}${content.slice(range[1])}`.replace(/\n{3,}/g, "\n\n");
}

export async function installCodexConfig({ configFile, name, url, helperCommand }) {
  const current = await readText(configFile, "");
  const next = upsertCodexServer(current, { name, url, helperCommand });
  await atomicWrite(configFile, next, { mode: 0o600, backup: current.length > 0 });
}

export async function uninstallCodexConfig({ configFile, name }) {
  const current = await readText(configFile, "");
  if (!current) return false;
  const next = removeCodexServer(current, name);
  if (next === current) return false;
  await atomicWrite(configFile, next, { mode: 0o600, backup: true });
  return true;
}

export function countCodexServer(content, name) {
  return content.split(`[mcp_servers.${name}]`).length - 1;
}
