# Relatório final — Nova Berith (etapas 01–08)

Branch de desenvolvimento: `claude/charming-brahmagupta-t5epqr` (nada foi publicado na `main`; o merge e o deploy ficam a seu critério).

## 1. O que foi entregue
| Etapa | Entrega principal | Evidência |
|---|---|---|
| 01 Arquitetura | Auditoria (repositório vazio), stack, modelo de dados, segurança | `docs/ARQUITETURA.md` |
| 02 Fundação | Next 16, MySQL, migrações com bloqueio e checksum, login/sessões, RBAC com escopo, `proxy.ts` | testes + `docs/prints/etapa02-*` |
| 03 Estruturas | Caminhos/ministérios/grupos/serviços, vínculos, transferência, convite e aprovação, recuperação de senha, papéis | `etapa03-*` |
| 04 Vida comunitária | Agenda (mês/semana/lista), recorrência, inscrições com vagas, comunicados com leitura, painel | `etapa04-*` |
| 05 Organização | Escalas (conflitos, indisponibilidade, substituição, CSV), presenças (correção auditada, QR), tarefas, reuniões e decisões | `etapa05-*` |
| 06 Espiritualidade e arquivos | Liturgia (calendário calculado + cadastro com fonte), orações/formação/trilhas/favoritos, armazenamento privado, álbuns, documentos, anexos | `etapa06-*` |
| 07 Financeiro e notificações | Financeiro em centavos (aprovação, estorno, fechamento, prestação de contas, conciliação), notificações, lembretes, Web Push, PWA | `etapa07-*` |
| 08 Publicação | Identidade visual, hardening, verificação de ambiente, retenção/LGPD, backup/restauração, documentação | `docs/*` |

Identidade: logo e paleta (verde, cobre e marrom) extraídas da logo enviada; ícones e manifesto da PWA gerados a partir dela.

## 2. Verificações realizadas (reais, neste ambiente)
- **291 testes automatizados** (24 arquivos) contra **MariaDB 10.11 real**: todos passam.
- **146 verificações no navegador** (Chromium, 390 px e emulação de iPhone 13), em 6 fluxos ponta a ponta com vários usuários: todas passam. **~280 capturas de tela** em `docs/prints/`.
- `tsc --noEmit` e `eslint`: sem erros (2 avisos de estilo em arquivos de configuração).
- **Build de produção** e **suíte completa também em Node 20.20** (versão mínima); servidor de produção em Node 20 passou no fluxo financeiro/PWA.
- `npm audit --omit=dev`: **0 vulnerabilidades** (Nodemailer atualizado para 10.0.16 após o achado).
- **Backup e restauração** executados de verdade: backup → dano proposital no banco ativo → restauração em banco de teste → contagens e saldo conferidos; adulteração do backup detectada e restauração abortada (defeito encontrado e corrigido no processo).

## 3. Defeitos encontrados pelos testes e corrigidos durante o trabalho
Formulário apagava dados após erro (React 19) · botões/seletor de arquivo em inglês e estourando a largura · 404 em inglês ·
service worker recarregava a página na primeira visita (perdia o que se digitava) · IP do limitador de tentativas forjável (`X-Forwarded-For`) ·
restauração continuava após falha de checksum · Nodemailer vulnerável · aviso do Turbopack sobre rastreamento de caminho dinâmico.

## 4. Critérios de aceitação (seção 20 do projeto)
| Critério | Situação |
|---|---|
| Build de produção concluído | ✅ Node 22 e Node 20 |
| Servidor iniciar na Hostinger | ⏳ **pendente** — validado com `next start` local; falta o hPanel |
| MySQL conectar com as variáveis configuradas | ✅ local (MariaDB) · ⏳ Hostinger |
| Migrações pendentes aplicadas com segurança | ✅ testado (bloqueio, checksum, falha/recuperação, concorrência) |
| Login funcionar | ✅ local |
| Acesso por caminho, ministério, grupo e serviço validado | ✅ testes + navegador |
| Site abrir por HTTPS | ⏳ **pendente** — depende de domínio, DNS e SSL (não presumidos) |
| PWA instalável | 🟡 manifesto, ícones, service worker e orientação de instalação **implementados e testados**; ⏳ validar em aparelhos reais |
| Arquivos privados protegidos | ✅ testes + navegador |
| Funcionalidades financeiras com testes | ✅ |
| Backup e restauração validados | 🟡 ✅ no ambiente de desenvolvimento · ⏳ repetir na Hostinger |
| Procedimentos de operação documentados | ✅ `IMPLANTACAO.md`, `OPERACAO.md`, `SEGURANCA.md` |

**O projeto ainda não pode ser declarado "pronto para produção"**: faltam os itens ⏳, que dependem de você/da Hostinger.

## 5. O que preciso de você (nada foi presumido)
1. **Domínio e subdomínio** do app e confirmação do **repositório/branch** (`main`) para o deploy.
2. No **hPanel**: versão do Node (20 ou 22), limite de conexões MySQL, se o disco do app **persiste entre deploys** (senão, definir `STORAGE_DIR` persistente), se há **cron** e **terminal/SSH** (para `backup.sh` e criação do administrador).
3. **Administrador inicial**: e-mail e nome (a senha você define, localmente, com `npm run admin:sql`).
4. **SMTP** (opcional): sem ele, links de convite e de senha são entregues manualmente.
5. **Estrutura real**: lista de caminhos, ministérios, grupos e serviços e quem coordena (cadastro pela interface).
6. **Liturgia**: uma fonte **com autorização de uso** para leituras/Liturgia das Horas se quiser importação automática (hoje: cadastro manual com fonte).
7. **Revisão jurídica** do aviso de privacidade e confirmação com a contabilidade do **prazo de guarda** dos registros financeiros.
8. **Teste em aparelhos reais** (Android e iPhone ≥ 16.4) da instalação e das notificações push.

## 6. Como publicar (resumo)
1. Faça o merge da branch de desenvolvimento na `main` (posso abrir o *pull request* quando você pedir).
2. Siga `docs/IMPLANTACAO.md` (banco, app Node.js, variáveis, subdomínio, SSL, primeiro administrador).
3. `npm run verificar` até não haver itens críticos; teste login, arquivos e (se usar) o agendador.
4. Agende o backup e **teste a restauração** na hospedagem.
