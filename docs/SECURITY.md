# Segurança

- O token nunca entra no Git, README, Skill, config do projeto, log, mensagem de erro ou snapshot.
- Não existe opção `--token`; use prompt sem eco, stdin ou variável de ambiente.
- A credencial local fica fora de projetos. POSIX exige 0600; Windows usa `icacls` e interrompe
  a instalação quando não consegue confirmar a ACL.
- Codex recebe o header por helper. Claude recebe o token somente dentro do bridge local.
- Backups de config não contêm token porque a config gerenciada também não contém token.
- `verify-connection` e `doctor` redigem falhas de rede/autenticação e nunca incluem o bearer.
- `tools/list` é filtrado pelo próprio servidor conforme role, scopes, allowlist e capabilities.
- A Skill não usa REST, banco, shell ou infraestrutura como bypass de uma operação ausente.

Os fixtures usam apenas `dsk_test_fixture_token`, claramente falso. Rode `npm run test:secrets`
antes de empacotar.
