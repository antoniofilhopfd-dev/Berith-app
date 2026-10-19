# Arquitetura

Berith-app é a ferramenta de **gestão de Social Media do Ministério de Comunicação** da Comunidade Católica Nova Berith: planejar → produzir → revisar → aprovar → agendar → publicar → analisar. Uso exclusivo da equipe (sem multiempresa, sem módulos comunitários).

## Pilha
Next.js 16 (App Router, Server Components e Server Actions, `proxy.ts`) · React 19 · TypeScript · Tailwind 4 · MySQL/MariaDB (`mysql2`, SQL portável) · zod · `pdf-lib` (PDF) · gerador XLSX próprio (sem dependência) · PWA.

## Camadas
```
app/                  páginas, Server Actions e rotas de API (finas: validam, chamam serviços)
  (app)/              área autenticada (layout com menu lateral/barra inferior)
  api/                midias (upload/visualização), midias/publica (link assinado), relatorios/exportar,
                      integracoes/[rede]/callback (OAuth), cron/executar, push/*
components/           UI (editor, previews, calendário, nav, upload…)
lib/permissions       RBAC (perfis globais) — can/assertCan, usado por TODO serviço
lib/services/         regras de negócio (publicacoes, agendamento, midia, planejamento, equipe, relatorios, painel…)
lib/integracoes/      provedores (Meta, TikTok, YouTube), cifra de tokens, contas/OAuth, HTTP seguro
lib/export/           xlsx, pdf, montagem do relatório
lib/editorial.ts      regras puras (formatos × redes, limites, transições, diff) — compartilhado com o navegador
lib/db/               pool, migrador (GET_LOCK, checksum), `comTrava`
db/migrations/        001–018 (015–018 = Ministério de Comunicação; 001–014 = legado comunitário, mantido)
scripts/              admin, manutenção/retenção, LGPD, backup/restauração, verificação de ambiente, limpar-legado, seed-demo
```
Regra de ouro: **autorização nos serviços**, nunca só na interface. Páginas chamam `exigir()` (404) e os serviços `assertCan` (403/erro seguro).

## Perfis e permissões (`role_permissions`)
Administrador (tudo) · Coordenador (planejamento, aprovação, agendamento, mídia, relatórios, ver equipe/integrações) · Integrante (produz, envia mídia, comenta; edita só o que criou/lhe foi atribuído) · Aprovador (vê e decide). Papéis legados da comunidade não concedem nada.

## Modelo de dados editorial
`publicacoes` (status: rascunho → em_producao → em_revisao ⇄ ajustes_solicitados → aprovado → agendado → publicado | cancelado) 1—N `publicacao_redes` (envio por rede: pendente/agendada/publicando/publicada/falhou/cancelada, tentativas, erro) · `publicacao_midias` · `publicacao_versoes` (snapshots comparáveis) · `publicacao_historico` · `aprovacoes` · `pub_comentarios` · `modelos` · `campanhas` · `editorias` · `ideias` · `datas_especiais` · `midias` (+ pastas, etiquetas) · `redes_contas` (tokens cifrados) · `publicacao_tentativas` · `integracao_logs` · `metricas_publicacao` / `metricas_conta` (NULL = a plataforma não informa).

## Fluxo e regras-chave
- Editar o **conteúdo** (legenda, hashtags, mídias, formato, redes) de algo em revisão/aprovado/agendado **invalida a aprovação**; prazo/responsável/observações não.
- Agendar exige aprovado (configurável), conteúdo válido para cada rede (formato, limites de texto, mídia) e horário futuro.
- **Publicação**: o cron (`POST /api/cron/executar`) processa a fila com exclusão mútua + reivindicação atômica; 3 tentativas com espera crescente para falhas transitórias; erro definitivo ou resultado incerto exige ação humana. Sem conta conectada → **publicação assistida** (registrada como manual; nunca fingida).
- Mídia: biblioteca privada; as redes recebem **links temporários assinados**.
- Métricas: só oficiais; relatório distingue valor / indisponível / não conectada / sem dados.

## Datas e fuso
Armazenamento em UTC; exibição e formulários em America/Sao_Paulo. Datas comemorativas são calculadas (Páscoa pelo algoritmo de Meeus) e podem ser complementadas pelo ministério.
