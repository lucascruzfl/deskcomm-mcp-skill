import path from "node:path";

import { DEFAULT_PROFILE, VERSION } from "./constants.mjs";
import { loadCredential } from "./credentials.mjs";
import { doctor } from "./doctor.mjs";
import { atomicWrite } from "./fs-safe.mjs";
import { install, reconfigureProfile, uninstall, updateInstallations } from "./installer.mjs";
import { generateToolsReference, verifyConnection } from "./mcp-client.mjs";
import { addProfile, listProfiles, removeProfile, showProfile, verifyAllProfiles } from "./profile-manager.mjs";
import { findProfile, loadProfiles, setDefaultProfile } from "./profiles.mjs";
import { sanitizeProfile, serverName } from "./paths.mjs";
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

  const scope = flags.global ? "global" : "project";
  const projectRoot = path.resolve(flags.projectDir ?? process.cwd());

  if (command === "profiles") {
    const action = positionals[1] ?? "list";
    if (action === "list") {
      const result = await listProfiles();
      if (!result.profiles.length) io.log("Nenhum perfil cadastrado.");
      for (const item of result.profiles) {
        const installed = item.installations.map((x) => `${x.client}/${x.scope}`).join(", ") || "sem integração";
        io.log(`${item.id}${item.id === result.default_profile ? " [padrão]" : ""} | ${item.name} | ${item.url} | ${installed}`);
      }
      return 0;
    }
    if (action === "add") {
      const name = positionals[2] ?? await promptText("Nome do perfil");
      const url = flags.url ?? await promptText("Deskcomm CRM Base URL ou MCP URL");
      const token = await resolveToken(flags);
      const result = await addProfile({ name, url, token });
      io.log(`Perfil ${result.id} cadastrado. Endpoint: ${result.url}. tools/list: ${result.verification.tool_count}.`);
      io.log(`Para disponibilizá-lo no cliente, execute codex ou claude com --profile ${result.id} e o escopo desejado.`);
      return 0;
    }
    if (action === "show") {
      const name = positionals[2];
      if (!name) throw new Error("Informe o perfil: profiles show NOME.");
      io.log(JSON.stringify(await showProfile(name), null, 2));
      return 0;
    }
    if (action === "set-default") {
      const name = positionals[2];
      if (!name) throw new Error("Informe o perfil: profiles set-default NOME.");
      const result = await setDefaultProfile(name);
      io.log(`Perfil padrão: ${result.id}.`);
      return 0;
    }
    if (action === "update") {
      const name = positionals[2];
      if (!name || (!flags.url && !flags.tokenEnv && !flags.tokenStdin)) {
        throw new Error("Use profiles update NOME --url URL e/ou --token-env VAR/--token-stdin.");
      }
      const token = flags.tokenEnv || flags.tokenStdin ? await resolveToken(flags) : undefined;
      const result = await reconfigureProfile({ profile: name, url: flags.url, token });
      io.log(`Perfil ${result.profile} atualizado em ${result.installations} instalação(ões). Endpoint: ${result.url}. tools/list: ${result.verification.tool_count}.`);
      return 0;
    }
    if (action === "remove") {
      const name = positionals[2];
      if (!name) throw new Error("Informe o perfil: profiles remove NOME.");
      const result = await removeProfile({ name, deleteCredential: Boolean(flags.deleteCredential) });
      io.log(`Perfil ${result.profile} removido; integrações: ${result.removed_installations}; credencial: ${result.removed_credential ? "apagada" : "preservada"}.`);
      return 0;
    }
    throw new Error(`Comando de perfis desconhecido: ${action}`);
  }

  if (command === "verify-all") {
    const results = await verifyAllProfiles();
    if (!results.length) {
      io.log("Nenhum perfil cadastrado.");
      return 1;
    }
    for (const item of results) {
      io.log(item.ok
        ? `${item.profile} | ${item.endpoint} | Connected | Endpoint OK | Handshake OK | tools/list: ${item.tool_count} | Duplicates: 0 | Schemas: OK`
        : `${item.profile} | ${item.endpoint} | FALHA: ${item.error}`);
    }
    return results.every((item) => item.ok) ? 0 : 1;
  }

  if (command === "codex" || command === "claude") {
    const selected = await selectInstallProfile(flags);
    const url = flags.url ?? selected.existing?.url ?? await promptText("Deskcomm CRM Base URL ou MCP URL");
    const token = flags.tokenEnv || flags.tokenStdin || !selected.existing ? await resolveToken(flags) : undefined;
    const result = await install({
      client: command, scope, profile: selected.id, profileName: selected.name,
      projectRoot, url, token,
    });
    io.log(`Instalação ${command}/${scope} concluída: perfil ${result.profile}, servidor ${serverName(result.profile)}.`);
    io.log(`tools/list válido: ${result.verification.tool_count} ferramentas visíveis para este token.`);
    if (!result.protection.ok) io.warn(result.protection.warning);
    return 0;
  }

  if (command === "verify-connection") {
    const profile = await selectExistingProfile(flags);
    const credential = await loadCredential({ profile });
    const catalog = await loadProfiles();
    const metadata = findProfile(catalog, profile);
    if (metadata?.url !== credential.url) throw new Error("URL do perfil diverge da credencial; nenhuma conexão foi feita.");
    const result = await verifyConnection({ url: credential.url, token: credential.token });
    io.log(`Perfil: ${profile} | Endpoint: ${credential.url} | Connected | Endpoint OK | Handshake OK | tools/list: ${result.tool_count} | Duplicates: 0 | Schemas: OK`);
    return 0;
  }

  if (command === "doctor") {
    const client = flags.client ?? positionals[1] ?? "codex";
    const profile = flags.profile ? sanitizeProfile(flags.profile) : await selectExistingProfile(flags, { allowMissing: true });
    const result = await doctor({ client, scope, profile, projectRoot });
    for (const item of result.checks) io.log(`${item.ok ? "OK" : item.optional ? "AVISO" : "FALHA"} ${item.name}: ${item.detail}`);
    return result.ok ? 0 : 1;
  }

  if (command === "uninstall") {
    const client = flags.client ?? positionals[1];
    if (!client) throw new Error("Informe o cliente: uninstall codex ou uninstall claude.");
    const profile = await selectExistingProfile(flags, { allowMissing: true, requireExplicitWhenMultiple: true });
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
    const profile = await selectExistingProfile(flags);
    const credential = await loadCredential({ profile });
    const markdown = await generateToolsReference({ url: credential.url, token: credential.token, profile });
    const output = path.resolve(flags.output ?? "deskcomm-mcp-tools.generated.md");
    await atomicWrite(output, markdown, { mode: 0o644, backup: true });
    io.log(`Snapshot gerado em ${output}. Ele não é fonte de verdade para runtime.`);
    return 0;
  }

  throw new Error(`Comando desconhecido: ${command}`);
}

