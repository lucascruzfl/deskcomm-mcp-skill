# Troubleshooting

Comece com `doctor <codex|claude>` e depois `verify-connection`.

| Sintoma | Diagnóstico | Próximo passo |
| --- | --- | --- |
| 401/403 | token inválido, revogado ou sem autorização | crie/revise o token no CRM e reinstale o perfil |
| `tools/list` vazio | token sem tools visíveis | aplique scopes/capabilities/preset apropriados no CRM |
| tool ausente | catálogo filtrado ou versão diferente | atualize `tools/list`; não use snapshot nem REST fallback |
| `capability missing` / `scope missing` | autoridade insuficiente | peça ajuste humano do token; não autoeleve |
| cross-tenant | ID pertence a outra organização | descubra novamente pelo token atual; nunca envie organização manual |
| `model_not_found` | modelo não está disponível | descubra providers/modelos e valide antes do draft |
| `credential_not_found` | credencial de IA não existe/está inativa | descubra metadados; entrada de secret continua humana |
| `human_action_required` | consentimento/binário/decisão humana | siga instruction e endpoint/href, depois verifique |
| Codex não carrega | TOML/helper/skill | reinicie Codex, use `codex mcp get` e confira o caminho do helper |
| Claude não carrega | JSON/bridge/skill | confira `.mcp.json` ou `~/.claude.json`; rode `doctor claude` |
| conexão TLS/rede | URL/DNS/certificado | confirme HTTPS e acesso à base; nunca desative validação TLS |

O doctor também acusa configuração duplicada, Skill ausente e permissão POSIX diferente de 0600.
