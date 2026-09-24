# Deskcomm MCP Skill

Instala uma Agent Skill e registra uma instância self-hosted do DeskcommCRM no Codex ou Claude
Code. A Skill consulta `tools/list` em cada sessão para escolher tools pelo nome, descrição e
schema. A lista pode variar por versão, token, scopes, allowlist, capabilities e módulos opcionais;
nenhuma quantidade fixa é exigida.

## Requisitos

- Node.js 20 ou superior e `npx`;
- Codex CLI ou Claude Code;
- URL HTTPS da sua instância DeskcommCRM e token MCP emitido nela.

O instalador aceita a base (`https://crm.exemplo.com`) ou o endpoint completo
(`https://crm.exemplo.com/api/mcp`). Para testes locais, aceita HTTP apenas em localhost. A URL
é solicitada interativamente ou passada com `--url`; o token é solicitado sem eco. O instalador
verifica handshake e `tools/list` antes de gravar a instalação.

## Instalar

Execute no diretório do projeto para a instalação de projeto. O `npx` baixa a versão atual do
GitHub. Os mesmos comandos funcionam em PowerShell, cmd, Linux e macOS:

```text
npx github:lucascruzfl/deskcomm-mcp-skill codex
npx github:lucascruzfl/deskcomm-mcp-skill codex --global
npx github:lucascruzfl/deskcomm-mcp-skill claude
npx github:lucascruzfl/deskcomm-mcp-skill claude --global
```

Na primeira instalação interativa, informe o nome do perfil, URL e token. A opção
`--profile NOME` escolhe um perfil existente ou cadastra um novo. Com vários perfis, a
instalação exige escolha explícita. Reinstalar um perfil existente usa sua credencial guardada,
sem sobrescrevê-la quando não foi fornecido outro token.

## Gerenciando vários clientes

Cada cliente tem um perfil e um token próprios. Lucas e Vip Stetic podem usar o mesmo servidor
Deskcomm, mas a mesma URL **não** significa o mesmo tenant. Codex e Claude Code recebem entradas
MCP distintas, como `deskcomm-lucas` e `deskcomm-vip-stetic`.

```text
npx github:lucascruzfl/deskcomm-mcp-skill profiles add "Lucas" --url https://crm.exemplo.com.br
npx github:lucascruzfl/deskcomm-mcp-skill profiles add "Vip Stetic" --url https://crm.exemplo.com.br
npx github:lucascruzfl/deskcomm-mcp-skill profiles list
npx github:lucascruzfl/deskcomm-mcp-skill profiles show vip-stetic
npx github:lucascruzfl/deskcomm-mcp-skill profiles set-default lucas
npx github:lucascruzfl/deskcomm-mcp-skill verify-connection --profile vip-stetic
npx github:lucascruzfl/deskcomm-mcp-skill verify-all
```

`profiles add` pede o token sem eco e guarda a credencial fora do projeto. Para disponibilizar
os dois perfis globalmente no Codex, execute:

```text
npx github:lucascruzfl/deskcomm-mcp-skill codex --global --profile lucas
npx github:lucascruzfl/deskcomm-mcp-skill codex --global --profile vip-stetic
```

Troque `codex` por `claude` para registrar ambos no Claude Code. Perfis em VPS diferentes usam
URLs diferentes no `profiles add`. O perfil padrão facilita comandos da CLI; o agente deve
perguntar qual cliente operar quando o pedido for ambíguo.

Para mudar URL, execute `profiles update NOME --url https://novo-host`. Para trocar o token,
execute `profiles update NOME --token-env DESKCOMM_MCP_TOKEN` com a variável definida apenas no
processo, ou `--token-stdin` por canal protegido. A atualização verifica a conexão e ajusta as
entradas Codex existentes desse perfil. Para remover um cliente e suas integrações:

```text
npx github:lucascruzfl/deskcomm-mcp-skill profiles remove vip-stetic
```

Por padrão a credencial externa é preservada. `--delete-credential` a apaga explicitamente.
Não há exportação de tokens nem deduplicação por URL.

