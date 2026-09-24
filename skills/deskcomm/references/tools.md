# Descoberta de tools

O catálogo efetivo é `tools/list` na sessão MCP atual. Leia cada `name`, `description` e
`inputSchema` antes de chamar. A lista pode mudar por versão, token, role, scopes, allowlist,
capabilities e módulos opcionais. Uma lista vazia ou subconjunto não prova defeito do servidor.

Não use este arquivo como catálogo. `generate-tools-reference` pode produzir um snapshot
diagnóstico local, rotulado com data, versão do servidor e perfil. Esse snapshot pode conter
detalhes visíveis a um token específico; revise antes de compartilhar. Ele nunca substitui
`tools/list` no runtime.
