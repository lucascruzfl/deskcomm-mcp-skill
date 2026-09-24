# Instalação

## Escolha de escopo

`codex` ou `claude` instala no projeto atual. O arquivo do projeto contém apenas URL e caminhos para
o helper/bridge no diretório do usuário; o token nunca entra no projeto. `--global` instala Skill e
configuração no nível do usuário. Um `--profile nome` permite manter instalações diferentes sem
recompilar o pacote.

O catálogo não secreto de perfis fica em `profiles.json` no diretório de configuração do usuário.
Cada token fica em um arquivo próprio sob `profiles/`, fora do projeto. Na primeira instalação
interativa, informe o nome do perfil. Com vários perfis, escolha explicitamente `--profile`.
`profiles add` cadastra outro cliente sem sobrescrever os existentes; depois instale-o no Codex
ou Claude com `--profile`.

## Entradas seguras

O token pode vir de prompt sem eco, `--token-stdin` ou `--token-env NOME`. A URL pode ser uma base
(`https://crm.exemplo.com`) ou o endpoint completo (`https://crm.exemplo.com/api/mcp`). HTTP é
recusado, exceto localhost para testes.

Antes de escrever arquivos, o instalador executa `initialize` e `tools/list`. O critério é
JSON-RPC válido, schemas básicos válidos e nomes sem duplicatas. O catálogo pode estar vazio por
autorização. A contagem impressa é informativa.

## Arquivos criados

No POSIX, credencial/estado/runtime ficam em `~/.config/deskcomm-mcp/` (ou
`$XDG_CONFIG_HOME/deskcomm-mcp`) e a credencial recebe modo 0600. No Windows, ficam em
`%APPDATA%\DeskcommMCP` e o instalador remove herança e restringe a ACL com `icacls`. Se a
proteção falhar, a instalação é interrompida e a credencial anterior é preservada.

Configurações existentes são lidas e preservadas. Antes de alterar uma configuração existente, é
criado um `.bak`. Reinstalar o mesmo cliente/escopo/perfil atualiza somente a entrada Deskcomm.
