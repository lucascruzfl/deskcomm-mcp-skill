# Claude Code

Claude Code suporta servidores HTTP/stdio e escopos local/project/user. Como o contrato HTTP do
Claude não oferece um helper de headers equivalente ao do Codex, o instalador registra um bridge
stdio pequeno, instalado no diretório do usuário. O bridge lê a credencial 0600/ACL restrita e
repassa JSON-RPC ao endpoint Streamable HTTP; não imprime nem persiste o token em logs.

- projeto: `.mcp.json` e `.claude/skills/deskcomm-mcp`;
- usuário (`--global`): `~/.claude.json` e `~/.claude/skills/deskcomm-mcp`.

Outros `mcpServers` são preservados. O arquivo de projeto contém caminhos locais, nunca o token, e
por isso não deve ser tratado como configuração portável de equipe sem revisão.

Nesta versão do pacote, a CLI Claude Code não estava instalada na máquina de desenvolvimento. O
formato foi implementado a partir do contrato oficial e testado com HOME temporário, mock de config
e bridge contra mock MCP; não se afirma teste real de `claude mcp` nesta VPS.

Referência oficial: [Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp).
