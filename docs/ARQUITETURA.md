# Nova Berith — Arquitetura (Etapa 01/08)

## 1. Auditoria do repositório
- Repositório `antoniofilhopfd-dev/berith-app`: **vazio** (sem commits, sem `package.json`). Nada a preservar.
- Branch de desenvolvimento: `claude/charming-brahmagupta-t5epqr`. Branch de produção (Hostinger): `main`.
- Ambiente local: Node 22.22, npm 10.9.

## 2. Stack e versões (fixar em `package.json`, com `package-lock.json`)
| Item | Versão verificada no npm | Observação |
|---|---|---|
| next | 16.4.0 | Node >= 20.9; usa `proxy.ts` no lugar de `middleware.ts` |
| react / react-dom | 19.3.0 | |
| typescript | 5.x (fixar a versão estável compatível com Next/ESLint; a 7.x só se Next 16.4 declarar suporte) | validar no Etapa 02 |
| mysql2 | 3.24.5 | `mysql2/promise`, pool |
| zod | 4.6.5 | validação |
| argon2 ou bcryptjs 3.0.3 | **decisão pendente** | `argon2` exige binário nativo (risco na Hostinger); `bcryptjs` é JS puro. Recomendação: bcryptjs (custo 12) salvo se a Hostinger compilar `argon2` |
| tailwindcss | 4.3.3 | estilização |
| vitest | 5.0.3 | testes |
| web-push | 3.6.7 | opcional (Etapa 07) |

## 3. Estrutura
`app/` (rotas, Server Actions, Route Handlers) · `components/` · `lib/db` · `lib/auth` · `lib/permissions` · `lib/validation` · `lib/services` · `db/migrations/NNN_nome.sql` · `scripts/` · `public/` (manifest, ícones, `sw.js`) · `types/` · `tests/` · `docs/`.
Regra: UI → Server Action/Route Handler → `lib/services` (regras) → `lib/db` (SQL parametrizado). Autorização sempre em `lib/permissions`, chamada pelos serviços (nunca só na UI nem só no `proxy.ts`).

## 4. Migrações
- `scripts/gerar-migracoes.mjs` (rodado no `prebuild`) lê `db/migrations/*.sql` e gera `lib/db/migrations.generated.ts` (id, checksum SHA-256, SQL). Build não conecta ao banco.
- Na primeira conexão do servidor (`instrumentation.ts` + guarda em `lib/db`): `GET_LOCK('nova_berith_migrate')` → lê `schema_migrations` → aplica só as pendentes, em ordem → grava id, checksum, data, resultado → `RELEASE_LOCK`.
- Checksum divergente de migração já aplicada = erro e parada (nunca reeditar).
- DDL do MySQL faz commit implícito: cada migração é escrita de forma idempotente (`CREATE TABLE IF NOT EXISTS`, etc.), com estado `falhou` registrado e reexecução segura. Sem `DROP` automático.

## 5. Modelo de dados (resumo)
- Identidade: `users`, `sessions` (hash do token, revogação), `login_attempts`, `password_resets`, `invitations`, `audit_log`.
- Organização: `org_units` (tipo: comunidade|caminho|ministerio|grupo|equipe|servico; `parent_id`), `memberships` (user, unit, papel, início/fim → histórico e transferências), `member_profiles` (contato, foto, vínculo, dados de menores/imagem).
- Permissões: `roles`, `role_permissions` (recurso × ação), `user_roles` (user, role, `scope_unit_id` nullable). Negação por padrão; papel financeiro independente.
- Conteúdo: `events`, `event_rsvps`, `announcements`, `announcement_reads`, `shifts` (escalas), `attendance`, `tasks`, `task_comments`, `meetings`, `minutes`, `contents` (orações/formação), `favorites`, `files` (metadados; binários fora de `public/`), `albums`.
- Financeiro: `fin_accounts`, `fin_categories`, `fin_entries` (centavos `BIGINT`, estorno por lançamento reverso, nunca UPDATE de valor), `fin_periods` (fechamento), `fin_receipts`.
- Notificações: `notifications`, `notification_prefs`, `push_subscriptions`, `push_deliveries`.
- Todas com FKs, índices em colunas de escopo/data e `created_at/updated_at` em UTC; fuso da comunidade em `settings`.

## 6. Segurança
- Senhas: hash forte; sessões: token aleatório no cookie (`HttpOnly`, `Secure`, `SameSite=Lax`), só o hash no banco; revogação imediata.
- CSRF: Server Actions (checagem de Origin nativa do Next) + token/Origin nos Route Handlers mutáveis.
- Rate limit de login por e-mail+IP na tabela `login_attempts`.
- `proxy.ts` só redireciona não autenticados; **cada** action/handler/consulta revalida sessão + permissão + escopo.
- Resolução de escopo: unidades acessíveis = vínculos do usuário + descendentes onde o papel permitir; consultas sempre filtradas por esse conjunto (SQL), IDs diretos retornam 404.
- Arquivos privados em diretório fora de `public/` servidos por Route Handler com checagem de permissão. **Ressalva**: persistência do disco na Hostinger Node.js Web App precisa ser confirmada (redeploys podem limpar); alternativa é armazenar em diretório persistente fora do app ou BLOB no MySQL para arquivos pequenos.
- PWA: `sw.js` só faz cache de assets estáticos; nunca de páginas privadas, `/api`, financeiro.

## 7. Compatibilidade Hostinger (a validar no hPanel)
Versão do Node disponível (20/22), suporte a `instrumentation.ts`, limite de conexões MySQL (pool inicial: 5), cron e variáveis de ambiente, persistência de disco, e se o plano permite Web Push/cron a cada 5 min. **Nada disso foi verificado ainda.**

## 8. Dados necessários do responsável (não presumidos)
1. Domínio e subdomínio de produção.
2. Confirmação do repositório GitHub (`antoniofilhopfd-dev/berith-app`) e da branch `main`.
3. Versão do Node.js e limites mostrados no hPanel; plano Hostinger.
4. Organização real: lista de caminhos, ministérios, grupos e serviços e quem coordena.
5. Decisão: hash `bcryptjs` (recomendado) ou `argon2`.
6. Dados do primeiro administrador (e-mail; senha definida por script, nunca no repositório).
7. Fuso horário da comunidade (sugestão: America/Sao_Paulo).
8. Web Push agora ou depois da publicação.
