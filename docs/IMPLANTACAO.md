# Implantação na Hostinger (Node.js Web App)

> Este roteiro foi escrito **sem acesso ao hPanel**. Os itens marcados com ⚠️ **precisam ser confirmados** no seu painel,
> porque os nomes de menus, limites e recursos variam conforme o plano. Nenhum domínio, IP, DNS ou credencial foi presumido.

## 0. Dados que você precisa ter em mãos
| Dado | Onde fica |
|---|---|
| Domínio principal e **subdomínio** do app (ex.: `app.SEU-DOMINIO`) | você define |
| Repositório GitHub e branch de produção (`main`) | `antoniofilhopfd-dev/Berith-app` (confirmar) |
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
   - `STORAGE_DIR`: diretório **persistente** para a biblioteca de mídia (imagens e vídeos) (ver seção 5).
   - Redes sociais (só quando for conectar): `TOKEN_ENC_KEY` (32+ caracteres; **guarde-a**), `META_APP_ID/SECRET`, `TIKTOK_CLIENT_KEY/SECRET`, `GOOGLE_CLIENT_ID/SECRET` — veja `docs/INTEGRACOES.md`.
   - `MAX_VIDEO_MB` (padrão 200): limite de vídeo. ⚠️ O proxy/servidor web da Hostinger pode ter um limite de corpo de requisição menor que esse; se vídeos grandes falharem, confirme o limite do plano.
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
  `ADMIN_SENHA='senha longa com números' npm run admin:sql -- email@exemplo.com "Nome"` e execute o SQL no banco. Só o *hash* da senha aparece no SQL.
Depois entre no app, abra **Equipe** e convide as pessoas escolhendo o perfil (Administrador, Coordenador, Integrante ou Aprovador). O convidado cria a senha pelo link e o acesso só é liberado depois que um administrador o aprova.

### Instalação sobre o banco da versão antiga (comunitária)
As migrações 015–018 são **aditivas**: nada é apagado. Administradores gerais antigos viram **Administrador** e “responsável por comunicação” vira **Coordenador**; as demais pessoas ficam **sem perfil** (sem acesso) até serem atribuídas em Equipe. As tabelas comunitárias antigas ficam sem uso. **Faça um backup** (`scripts/backup.sh`) e, se quiser descartá-las, use `npm run limpar:legado` (por padrão só lista; veja `docs/OPERACAO.md`).

## 5. Arquivos privados — ⚠️ persistência do disco
Imagens e vídeos ficam em `STORAGE_DIR`, fora de `public/`.
**Confirme com a Hostinger** se o diretório do aplicativo **persiste entre deploys** (muitos hospedeiros recriam a pasta a cada deploy).
Se não persistir, aponte `STORAGE_DIR` para um caminho persistente (fora da pasta do app) e **inclua-o no backup** (seção 7).

## 6. Verificação antes de abrir ao público
No terminal da hospedagem (ou localmente apontando para o banco): `npm run verificar`.
Ele confere: Node ≥ 20, segredos fortes (recusa valores de exemplo), conexão com o banco, migrações (sem falhas e sem edição), existência de administrador e diretório de arquivos gravável. **Resolva todos os itens "FALHA".**
Depois valide manualmente: login, criar uma produção, enviar uma imagem, confirmar em `audit_log` que o campo `ip` mostra o IP real do visitante
(⚠️ o limitador de tentativas usa o **último** item de `X-Forwarded-For`; se aparecer o IP interno do proxy, avise para ajustarmos).

## 7. Backups (obrigatório)
Ver `docs/OPERACAO.md` → "Backup e restauração". Agende `scripts/backup.sh` diariamente e **teste uma restauração** antes de confiar nele.

## 8. Agendador (publicação, lembretes, métricas e Web Push) — necessário para agendar
O agendador publica o que venceu, gera lembretes de prazo, coleta métricas e entrega notificações push. **Sem ele, nada é publicado sozinho** (a publicação assistida continua funcionando).
1. Gere `CRON_SECRET` com `npm run gerar:segredo`. Para push, `npm run gerar:vapid` (guarde só no painel).
2. ⚠️ hPanel → **Cron Jobs**: a cada 1–5 minutos, chamando
   `curl -fsS -X POST -H "Authorization: Bearer $(cat /CAMINHO/FORA-DO-SITE/.cron_secret)" https://SEU-SUBDOMINIO/api/cron/executar`
   O arquivo `.cron_secret` fica **fora** da pasta pública, com permissão 600; **não** escreva o segredo no comando salvo.
3. Resposta esperada: **200** com o resumo de cada etapa (`fila`, `lembretes`, `metricas`, `push`); 401 (segredo errado); 503 (segredo não configurado). Configurações → Configurações gerais mostra a **última execução**.
4. ⚠️ Teste notificações em aparelhos reais (Android/Chrome e iPhone ≥ 16.4 com o app na Tela de Início). Isso **não** pôde ser validado no desenvolvimento.

## 9. PWA
Abra o app pelo celular em HTTPS: Android mostra "Instalar app"; no iPhone use Compartilhar → "Adicionar à Tela de Início".
O service worker guarda em cache **apenas** ícones e a página offline (nunca páginas privadas, mídia ou dados).

## 10. Rotina de atualização
Merge na `main` → deploy automático → o servidor aplica migrações **pendentes** ao iniciar. Nunca edite uma migração já aplicada: crie uma nova.