async function selectInstallProfile(flags) {
  const catalog = await loadProfiles();
  if (flags.profile) {
    const id = sanitizeProfile(flags.profile);
    return { id, name: flags.profile, existing: findProfile(catalog, id) };
  }
  if (catalog.profiles.length === 0) {
    const name = process.stdin.isTTY ? await promptText("Nome do perfil", { defaultValue: DEFAULT_PROFILE }) : DEFAULT_PROFILE;
    return { id: sanitizeProfile(name), name, existing: null };
  }
  if (catalog.profiles.length === 1) {
    const existing = catalog.profiles[0];
    return { id: existing.id, name: existing.name, existing };
  }
  if (!process.stdin.isTTY) throw new Error("Há vários perfis. Informe --profile NOME para escolher o cliente.");
  const names = catalog.profiles.map((item) => item.id).join(", ");
  const name = await promptText(`Perfil Deskcomm (${names})`, { defaultValue: catalog.default_profile ?? undefined });
  const existing = findProfile(catalog, name);
  if (!existing) throw new Error("Perfil não encontrado. Use profiles add para cadastrar outro cliente.");
  return { id: existing.id, name: existing.name, existing };
}

async function selectExistingProfile(flags, { allowMissing = false, requireExplicitWhenMultiple = false } = {}) {
  if (flags.profile) return sanitizeProfile(flags.profile);
  const catalog = await loadProfiles();
  if (requireExplicitWhenMultiple && catalog.profiles.length > 1) {
    throw new Error("Há vários perfis. Informe --profile NOME.");
  }
  if (catalog.default_profile) return catalog.default_profile;
  if (catalog.profiles.length === 1) return catalog.profiles[0].id;
  if (catalog.profiles.length === 0 && allowMissing) return DEFAULT_PROFILE;
  throw new Error("Perfil Deskcomm ambíguo ou ausente. Informe --profile NOME.");
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
    if (["global", "help", "version", "tokenStdin", "removeCredential", "keepCredential", "deleteCredential", "yes"].includes(key)) flags[key] = true;
    else flags[key] = argv[++index];
  }
  return { positionals, flags };
}

export function help() {
  return `deskcomm-mcp-skill ${VERSION}

Uso:
  deskcomm-mcp-skill codex [--global] [--url URL] [--profile NOME]
  deskcomm-mcp-skill claude [--global] [--url URL] [--profile NOME]
  deskcomm-mcp-skill profiles add "NOME" --url URL
  deskcomm-mcp-skill profiles list
  deskcomm-mcp-skill profiles show NOME
  deskcomm-mcp-skill profiles update NOME [--url URL] [--token-env VAR|--token-stdin]
  deskcomm-mcp-skill profiles set-default NOME
  deskcomm-mcp-skill profiles remove NOME [--delete-credential]
  deskcomm-mcp-skill verify-connection [--profile NOME]
  deskcomm-mcp-skill verify-all
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
  Com vários perfis, informe --profile para instalar ou remover uma integração.
`;
}
