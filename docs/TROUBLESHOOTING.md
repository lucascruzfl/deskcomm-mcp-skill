# Troubleshooting

Comece com `doctor <codex|claude>` e depois `verify-connection`.

| Sintoma | Diagnóstico | Próximo passo |
| --- | --- | --- |
| 401 | token inválido, ausente ou revogado | revise o token no CRM e reinstale o perfil |
| 403 | autenticação válida, autorização recusada | revise role, scopes, allowlist e capabilities no CRM |
| `tools/list` vazio | token sem tools visíveis ou instalação sem módulo | confira permissões e versão; a conexão pode estar íntegra |
| tool ausente | catálogo filtrado ou versão diferente | atualize `tools/list`; não use snapshot nem REST fallback |
| `capability missing` / `scope missing` | autoridade insuficiente | peça ajuste humano do token; não autoeleve |
| cross-tenant | ID pertence a outra organização | descubra novamente pelo token atual; nunca envie organização manual |
| `model_not_found` | modelo não está disponível | descubra providers/modelos e valide antes do draft |
| `credential_not_found` | credencial de IA não existe/está inativa | descubra metadados; entrada de secret continua humana |
| `human_action_required` | consentimento/binário/decisão humana | siga instruction e endpoint/href, depois verifique |
| Codex não carrega | TOML/helper/skill | reinicie Codex, use `codex mcp get` e confira o caminho do helper |
| Claude não carrega | JSON/bridge/skill | confira `.mcp.json` ou `~/.claude.json`; rode `doctor claude` |
| conexão TLS/rede | URL/DNS/certificado | confirme HTTPS e acesso à base; nunca desative validação TLS |
| timeout | endpoint lento ou indisponível | confira rede, proxy e disponibilidade; não repita mutações incertas |
| Windows com espaços | quoting do helper/bridge | use caminho entre aspas duplas no PowerShell/cmd; rode doctor |
| perfil inexistente ou duplicado | cadastro ausente ou corrompido | rode `profiles list` e `doctor --profile NOME`; não copie tokens entre perfis |
| configuração órfã/divergente | entrada MCP alterada fora do instalador | revise a seção Deskcomm antes de atualizar ou remover |
| URL do perfil divergente | metadata e credencial não coincidem | corrija o cadastro; a verificação não envia token a outra URL |

O doctor também acusa configuração duplicada, Skill ausente e permissão POSIX diferente de 0600.
