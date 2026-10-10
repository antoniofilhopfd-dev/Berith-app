# Implantação na Hostinger (Node.js Web App)

> Este roteiro foi escrito **sem acesso ao hPanel**. Os itens marcados com ⚠️ **precisam ser confirmados** no seu painel,
> porque os nomes de menus, limites e recursos variam conforme o plano. Nenhum domínio, IP, DNS ou credencial foi presumido.

## 0. Dados que você precisa ter em mãos
| Dado | Onde fica |
|---|---|
| Domínio principal e **subdomínio** do app (ex.: `app.SEU-DOMINIO`) | você define |
| Repositório GitHub e branch de produção (`main`) | `antoniofilhopfd-dev/berith-app` (confirmar) |
| Plano Hostinger com **Node.js Web App** e **MySQL** | hPanel |
| Versão do Node disponível no hPanel | ⚠️ escolher **22** (ou 20; ambas foram testadas) |

## 1. Banco de dados MySQL
1. hPanel → **Bancos de dados MySQL** → criar banco e usuário (guarde nome, usuário, senha e **host** informados pelo painel).
2. O usuário precisa de todos os privilégios **sobre esse banco** (as migrações criam tabelas e alteram colunas).
3. ⚠️ Conferir o limite de conexões simultâneas do plano. O app usa `DB_POOL_LIMIT=5` por padrão.
4. Compatibilidade: testado em **MariaDB 10.11** e com SQL portável (sem recursos exclusivos de uma só engine). ⚠️ Se o seu servidor for **MySQL 8**, valide com o passo 6 antes de abrir ao público.

## 2. Aplicativo Node.js
1. hPanel → **Sites → Adicionar site → Aplicativo Node.js** → importar do **GitHub** (autorize o acesso ao repositório).
2. **Branch:** `main`. **Comando de build:** `npm run build`. **Comando de início:** `npm start`.
3. **Versão do Node:** 22 (ou 20). O `package.json` exige `>=20.9.0`.
4. Cadastre as **variáveis de ambiente** no painel (nunca no repositório). Use `.env.example` como lista:
   - Obrigatórias: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `NODE_ENV=production`, `SESSION_SECRET`, `APP_URL`.
   - `SESSION_SECRET` e `CRON_SECRET`: gere localmente com `npm run gerar:segredo`.
   - `STORAGE_DIR`: diretório **persistente** para fotos, PDFs, áudios e comprovantes (ver seção 5).
5. O build **não** precisa de credenciais do banco. As migrações são aplicadas **ao iniciar** o servidor, sob bloqueio.
   Se uma migração falhar, o servidor **não sobe** e o log mostra o erro (sem senhas). Ver `docs/OPERACAO.md` → "Falha de migração".

## 3. Subdomínio, DNS e SSL
1. hPanel → **Domínios → Subdomínios** → criar o subdomínio e apontá-lo para o aplicativo Node.js.
2. DNS: use **somente** os registros que o hPanel indicar para o subdomínio (A/CNAME). Não copie valores de exemplos.
3. **SSL:** ative o certificado (Let's Encrypt/AutoSSL) para o subdomínio e **force HTTPS**.
4. Sem HTTPS o login não funciona em produção: o cookie de sessão usa o prefixo `__Host-` e o atributo `Secure`.

## 4. Primeiro acesso e administrador
O sistema **não** tem cadastro público. Crie o primeiro administrador **depois** que o app iniciou uma vez (as tabelas já existem):
- **Com terminal/SSH:** `ADMIN_SENHA='senha longa com números' npm run admin:criar -- email@exemplo.com "Nome"` (usa o `.env` do servidor).
- **Sem terminal (phpMyAdmin):** gere o SQL **no seu computador**:
  `ADMIN_SENHA='senha longa com números' npm run admin:sql -- email@exemplo.com "Nome"` e execute o SQL no banco.
  Só o *hash* da senha aparece no SQL.
Depois entre no app, cadastre as **estruturas** (caminhos, ministérios, grupos, serviços), convide as coordenações e atribua funções.

## 5. Arquivos privados — ⚠️ persistência do disco
Fotos, PDFs, áudios e comprovantes ficam em `STORAGE_DIR`, fora de `public/`.
**Confirme com a Hostinger** se o diretório do aplicativo **persiste entre deploys** (muitos hospedeiros recriam a pasta a cada deploy).
Se não persistir, aponte `STORAGE_DIR` para um caminho persistente (fora da pasta do app) e **inclua-o no backup** (seção 7).

## 6. Verificação antes de abrir ao público
No terminal da hospedagem (ou localmente apontando para o banco): `npm run verificar`.
Ele confere: Node ≥ 20, segredos fortes (recusa valores de exemplo), conexão com o banco, migrações (sem falhas e sem edição), existência de administrador e diretório de arquivos gravável. **Resolva todos os itens "FALHA".**
Depois valide manualmente: login, criar uma estrutura, enviar um arquivo, confirmar em `audit_log` que o campo `ip` mostra o IP real do visitante
(⚠️ o limitador de tentativas usa o **último** item de `X-Forwarded-For`; se aparecer o IP interno do proxy, avise para ajustarmos).

## 7. Backups (obrigatório)
Ver `docs/OPERACAO.md` → "Backup e restauração". Agende `scripts/backup.sh` diariamente e **teste uma restauração** antes de confiar nele.

## 8. Agendador (lembretes e Web Push) — opcional
1. Gere as chaves: `npm run gerar:vapid` (guarda só no painel) e `npm run gerar:segredo` para `CRON_SECRET`.
2. ⚠️ hPanel → **Cron Jobs** (se o plano tiver): a cada 5 minutos, chamando
   `curl -fsS -X POST -H "Authorization: Bearer $(cat /CAMINHO/FORA-DO-SITE/.cron_secret)" https://SEU-SUBDOMINIO/api/push/enviar`
   O arquivo `.cron_secret` fica **fora** da pasta pública, com permissão 600; **não** escreva o segredo no comando salvo.
   Se o cron do plano não permitir isso com segurança, use um agendador externo que guarde segredos.
3. Resposta esperada: **200** (processado), 401 (segredo errado), 503 (VAPID/segredo não configurado).
4. ⚠️ **Teste em aparelhos reais** (Android/Chrome e iPhone ≥ 16.4 com o app instalado na Tela de Início). Isso **não** pôde ser validado no desenvolvimento.

## 9. PWA
Abra o app pelo celular em HTTPS: Android mostra "Instalar app"; no iPhone use Compartilhar → "Adicionar à Tela de Início".
O service worker guarda em cache **apenas** ícones e a página offline (nunca páginas privadas, financeiro ou dados).

## 10. Rotina de atualização
Merge na `main` → deploy automático → o servidor aplica migrações **pendentes** ao iniciar. Nunca edite uma migração já aplicada: crie uma nova.
