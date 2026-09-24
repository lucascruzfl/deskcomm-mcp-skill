# Atualização

Execute `npx github:lucascruzfl/deskcomm-mcp-skill update` para baixar o pacote atual e
atualizar as instalações registradas. Antes de copiar arquivos, o update confirma a conexão de
cada perfil por handshake e `tools/list`, e verifica os marcadores de propriedade da Skill e
configuração. Ele preserva:

- URL e token de cada perfil;
- catálogo de perfis, nomes e perfil padrão;
- escopo e projeto;
- outros MCP servers;
- demais configurações do Codex/Claude.

Depois rode `doctor` e `verify-connection`. A atualização do DeskcommCRM é independente da Skill:
o servidor pode ganhar novas tools e o cliente passa a vê-las por `tools/list`, sem reconstruir o
pacote. Se um contrato canônico mudar, atualize o CRM pelo procedimento de auditoria delta e então
atualize a Skill apenas se as instruções/transportes precisarem mudar.
