#!/usr/bin/env bash
# Backup do banco (MySQL) e dos arquivos privados da Nova Berith.
# Variáveis: DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD (obrigatórias); STORAGE_DIR; BACKUP_DIR (padrão ~/backups-nova-berith);
#            RETENCAO_DIAS (padrão 30); BACKUP_GPG_RECIPIENT (opcional: criptografa o resultado com a chave pública informada).
# A senha vai por variável MYSQL_PWD (não aparece na lista de processos). Nunca apaga nada fora de BACKUP_DIR.
set -euo pipefail
umask 077
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASSWORD:?}"
DB_PORT="${DB_PORT:-3306}"; RETENCAO_DIAS="${RETENCAO_DIAS:-30}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups-nova-berith}"
STORAGE_DIR="${STORAGE_DIR:-$(pwd)/storage}"
export MYSQL_PWD="$DB_PASSWORD"
mkdir -p "$BACKUP_DIR"; cd "$BACKUP_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"; BASE="nb-$TS"

mysqldump --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --single-transaction --quick --routines --triggers \
  --default-character-set=utf8mb4 --no-tablespaces "$DB_NAME" | gzip -9 > "$BASE.sql.gz"
gzip -t "$BASE.sql.gz"   # integridade do arquivo compactado

# Manifesto: contagens exatas para conferir a restauração.
mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --batch --skip-column-names "$DB_NAME" -e "
  SELECT 'users', COUNT(*) FROM users UNION ALL SELECT 'org_units', COUNT(*) FROM org_units UNION ALL SELECT 'events', COUNT(*) FROM events
  UNION ALL SELECT 'fin_lancamentos', COUNT(*) FROM fin_lancamentos UNION ALL SELECT 'files', COUNT(*) FROM files
  UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log UNION ALL SELECT 'schema_migrations', COUNT(*) FROM schema_migrations
  UNION ALL SELECT 'saldo_centavos', COALESCE(SUM(CASE WHEN status='aprovado' THEN IF(tipo='entrada',valor_centavos,-valor_centavos) END),0) FROM fin_lancamentos;" > "$BASE.manifesto.txt"

if [ -d "$STORAGE_DIR" ] && [ -n "$(ls -A "$STORAGE_DIR" 2>/dev/null)" ]; then
  tar -C "$STORAGE_DIR" -czf "$BASE.arquivos.tar.gz" . ; tar -tzf "$BASE.arquivos.tar.gz" > /dev/null
fi
sha256sum "$BASE".* > "$BASE.sha256"

if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
  for f in "$BASE.sql.gz" "$BASE.arquivos.tar.gz"; do [ -f "$f" ] && gpg --batch --yes --trust-model always -r "$BACKUP_GPG_RECIPIENT" -o "$f.gpg" -e "$f" && rm -f "$f"; done
  sha256sum "$BASE".*gpg > "$BASE.sha256"
fi

# Retenção: apaga somente backups nb-* mais antigos que RETENCAO_DIAS, dentro de BACKUP_DIR.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'nb-*' -mtime +"$RETENCAO_DIAS" -delete
echo "Backup concluído: $BACKUP_DIR/$BASE.*"
