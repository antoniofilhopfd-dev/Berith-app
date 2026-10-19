# Operação e manutenção

## Comandos
| Comando | Para quê |
|---|---|
| `npm run verificar` | Checa ambiente de produção (segredos, banco, migrações, arquivos). |
| `npm run admin:criar -- email "Nome"` | Cria administrador (precisa de terminal; senha via `ADMIN_SENHA`). |
| `npm run admin:sql -- email "Nome"` | Gera SQL do administrador para executar no phpMyAdmin. |
| `npm run manutencao` | Retenção/descarte diário (sessões, tentativas de login, tokens, notificações, logs de integração e mídias na lixeira há mais de 30 dias). |
| `npm run limpar:legado` | Lista as tabelas da antiga versão comunitária (nada é alterado). `-- --apagar-vazias` remove só as vazias; `-- --apagar-tudo --confirmo-backup` remove todas (**irreversível**; em produção exige também `PERMITIR_APAGAR_LEGADO=sim`). Faça e confira o backup antes. |
| `npm run lgpd -- exportar email` | Exporta os dados pessoais de uma pessoa (direito de acesso). |
| `npm run lgpd -- anonimizar email --confirmo` | Remove identificação e dados de uso (irreversível). |
| `npm run gerar:segredo` / `gerar:vapid` | Gera segredos / chaves de Web Push (não grava arquivos). |
| `scripts/backup.sh` / `scripts/restaurar.sh` | Backup e restauração (abaixo). |

## Migrações
- Ficam em `db/migrations/NNN_nome.sql` e são **incorporadas ao build**. São aplicadas na inicialização, sob `GET_LOCK` (duas instâncias não aplicam a mesma).
- A tabela `schema_migrations` guarda id, checksum, data e resultado (`ok`/`falhou`).
- **Nunca edite** uma migração já aplicada: o servidor recusa subir se o checksum divergir. Crie `NNN+1`.
- DDL no MySQL faz *commit* implícito; por isso cada migração é escrita de forma **idempotente** (`IF NOT EXISTS`, `INSERT IGNORE`).

### Falha de migração (recuperação)
1. O servidor não sobe e o log mostra `Falha na migração NNN_x: <mensagem>` (sem credenciais). A linha em `schema_migrations` fica `resultado='falhou'`.
2. **Faça backup** (`scripts/backup.sh`) antes de qualquer correção manual.
3. Descubra a causa (privilégio, sintaxe, objeto já existente em estado parcial). Como a migração é idempotente, a parte já aplicada é ignorada na nova tentativa.
4. Se o problema está no **arquivo SQL** e ele **nunca foi aplicado com sucesso** em produção, corrija o arquivo e reinicie. Se **já foi aplicado** (`ok`), **não edite**: crie uma nova migração.
5. Reinicie o aplicativo; ele reexecuta apenas migrações pendentes/falhas.
6. Em último caso, restaure o backup (abaixo) e reaplique.

## Backup e restauração
**O que protege:** banco (todas as tabelas, inclusive tokens cifrados e auditoria) e arquivos privados (`STORAGE_DIR`).
- **Frequência sugerida:** diário (noite). **Retenção:** 30 dias (`RETENCAO_DIAS`); mantenha ao menos 1 backup mensal por 12 meses fora do servidor.
- **Execução:** `scripts/backup.sh` (usa `mysqldump --single-transaction`; a senha vai por `MYSQL_PWD`). Gera `nb-<data>.sql.gz`, `.arquivos.tar.gz`, `.manifesto.txt` (contagens) e `.sha256`.
- **Armazenamento protegido:** `BACKUP_DIR` com permissão 700, **fora** da pasta pública, e cópia periódica para outro local (outro provedor/computador). Defina `BACKUP_GPG_RECIPIENT` para criptografar com GPG antes de copiar.
- **Restauração (teste):** `scripts/restaurar.sh nb-<data>` → restaura em um banco de **teste** (`<DB_NAME>_restauracao_teste`), confere checksums e contagens contra o manifesto e retorna erro se algo divergir. **Não toca na produção.**
- **Restauração em produção:** `scripts/restaurar.sh nb-<data> --producao-confirmo` (substitui os dados atuais!). Pare o app antes e faça um backup do estado atual.
- **Arquivos enviados:** o `.arquivos.tar.gz` é extraído para `STORAGE_DIR` (em teste, para uma pasta temporária).
- **Backup só é confiável depois de testar a restauração.** Faça esse teste ao configurar e **a cada trimestre**.

> Estado da validação: o procedimento foi testado em MariaDB 10.11 **no ambiente de desenvolvimento, com o esquema atual** (backup → restauração em banco de teste → contagens conferidas; adulteração do arquivo detectada e restauração abortada). **A chave `TOKEN_ENC_KEY` não faz parte do backup**: guarde-a separadamente, ou as redes precisarão ser reconectadas após uma restauração.
> **Falta repetir o teste na Hostinger** (disponibilidade de `mysqldump`/terminal e agendamento).

## Retenção de dados (LGPD)
| Dado | Retenção | Como |
|---|---|---|
| Sessões expiradas/revogadas, tentativas de login, tokens de senha usados/expirados, convites vencidos | 30 dias | `npm run manutencao` (agende diariamente) |
| Notificações lidas | 180 dias | idem |
| Entregas de push | 90 dias | idem |
| Logs de integração | 180 dias | idem |
| Mídias removidas (lixeira) | 30 dias, depois apagadas de vez (arquivo e registro) | idem |
| **Auditoria, publicações, comentários, aprovações e histórico** | **mantidos** (registro editorial e de responsabilidade; **defina o prazo com a coordenação/assessoria jurídica**) | não são descartados automaticamente |
Pedidos de titulares: `npm run lgpd -- exportar|anonimizar`. A anonimização remove nome, e-mail, perfil, perfis de acesso, sessões, dispositivos e preferências; preserva o histórico editorial e a auditoria **sem identificar** a pessoa.

## Segredos
- Troca de `SESSION_SECRET`: encerra todas as sessões (todos precisarão entrar de novo). Troque se houver suspeita de vazamento.
- Troca de `CRON_SECRET`: atualize também o agendador. Troca de chaves VAPID: invalida as inscrições de push (cada pessoa reativa).
- Senha do banco: troque no painel e no `DB_PASSWORD`; reinicie.

## Incidentes: onde olhar
- **Configurações → Logs e auditoria** (`audit_log`): logins (`login.*`), publicações (`publicacao.*`), mídia (`midia.*`), equipe (`equipe.*`, `convite.*`), integrações (`integracao.*`), relatórios exportados (`relatorio.exportar`), LGPD (`lgpd.*`).
- **Configurações → Redes sociais** mostra o estado de cada conexão e o registro de integração (sem segredos).
- **Publicações → Falhas**: erro, tentativas e reprocessamento. Se a mensagem disser que o resultado é **incerto**, confira na rede social antes de reprocessar (evita postagem duplicada).
- Suspender uma pessoa: **Equipe → Suspender** (encerra as sessões na hora). Cada pessoa também pode encerrar seus dispositivos em Configurações → Segurança.
- Rede com acesso revogado/expirado: reconecte em Configurações → Redes sociais. Enquanto isso, use a publicação assistida.
- O agendador parou? Configurações → Configurações gerais mostra a última execução do cron.
