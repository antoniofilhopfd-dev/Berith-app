# Berith-app — Ministério de Comunicação (Comunidade Católica Nova Berith)

Plataforma de gestão de Social Media da equipe de comunicação: planejamento editorial, calendário, produção com prévias, fluxo de aprovação, agendamento e publicação (Instagram, Facebook, TikTok, YouTube), biblioteca de mídia e relatórios orgânicos.

## Começando (desenvolvimento)
```bash
cp .env.example .env.local        # preencha DB_*, SESSION_SECRET, CRON_SECRET, TOKEN_ENC_KEY (npm run gerar:segredo)
npm install
npm run dev                       # as migrações rodam ao iniciar
ADMIN_SENHA='uma-senha-longa-123' node --env-file=.env.local scripts/criar-admin.mjs voce@exemplo.com "Seu Nome"
# opcional: dados fictícios
PERMITIR_SEED=sim node --env-file=.env.local scripts/seed-demo.mjs
```
Testes: `npm test` (usa um banco `*_test`; veja `vitest.config.mts`). Verificações: `npm run typecheck`, `npm run lint`, `npm run build`.

## Documentação
- `docs/ARQUITETURA.md` — como o sistema é organizado
- `docs/IMPLANTACAO.md` — publicar na Hostinger (Node.js Web App + MySQL)
- `docs/INTEGRACOES.md` — o que falta providenciar nas plataformas (credenciais, permissões, auditorias)
- `docs/OPERACAO.md` — comandos, backup/restauração, retenção, incidentes
- `docs/SEGURANCA.md` — controles e resultado da auditoria
- `docs/RELATORIO-FINAL.md` — estado da entrega, testes e pendências

> Nada de segredos no repositório. Dados de demonstração são fictícios e o seed recusa rodar em produção.
