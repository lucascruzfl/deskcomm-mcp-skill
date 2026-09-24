# Padrões operacionais por domínio

Leia apenas as seções relevantes à tarefa. Os nomes abaixo são conceitos; descubra os nomes e
schemas reais em `tools/list`.

## IA

Descubra provider, credencial e modelo antes de montar configuração. Credencial existente retorna
somente metadados seguros. Valide a configuração, crie ou edite draft, faça preflight e teste em
sandbox. Publicação e ativação são decisões separadas. Verifique versão publicada, estado do agente
e runs.

## CRM e atendimento

Descubra pipeline, stage, contato, lead, conversa, canal e responsável. Consulte o estado atual
antes de mudar. Para mensagens, use a idempotência exigida e confirme status/ack/erro. Handoff deve
preservar contexto IA→humano; retomada humano→IA deve usar o fluxo oficial. Fila é estado derivado:
não invente `queue_id`.

## Agenda, follow-up, automações e routing

Descubra tipos, disponibilidade, flows, triggers/actions e destinos. Prefira preflight, preview e
simulação sem efeito antes de publicar ou ativar. Confirmação de presença pode exigir pessoa. Após
mutação assíncrona, consulte enrollment, run, evento, status ou diagnóstico até obter estado
terminal ou próximo passo explícito.

## Knowledge, templates, produtos e integrações

Descubra fontes e recursos existentes antes de vincular IDs. Upload, multipart, aprovação externa,
QR e OAuth terminam em ação humana. Preview de template não envia. Pedidos podem ser somente leitura
quando o produto não oferecer escrita. Segredos de webhook e integrações são write-only.

## Imports, exports e bulk

Use tools de instrução/preparo/preview e respeite limites retornados. Se o commit oficial exigir
upload, download ou ação humana, explique e pare. Depois consulte status ou diagnóstico; não faça
loops REST para simular uma operação ausente.
