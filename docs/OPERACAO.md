# Operação e manutenção

## Comandos
| Comando | Para quê |
|---|---|
| `npm run verificar` | Checa ambiente de produção (segredos, banco, migrações, arquivos). |
| `npm run admin:criar -- email "Nome"` | Cria administrador (precisa de terminal; senha via `ADMIN_SENHA`). |
| `npm run admin:sql -- email "Nome"` | Gera SQL do administrador para executar no phpMyAdmin. |
| `npm run manutencao` | Retenção/descarte diário (sessões, tentativas de login, tokens e notificações vencidos). |
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
**O que protege:** banco (todas as tabelas, inclusive financeiro e auditoria) e arquivos privados (`STORAGE_DIR`).
- **Frequência sugerida:** diário (noite). **Retenção:** 30 dias (`RETENCAO_DIAS`); mantenha ao menos 1 backup mensal por 12 meses fora do servidor.
- **Execução:** `scripts/backup.sh` (usa `mysqldump --single-transaction`; a senha vai por `MYSQL_PWD`). Gera `nb-<data>.sql.gz`, `.arquivos.tar.gz`, `.manifesto.txt` (contagens e saldo) e `.sha256`.
- **Armazenamento protegido:** `BACKUP_DIR` com permissão 700, **fora** da pasta pública, e cópia periódica para outro local (outro provedor/computador). Defina `BACKUP_GPG_RECIPIENT` para criptografar com GPG antes de copiar.
- **Restauração (teste):** `scripts/restaurar.sh nb-<data>` → restaura em um banco de **teste** (`<DB_NAME>_restauracao_teste`), confere checksums, contagens e saldo contra o manifesto e retorna erro se algo divergir. **Não toca na produção.**
- **Restauração em produção:** `scripts/restaurar.sh nb-<data> --producao-confirmo` (substitui os dados atuais!). Pare o app antes e faça um backup do estado atual.
- **Arquivos enviados:** o `.arquivos.tar.gz` é extraído para `STORAGE_DIR` (em teste, para uma pasta temporária).
- **Backup só é confiável depois de testar a restauração.** Faça esse teste ao configurar e **a cada trimestre**.

> Estado da validação: o procedimento foi testado em MariaDB 10.11 **no ambiente de desenvolvimento** (backup → dano proposital → restauração em banco de teste → contagens e saldo conferidos; adulteração do arquivo detectada e restauração abortada).
> **Falta repetir o teste na Hostinger** (disponibilidade de `mysqldump`/terminal e agendamento).

## Retenção de dados (LGPD)
| Dado | Retenção | Como |
|---|---|---|
| Sessões expiradas/revogadas | 30 dias | `npm run manutencao` (agende diariamente) |
| Tentativas de login | 30 dias | idem |
| Tokens de senha usados/expirados e convites vencidos | 30 dias | idem |
| Notificações lidas | 180 dias | idem |
| Entregas de push | 90 dias | idem |
| **Lançamentos financeiros e auditoria** | **mantidos** (obrigação legal/fiscal; **confirmar prazo com a contabilidade**, em geral 5 anos) | não são descartados automaticamente |
Pedidos de titulares: `npm run lgpd -- exportar|anonimizar`. A anonimização remove nome, e-mail, perfil, vínculos ativos, sessões, dispositivos e preferências; preserva os registros financeiros e a auditoria **sem identificar** a pessoa.

## Segredos
- Troca de `SESSION_SECRET`: encerra todas as sessões (todos precisarão entrar de novo). Troque se houver suspeita de vazamento.
- Troca de `CRON_SECRET`: atualize também o agendador. Troca de chaves VAPID: invalida as inscrições de push (cada pessoa reativa).
- Senha do banco: troque no painel e no `DB_PASSWORD`; reinicie.

## Incidentes: onde olhar
- `audit_log`: logins (`login.sucesso/falha/bloqueado`), financeiro (`financeiro.*`), arquivos (`arquivo.*`), permissões (`papel.*`), LGPD (`lgpd.*`).
- Suspender uma pessoa: tela do membro → "Suspender acesso" (encerra as sessões na hora). Reabrir período financeiro exige administração e fica registrado.
- Financeiro: aprovação por **duas pessoas** (configuração `financeiro_aprovacao_dupla` em `settings`; só desligue se houver um único responsável).

## Importação automática de liturgia

- Configuração em `/liturgia` (quem pode editar liturgia): nome da fonte, endereço com `{data}`/`{dd}`/`{mm}`/`{aaaa}`, mapeamento JSON de caminhos (tipos: primeira_leitura, salmo, segunda_leitura, evangelho, santo, invitatorio, oficio_leituras, laudes, hora_media, vesperas, completas).
- Use “Testar” (não grava) antes de ativar. “Importar agora” força uma execução; a automática roda na chamada do cron (`POST /api/push/enviar`), no máximo a cada 6 h.
- O resultado fica em “última execução”/status e na auditoria (`liturgia.importar`). Falha da fonte não afeta o restante do cron.
