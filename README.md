# deskcomm-mcp-skill

Instala a Skill operacional e registra um DeskcommCRM self-hosted como servidor MCP no Codex CLI
ou no Claude Code. O pacote é independente do código-fonte do CRM e descobre o catálogo permitido
ao token por `tools/list`; nenhuma quantidade histórica de tools é requisito de runtime.

## Requisitos

- Node.js 20 ou superior;
- uma URL HTTPS do DeskcommCRM;
- um token MCP `dsk_...` criado no CRM com os scopes/capabilities necessários;
- Codex CLI ou Claude Code, conforme o cliente escolhido.

O endpoint oficial é `<base-url>/api/mcp`. O instalador aceita a base ou o endpoint completo e
normaliza a URL.

## Instalação por NPX

Para testar a cópia local, rode:

```bash
npx /caminho/para/deskcomm-mcp-skill codex
npx /caminho/para/deskcomm-mcp-skill claude
```

Para instalar a versão publicada no GitHub:

```bash
npx github:lucascruzfl/deskcomm-mcp-skill codex
npx github:lucascruzfl/deskcomm-mcp-skill claude
```

O padrão instala no projeto atual. Acrescente `--global` para o nível do usuário. O token é pedido
sem eco. Em automação, passe por stdin ou por uma variável já definida:

```bash
printf '%s' "$DESKCOMM_MCP_TOKEN" | npx . codex --token-stdin --url https://crm.exemplo.com
npx . claude --global --token-env DESKCOMM_MCP_TOKEN --url https://crm.exemplo.com
```

Não há flag `--token`: isso evita gravar o segredo no histórico e na lista de processos. A
instalação só é escrita depois de handshake e `tools/list` válidos.

## Operação

```bash
npx . verify-connection
npx . doctor codex
npx . doctor claude --global
npx . update
npx . uninstall codex --remove-credential
npx . generate-tools-reference --output tools.generated.md
```

`update` atualiza Skill e runtime sem apagar URL, token, perfil ou outros servidores MCP.
`uninstall` remove apenas entradas e arquivos marcados como gerenciados por este instalador. A
credencial é preservada, salvo confirmação/`--remove-credential` quando nenhum outro cliente usa o
perfil.

## Documentação

- [Instalação](docs/INSTALLATION.md)
- [Codex](docs/CODEX.md)
- [Claude Code](docs/CLAUDE-CODE.md)
- [Segurança](docs/SECURITY.md)
- [Diagnóstico](docs/TROUBLESHOOTING.md)
- [Atualização](docs/UPDATE.md)

## Desenvolvimento

```bash
npm test
npm run lint
npm pack --dry-run
```

Os testes usam HOME temporário e mock MCP; não acessam produção nem usam secrets reais.
