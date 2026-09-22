# Fronteiras de autoridade

Leia quando a tarefa envolve segredo, identidade, privilégio, infraestrutura, consentimento ou uma
operação que não apareceu em `tools/list`.

## Classe B — continua humana

Prepare, explique e aguarde a pessoa quando a operação envolver:

- entrada de credencial secreta;
- QR, pairing, reconnect, disconnect ou provisionamento de canal;
- OAuth e conexão/desconexão externa;
- uploads binários;
- imports multipart;
- execução bulk sem recibo idempotente oficial;
- downloads ou decisões LGPD;
- merge de contatos;
- aprovação externa de templates;
- rollback de follow-up ou replay de automação com efeitos;
- Google Calendar;
- emissão/revogação de tokens ou mudanças privilegiadas.

Use `endpoint`/`href` retornado pelo MCP. Não copie token, conteúdo privado ou secret para a
conversa.

## Classe C — não tente

Não tente revelar secrets; operar billing; excluir tenant; autoelevar; conceder owner/admin;
alterar MFA/recovery; operar infraestrutura, deploy ou backup da VPS; executar SQL arbitrário;
impersonar; desativar RLS, auditoria, LGPD, opt-out ou guardrails; executar código arbitrário;
consentir OAuth automaticamente; ou inventar operação ausente.

Não substitua essas proibições por REST, shell, acesso ao banco ou outro MCP.
