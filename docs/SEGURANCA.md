# Segurança — modelo, evidências e riscos residuais

## Camadas (nenhuma depende só do `proxy.ts`)
1. **`proxy.ts`**: primeira barreira — apenas redireciona quem não tem cookie. Não decide permissão.
2. **Páginas/layouts**: `requireUser()` valida a sessão **no banco a cada requisição** (revogar/suspender vale na hora).
3. **Server Actions** (`guarded()`): sessão + conversão segura de erros; **a autorização fina fica no serviço**.
4. **Serviços** (`lib/services/*`): `assertCan(usuário, recurso, ação, estrutura)` antes de qualquer leitura/escrita; consultas filtradas por escopo no SQL.
5. **Route Handlers** (`/api/arquivos`, exportações, push): sessão + permissão no contexto + verificação de origem em mutações.
6. **Banco**: chaves estrangeiras, `UNIQUE` (dupla confirmação, duplo estorno, duplicidade de notificação/entrega), `CHECK` (valor > 0), transações.

## Controle de acesso
- RBAC com **escopo organizacional** e **negação por padrão** (`lib/permissions`): papel com escopo vale na estrutura e **descendentes**, nunca nas irmãs/pai; papéis globais exigem `scope NULL`.
- Integrante comum só **vê** (lista restrita de recursos) a própria estrutura; **financeiro e contribuições individuais nunca** vêm de vínculo organizacional.
- Acesso a recurso de outra estrutura por URL/ID devolve **404** (não revela existência).
- Remover vínculo/papel ou suspender usuário revoga o acesso **imediatamente** (testado).

## Autenticação e sessão
- Senha com **bcrypt (custo 12)** — escolha deliberada: `argon2` exige binário nativo, risco em hospedagem compartilhada.
- Sessão: token aleatório de 256 bits; **só o hash SHA-256** fica no banco; cookie `HttpOnly`, `Secure`, `SameSite=Lax`, prefixo `__Host-` em produção; expiração e revogação no servidor.
- Bloqueio de tentativas: 5 falhas/15 min por e-mail e 20 por IP; resposta idêntica para e-mail inexistente, senha errada e usuário suspenso; tempo equalizado (hash fictício).
- **IP do cliente**: último item de `X-Forwarded-For` (o início é forjável) — evita burlar o limite.
- Redefinição de senha: token de uso único (hash no banco), 60 min, máx. 3 pedidos/h, resposta neutra, **encerra todas as sessões**.
- Cadastro **somente por convite + aprovação**; sem cadastro público.
- Redirecionamento pós-login só para caminhos internos (anti *open redirect*).

## Dados e arquivos
- SQL **sempre parametrizado** (`mysql2`); buscas escapam `%`/`_`.
- Valores monetários em **centavos inteiros**; entradas validadas por Zod; parsing de moeda sem ponto flutuante.
- Arquivos: fora de `public/`, nome aleatório, permissão 600; **tipo verificado pela assinatura binária** (ignora nome/Content-Type); SVG/HTML/executáveis recusados; limites por tipo; download autorizado a cada requisição, `Cache-Control: private, no-store`, `nosniff`, CSP restritivo, `Range` para áudio.
- Financeiro: aprovação por **outra pessoa**; aprovado é **imutável** (correção por estorno com lançamento reverso); período fechado trava lançar/editar/aprovar; reabrir exige administração + motivo; tudo auditado; contribuições individuais exigem permissão **específica** (`contribuicoes`) e não aparecem nem no CSV sem ela.
- CSV com neutralização de fórmulas (`= + - @`).
- Web Push: segredo do agendador comparado em tempo constante, método único (POST), recusa segredo vazio/curto; payload sem dados sensíveis; inscrições inválidas (404/410) removidas.
- Cabeçalhos: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, **HSTS**, `COOP`.
- Service worker: cache **somente** de ícones/logo/página offline (verificado por teste e no navegador).
- Dependências de produção: `npm audit --omit=dev` → **0 vulnerabilidades**.

## Mapa dos requisitos de teste (seção 16 do projeto)
| Requisito | Evidência |
|---|---|
| Login/logout; sessão revogada/expirada/suspenso | `tests/auth.test.ts`, e2e |
| Recuperação de senha, convite, aprovação | `tests/membros-senha.test.ts` |
| Permissões por estrutura; bloqueio de outros ministérios/caminhos/grupos/serviços | `tests/permissoes.test.ts`, `estruturas.test.ts`, `escalas.test.ts`, `eventos.test.ts`, `tarefas-reunioes.test.ts` |
| Acesso por URL direta | serviços devolvem `NotFound` (testes) + 404 no navegador (e2e 03–08) |
| Chamada direta a Server Actions | `tests/server-actions.test.ts` (sem sessão) e `tests/actions-autorizacao.test.ts` (autenticado sem permissão) |
| Proteção de endpoints | `tests/push-rotas.test.ts`, `tests/arquivos.test.ts` |
| Documentos e fotos | `tests/arquivos.test.ts` |
| Migrações, falha e recuperação, concorrência | `tests/migracoes.test.ts` |
| Eventos, escalas, presenças, tarefas | testes dedicados |
| Financeiro e estornos | `tests/financeiro.test.ts` |
| Notificações e push | `tests/notificacoes.test.ts`, `push-rotas.test.ts` |
| PWA | `tests/service-worker.test.ts` + e2e 08 |
| Compatibilidade mobile | e2e a 390 px (sem *overflow* lateral) e emulação de iPhone 13 |
| Operação (retenção, LGPD, verificação, backup) | `tests/operacao.test.ts` + execução real de backup/restauração |

## Riscos residuais e limitações (transparência)
1. **Sem verificação em dispositivos reais**: Web Push e instalação da PWA (Android/iPhone) não foram validados em aparelhos.
2. **Sem 2FA**: a proteção da conta é senha + limite de tentativas.
3. **CSP estrita não aplicada** (o Next injeta scripts inline; exigiria *nonces*). Mitigações: sem HTML de usuário (texto escapado), cabeçalhos acima.
4. **Arquivos sem antivírus**; a verificação é de tipo/assinatura e tamanho.
5. **Sem criptografia em repouso** pela aplicação (depende do provedor); backups só são criptografados se `BACKUP_GPG_RECIPIENT` for usado.
6. **`X-Forwarded-For`**: a correção assume que o proxy da hospedagem **anexa** o IP real; confirmar após o deploy (ver `IMPLANTACAO.md`, seção 6).
7. **Bloqueio por e-mail** permite que alguém trave temporariamente a conta de outra pessoa (15 min); aceitável frente ao risco de força bruta.
8. **Persistência do disco** de arquivos e disponibilidade de cron/`mysqldump` na Hostinger **não confirmadas**.
9. Dependências **de desenvolvimento** (`eslint-config-next` → `braces`): 5 avisos altos que **não vão para produção**.
10. **Liturgia**: textos protegidos por direitos autorais **não são importados automaticamente**; dependem de cadastro com fonte/autorização.
