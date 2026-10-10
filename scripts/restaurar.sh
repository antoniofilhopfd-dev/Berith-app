#!/usr/bin/env bash
# Restaura um backup da Nova Berith. POR PADRÃO restaura em um banco de TESTE (<DB_NAME>_restauracao_teste), nunca em produção,
# e confere as contagens do manifesto. Uso:
#   scripts/restaurar.sh nb-AAAAMMDDTHHMMSSZ            → restaura no banco de teste e confere
#   scripts/restaurar.sh nb-... --producao-confirmo     → restaura em DB_NAME (SUBSTITUI os dados atuais!)
# Variáveis: DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD; BACKUP_DIR; STORAGE_DIR (para arquivos).
set -euo pipefail
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASSWORD:?}"
DB_PORT="${DB_PORT:-3306}"; BACKUP_DIR="${BACKUP_DIR:-$HOME/backups-nova-berith}"
BASE="${1:?Informe o nome base do backup (ex.: nb-20260101T030000Z)}"; MODO="${2:-teste}"
export MYSQL_PWD="$DB_PASSWORD"
cd "$BACKUP_DIR"
if sha256sum -c "$BASE.sha256" --quiet; then echo "Checksums conferem."; else echo "ERRO: checksum não confere — backup corrompido ou adulterado. Nada foi restaurado." >&2; exit 4; fi
if [ "$MODO" = "--producao-confirmo" ]; then DESTINO="$DB_NAME"; echo "ATENÇÃO: restaurando em PRODUÇÃO ($DESTINO)."; else DESTINO="${DB_NAME}_restauracao_teste"; fi
M=(mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER")
"${M[@]}" -e "DROP DATABASE IF EXISTS \`$DESTINO\`; CREATE DATABASE \`$DESTINO\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gunzip -c "$BASE.sql.gz" | "${M[@]}" --default-character-set=utf8mb4 "$DESTINO"

CONF="$(mktemp)"; trap 'rm -f "$CONF"' EXIT
"${M[@]}" --batch --skip-column-names "$DESTINO" -e "
  SELECT 'users', COUNT(*) FROM users UNION ALL SELECT 'org_units', COUNT(*) FROM org_units UNION ALL SELECT 'events', COUNT(*) FROM events
  UNION ALL SELECT 'fin_lancamentos', COUNT(*) FROM fin_lancamentos UNION ALL SELECT 'files', COUNT(*) FROM files
  UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log UNION ALL SELECT 'schema_migrations', COUNT(*) FROM schema_migrations
  UNION ALL SELECT 'saldo_centavos', COALESCE(SUM(CASE WHEN status='aprovado' THEN IF(tipo='entrada',valor_centavos,-valor_centavos) END),0) FROM fin_lancamentos;" > "$CONF"
if diff -u "$BASE.manifesto.txt" "$CONF"; then echo "Contagens e saldo conferem com o manifesto. Restauração do banco: OK."; else echo "DIVERGÊNCIA entre manifesto e restauração!" >&2; exit 2; fi
FALHAS="$("${M[@]}" --batch --skip-column-names "$DESTINO" -e "SELECT COUNT(*) FROM schema_migrations WHERE resultado <> 'ok'")"
[ "$FALHAS" = "0" ] || { echo "Há migrações com falha no backup." >&2; exit 3; }

if [ -f "$BASE.arquivos.tar.gz" ]; then
  ALVO="${STORAGE_DIR:-$(pwd)/restauracao-arquivos}"; [ "$MODO" = "--producao-confirmo" ] || ALVO="$(mktemp -d)"
  mkdir -p "$ALVO"; tar -xzf "$BASE.arquivos.tar.gz" -C "$ALVO"
  echo "Arquivos restaurados em: $ALVO ($(find "$ALVO" -type f | wc -l) arquivos)."
fi
[ "$MODO" = "--producao-confirmo" ] || echo "Banco de teste: $DESTINO (apague quando terminar: DROP DATABASE \`$DESTINO\`)."
