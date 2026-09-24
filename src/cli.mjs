import path from "node:path";

import { DEFAULT_PROFILE, VERSION } from "./constants.mjs";
import { loadCredential } from "./credentials.mjs";
import { doctor } from "./doctor.mjs";
import { atomicWrite } from "./fs-safe.mjs";
import { install, uninstall, updateInstallations } from "./installer.mjs";
import { generateToolsReference, verifyConnection } from "./mcp-client.mjs";
import { promptSecret, promptText, readStdin } from "./prompts.mjs";

export async function runCli(argv = process.argv.slice(2), io = console) {
  const { positionals, flags } = parseArgs(argv);
  const command = positionals[0];
  if (flags.version || command === "--version") {
    io.log(VERSION);
    return 0;
  }
  if (!command || flags.help || command === "help") {
    io.log(help());
    return 0;
  }

  const profile = flags.profile ?? DEFAULT_PROFILE;
  const scope = flags.global ? "global" : "project";
  const projectRoot = path.resolve(flags.projectDir ?? process.cwd());

  if (command === "codex" || command === "claude") {
    const url = flags.url ?? await promptText("Deskcomm CRM Base URL ou MCP URL");
    const token = await resolveToken(flags);
    const result = await install({ client: command, scope, profile, projectRoot, url, token });
    io.log(`Instalação ${command}/${scope} concluída.`);
    io.log(`tools/list válido: ${result.verification.tool_count} ferramentas visíveis para este token.`);
    if (!result.protection.ok) io.warn(result.protection.warning);
    return 0;
  }

  if (command === "verify-connection") {
    const credential = await loadCredential({ profile });
    const result = await verifyConnection({ url: credential.url, token: credential.token });
    io.log(`Connected | Endpoint OK | Handshake OK | tools/list: ${result.tool_count} | Duplicates: 0 | Schemas: OK`);
    return 0;
  }

  if (command === "doctor") {
    const client = flags.client ?? positionals[1] ?? "codex";
    const result = await doctor({ client, scope, profile, projectRoot });
    for (const item of result.checks) io.log(`${item.ok ? "OK" : item.optional ? "AVISO" : "FALHA"} ${item.name}: ${item.detail}`);
    return result.ok ? 0 : 1;
  }

  if (command === "uninstall") {
    const client = flags.client ?? positionals[1];
    if (!client) throw new Error("Informe o cliente: uninstall codex ou uninstall claude.");
    if (flags.removeCredential && flags.keepCredential) throw new Error("Use apenas uma opção de credencial.");
    let removeCredential = Boolean(flags.removeCredential);
    if (!flags.removeCredential && !flags.yes && !flags.keepCredential && process.stdin.isTTY) {
      const answer = await promptText("Remover também a credencial local deste perfil? (s/N)", { defaultValue: "N" });
      removeCredential = /^s(im)?$/i.test(answer);
    }
    const result = await uninstall({ client, scope, profile, projectRoot, removeCredential });
    io.log(`Remoção concluída: config=${result.removedConfig ? "sim" : "não"}, credencial=${result.removedCredential ? "sim" : "preservada"}.`);
    return 0;
  }

  if (command === "update") {
    const result = await updateInstallations();
    io.log(`${result.updated} instalação(ões) atualizada(s) para ${result.version}; conexão verificada, URL, token e outros MCPs preservados.`);
    return 0;
  }

  if (command === "generate-tools-reference") {
    const credential = await loadCredential({ profile });
    const markdown = await generateToolsReference({ url: credential.url, token: credential.token, profile });
    const output = path.resolve(flags.output ?? "deskcomm-mcp-tools.generated.md");
    await atomicWrite(output, markdown, { mode: 0o644, backup: true });
    io.log(`Snapshot gerado em ${output}. Ele não é fonte de verdade para runtime.`);
    return 0;
  }

  throw new Error(`Comando desconhecido: ${command}`);
}

async function resolveToken(flags) {
  if (flags.tokenEnv) {
    const token = process.env[flags.tokenEnv];
    if (!token) throw new Error(`A variável ${flags.tokenEnv} não está definida.`);
    return token;
  }
  if (flags.tokenStdin) return readStdin();
  return promptSecret("Token MCP (não será exibido)");
}

export function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (["global", "help", "version", "tokenStdin", "removeCredential", "keepCredential", "yes"].includes(key)) flags[key] = true;
    else flags[key] = argv[++index];
  }
  return { positionals, flags };
}

export function help() {
  return `deskcomm-mcp-skill ${VERSION}

Uso:
  deskcomm-mcp-skill codex [--global] [--url URL] [--profile NOME]
  deskcomm-mcp-skill claude [--global] [--url URL] [--profile NOME]
  deskcomm-mcp-skill verify-connection [--profile NOME]
  deskcomm-mcp-skill doctor [codex|claude] [--global] [--profile NOME]
  deskcomm-mcp-skill uninstall <codex|claude> [--global] [--remove-credential]
  deskcomm-mcp-skill update
  deskcomm-mcp-skill generate-tools-reference [--profile NOME] [--output ARQUIVO]

Segredo:
  Por padrão o token é solicitado sem eco. Em automação, use --token-stdin ou
  --token-env NOME_DA_VARIAVEL. Não existe flag --token para evitar histórico/process list.

Escopo:
  O padrão é o projeto atual. Use --global para instalar no nível do usuário.
  Use --project-dir CAMINHO para selecionar outro projeto.
`;
}
