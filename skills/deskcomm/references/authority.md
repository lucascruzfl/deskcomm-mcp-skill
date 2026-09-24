# Fronteiras de autoridade

Leia quando a tarefa envolve segredo, identidade, privilégio, infraestrutura, consentimento ou uma
operação que não apareceu em `tools/list`.

## Quando o MCP pedir ação humana

Siga a resposta estruturada `human_action_required` ou `human_confirmation_required` e aguarde a
pessoa quando a operação envolver, por exemplo:

- entrada de credencial secreta;
- QR, pairing, reconnect, disconnect ou provisionamento de canal;
- OAuth e conexão/desconexão externa;
- uploads binários;
- imports multipart;
- execução bulk sem recibo idempotente oficial, quando o MCP assim indicar;
- downloads ou decisões LGPD;
- merge de contatos, quando exigir decisão humana;
- aprovação externa de templates;
- rollback de follow-up ou replay de automação com efeitos, quando protegidos;
- Google Calendar;
- emissão/revogação de tokens ou mudanças privilegiadas.

Se o MCP oferecer tool oficial autorizada para uma dessas intenções, use o contrato retornado em
`tools/list`. Use `endpoint`/`href` apenas quando retornado pelo MCP; não invente fluxo paralelo.
Não copie token, conteúdo privado ou secret para a conversa.

## Classe C — não tente

Não tente revelar secrets; operar billing; excluir tenant; autoelevar; conceder owner/admin;
alterar MFA/recovery; operar infraestrutura, deploy ou backup da VPS; executar SQL arbitrário;
impersonar; desativar RLS, auditoria, LGPD, opt-out ou guardrails; executar código arbitrário;
consentir OAuth automaticamente; ou inventar operação ausente.

Não substitua essas proibições por REST, shell, acesso ao banco ou outro MCP.
