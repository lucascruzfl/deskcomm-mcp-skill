# Codex CLI

O Codex suporta MCP Streamable HTTP em
`~/.codex/config.toml` e, para projetos confiáveis, `.codex/config.toml`.

O instalador usa:

- `url` para o endpoint `/api/mcp`;
- `http_headers_helper` para produzir o header Authorization em runtime;
- Skill de projeto em `.agents/skills/deskcomm-mcp` ou global em
  `~/.agents/skills/deskcomm-mcp`.

O helper lê o token no diretório privado do usuário. Nenhum bearer estático é salvo no TOML. Outras
seções e outros MCPs permanecem intactos. Depois da instalação, reinicie uma sessão Codex e use
`/mcp` ou `codex mcp get deskcomm --json` para inspecionar a entrada; `verify-connection` valida o
servidor diretamente.

Cada perfil nomeado cria uma seção distinta, como `[mcp_servers.deskcomm-lucas]` e
`[mcp_servers.deskcomm-vip-stetic]`. Elas podem apontar para a mesma URL: cada helper lê a
credencial do próprio perfil. O perfil legado `default` continua usando `deskcomm`.

Referências oficiais: [MCP no Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) e
[Skills](https://learn.chatgpt.com/docs/build-skills).
