# Relatório final — Berith-app, Ministério de Comunicação

Data da verificação: 19/10/2026 · Ambiente: desenvolvimento local (Node 22, MariaDB 10.11, Chromium/Playwright). **Nada foi publicado em produção nem conectado a redes reais.**

## 1. O que foi preservado
Next.js/React/TypeScript, MySQL com migrações versionadas e checksum, autenticação, sessões, recuperação de senha e convites, RBAC (reescrito para perfis globais), auditoria, armazenamento privado e proteção de arquivos, notificações internas + Web Push, PWA/service worker, scripts de backup/restauração/retenção/LGPD/verificação, identidade visual (logo, paleta verde/cobre/marrom, “Paz e alegria”), compatibilidade Node 20/22.

## 2. O que foi removido
Do **produto** (código, rotas, serviços, testes): membros e estruturas, escalas, presenças/check-in, eventos e inscrições, comunicados, tarefas e reuniões, formação/orações, financeiro e contribuições, liturgia (e sua importação). **Nenhum dado foi apagado**: as tabelas antigas permanecem no banco; `npm run limpar:legado` (dry-run por padrão) as lista e só remove com opção explícita e backup confirmado.

## 3. O que foi implementado (e verificado em execução)
Dashboard · Planejamento (semana/mês, campanhas, editorias, ideias→produção, datas comemorativas calculadas e próprias) · Calendário (mês/semana/dia, filtros, criar ao clicar, **arrastar e soltar**, detalhes rápidos, versão em lista no celular) · Produção (Kanban/lista, editor com contador, prévia por rede e do feed do Instagram, salvamento automático com controle de concorrência, duplicar, modelos, versões e comparação, histórico, comentários) · Fluxo Rascunho→…→Publicado com aprovação, ajustes, invalidação ao editar, bloqueio de não aprovados (configurável) · Agendamento, reagendamento, cancelamento, fila, tentativas, reprocesso seguro, **publicação assistida** · Biblioteca de mídia (upload em fluxo, pastas, etiquetas, busca, duplicados, lixeira de 30 dias) · Relatórios orgânicos (comparação de períodos, estados “indisponível/não conectada/sem dados”, PDF e Excel) · Equipe (4 perfis, convites com aprovação, carga de trabalho) · Configurações (perfil, ministério/preferências, permissões, redes e integrações, notificações, segurança e sessões, auditoria, backup, geral) · Integrações Instagram/Facebook/TikTok/YouTube (OAuth, tokens cifrados, renovação, publicação, métricas, logs).

## 4. Testes executados (comandos reais)
| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | 0 erros |
| `npx eslint .` | 0 erros (2 avisos de configuração) |
| `npm test` (vitest, MariaDB real) | **188 testes em 13 arquivos — todos passaram** |
| `npm run build` | compilou |
| e2e navegador real — tour de 28 telas (desktop) | 57 verificações OK |
| e2e — fluxos completos (criar→revisar→ajustes→aprovar→agendar→cron→falha→publicação assistida→calendário→upload→relatórios/exportação) | 38 OK |
| e2e — celular (390 px) e tablet, teclado, rótulos e `alt` | 28 OK |
| e2e — segurança HTTP (cabeçalhos/CSP, cookies, acesso negado, XSS, path traversal, força bruta, cron) | 39 OK |
| e2e — estados vazios | 6 OK |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| Backup → restauração em banco de teste → contagens; adulteração detectada | OK (execução real) |

Os testes e2e exigiram corrigir **defeitos reais**, já corrigidos: arrastar do calendário abortava (componente recriado a cada render); Kanban expandia a viewport no celular; páginas negadas respondiam 500; `GET_LOCK` em pool não garantia exclusão mútua (afetava também o push anterior).

## 5. Auditoria de segurança
Resumo em `docs/SEGURANCA.md` (23 itens classificados: corrigido / vulnerável / não identificado / não aplicável / não verificável). Único item **vulnerável** aceito: 5 alertas *high* em dependência **de desenvolvimento** (`braces`, via ESLint), fora do runtime.

## 6. Integrações — o que foi e o que NÃO foi testado
**Testado:** OAuth (state de uso único, tokens cifrados, renovação), publicação, polling, erros, reconexão, métricas, mascaramento e SSRF — contra **servidores simulados** (37 testes).
**NÃO testado contra as plataformas reais** (sem credenciais): Instagram, Facebook, TikTok, YouTube. Não declare a publicação automática pronta antes de um teste com conta de homologação. Pendências externas (apps, App Review/auditorias, domínio, HTTPS): `docs/INTEGRACOES.md`.

## 7. Pendências que dependem de você / da Hostinger
Domínio/HTTPS e DNS; confirmar no hPanel: Node 22, MySQL, **persistência de `STORAGE_DIR`**, **limite de corpo de requisição para vídeos**, cron (`/api/cron/executar`), SSH; criar o primeiro administrador; SMTP (opcional); chaves VAPID; apps e credenciais das redes; revisão do aviso de privacidade; teste em aparelhos reais (Android/iPhone, push); repetir o teste de backup na hospedagem; definir retenção de auditoria; decidir quando executar `limpar:legado`.

## 8. Limitações conhecidas
Sem 2FA; limitadores de upload/exportação em memória (por instância); sem webhooks (métricas por consulta); Stories em vídeo no Facebook não automáticos; uma conta por rede; vídeos no navegador de teste (Chromium sem H.264) não reproduzem na prévia — não afeta usuários de navegadores completos; datas comemorativas são **sugestões calculadas** (confirmar no calendário oficial); desempenho/carga não medidos; MySQL 8 não testado (MariaDB 10.11 sim).

## 9. Publicação
Não realizada (sem acesso à Hostinger). Roteiro: `docs/IMPLANTACAO.md`. Não houve merge na `main` nem deploy.
