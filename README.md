# Nova Berith — aplicativo da Comunidade Católica

Next.js 16 (App Router) · TypeScript · MySQL (`mysql2`) · PWA. Uso exclusivo de membros autorizados.

## Desenvolvimento local
```bash
npm install
cp .env.example .env.local        # ajuste DB_* e gere SESSION_SECRET com: npm run gerar:segredo
npm run dev                       # as migrações são aplicadas ao iniciar
npm test                          # exige um MySQL/MariaDB local com o banco *_test (veja vitest.config.mts)
npm run typecheck && npm run lint && npm run build
```
Primeiro administrador: `ADMIN_SENHA='...' npm run admin:criar -- email "Nome"`.

## Estrutura
`app/` páginas, Server Actions e rotas · `components/` · `lib/db` (pool, migrações) · `lib/auth` · `lib/permissions` · `lib/services` (regras de negócio) ·
`lib/validation` · `db/migrations` (SQL versionado, incorporado ao build) · `scripts/` (operação) · `public/` (manifesto, ícones, `sw.js`) · `tests/`.

## Documentos
- `docs/IMPLANTACAO.md` — publicação na Hostinger (DNS, SSL, variáveis, cron, PWA).
- `docs/OPERACAO.md` — migrações, backup/restauração, retenção, LGPD, segredos.
- `docs/SEGURANCA.md` — modelo de segurança, evidências e riscos residuais.
- `docs/RELATORIO-FINAL.md` — relatório de alterações e critérios de aceitação.
- `docs/ARQUITETURA.md` — decisões da etapa 01. `docs/prints/` — capturas de tela de cada etapa.
