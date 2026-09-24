import { MCP_PATH } from "./constants.mjs";

export function normalizeMcpUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("Informe a Deskcomm CRM Base URL ou MCP URL.");

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("URL inválida. Use uma URL HTTPS completa, por exemplo https://crm.exemplo.com.");
  }
  if (url.protocol !== "https:" && !isLocalhost(url.hostname)) {
    throw new Error("A URL MCP deve usar HTTPS; HTTP só é aceito para localhost em testes locais.");
  }
  if (url.username || url.password) throw new Error("A URL não pode conter usuário ou senha.");
  if (url.search || url.hash) throw new Error("A URL MCP não pode conter query string ou fragmento.");
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path === "" || path === "/" ? MCP_PATH : path.endsWith(MCP_PATH) ? path : `${path}${MCP_PATH}`;
  return url.toString().replace(/\/$/, "");
}

function isLocalhost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