Use `--url https://seu-host` para informar a URL sem prompt. Use `--project-dir "C:\Users\Nome Sobrenome\Meu Projeto"`
para escolher outro projeto. Em Windows, execute no PowerShell ou cmd; as aspas duplas protegem
caminhos com espaços. O token não deve ser passado como argumento. Em automação, use
`--token-env DESKCOMM_MCP_TOKEN` com variável já definida no processo, ou `--token-stdin`
por um canal protegido. Não grave o token em script, perfil do shell, histórico, projeto ou Git.

No Windows, o instalador guarda a credencial sob `%APPDATA%\DeskcommMCP\profiles` com ACL
restrita. Em Linux/macOS, usa `~/.config/deskcomm-mcp/profiles` (ou `XDG_CONFIG_HOME`) com
permissão 0600. O token não entra no TOML/JSON do cliente: Codex usa
`http_headers_helper`; Claude Code usa um pequeno bridge stdio que lê a credencial do usuário.
Reinicie o cliente depois de instalar.

## Verificar e diagnosticar

```text
npx github:lucascruzfl/deskcomm-mcp-skill verify-connection
npx github:lucascruzfl/deskcomm-mcp-skill doctor codex
npx github:lucascruzfl/deskcomm-mcp-skill doctor claude
```

Acrescente `--global` ao doctor para instalação global; `--project-dir "CAMINHO"` seleciona
outro projeto. `verify-connection` faz somente handshake e `tools/list`, valida JSON-RPC,
schemas e duplicatas e informa a quantidade visível. Não chama `tools/call` nem imprime token.
Uma lista menor, inclusive vazia, pode ser legítima. O doctor verifica Node, paths, configuração,
credencial e conexão, e distingue autenticação 401, autorização 403, timeout e TLS.

## Atualizar

```text
npx github:lucascruzfl/deskcomm-mcp-skill update
```

O `npx` obtém o pacote atual do GitHub; `update` verifica todas as conexões gerenciadas e
atualiza Skill e runtime registrados sem duplicar entrada MCP ou substituir configurações alheias.
O catálogo de perfis e as credenciais permanecem. Para mudar URL/token, use `profiles update`.
Se uma entrada foi editada fora do instalador, ele interrompe para preservar a edição.

## Desinstalar

```text
npx github:lucascruzfl/deskcomm-mcp-skill uninstall codex
npx github:lucascruzfl/deskcomm-mcp-skill uninstall codex --global
npx github:lucascruzfl/deskcomm-mcp-skill uninstall claude
npx github:lucascruzfl/deskcomm-mcp-skill uninstall claude --global
```

Remove apenas a Skill marcada como gerenciada e a entrada MCP do cliente/perfil correspondente.
Outros MCPs, perfis, Skills e configurações ficam. A credencial externa permanece; use
`--remove-credential` somente quando nenhuma outra integração usa o perfil e você deseja apagar
também o cadastro e a credencial.

## Segurança e operação

Use token com menor privilégio. A organização é resolvida pelo servidor, e o catálogo exposto
reflete role, scopes, allowlist e capabilities. A Skill lê antes de escrever, segue
`inputSchema`, preserva `idempotency_key` em retries e respeita ações humanas para QR,
OAuth, uploads, consentimento e operações protegidas. Não contorne o MCP por SQL, REST
administrativo ou infraestrutura.

Para um snapshot local de diagnóstico, use
`npx github:lucascruzfl/deskcomm-mcp-skill generate-tools-reference --output tools.generated.md`.
O arquivo indica data, versão e perfil; revise antes de compartilhar. `tools/list` runtime
sempre prevalece.

Detalhes: [instalação](docs/INSTALLATION.md), [Codex](docs/CODEX.md),
[Claude Code](docs/CLAUDE-CODE.md), [diagnóstico](docs/TROUBLESHOOTING.md),
[segurança](docs/SECURITY.md) e [atualização](docs/UPDATE.md).
