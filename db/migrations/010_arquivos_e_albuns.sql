-- Metadados de arquivos privados. Os binários ficam fora de public/, em STORAGE_DIR.
CREATE TABLE IF NOT EXISTS albums (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT UNSIGNED NULL,
  event_id BIGINT UNSIGNED NULL,
  titulo VARCHAR(160) NOT NULL,
  descricao VARCHAR(500) NULL,
  permitir_download TINYINT(1) NOT NULL DEFAULT 1,
  criado_por BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_albums_unit (unit_id, criado_em),
  CONSTRAINT fk_albums_unit FOREIGN KEY (unit_id) REFERENCES org_units(id) ON DELETE RESTRICT,
  CONSTRAINT fk_albums_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  CONSTRAINT fk_albums_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  arquivo CHAR(32) NOT NULL,
  nome_original VARCHAR(200) NOT NULL,
  mime VARCHAR(80) NOT NULL,
  tamanho BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  ctx_tipo ENUM('comunicado','tarefa','conteudo','album','documento') NOT NULL,
  ctx_id BIGINT UNSIGNED NOT NULL,
  descricao VARCHAR(300) NULL,
  autorizacao_imagem TINYINT(1) NOT NULL DEFAULT 0,
  criado_por BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_files_arquivo (arquivo),
  UNIQUE KEY uq_files_dup (ctx_tipo, ctx_id, sha256),
  INDEX idx_files_ctx (ctx_tipo, ctx_id, criado_em),
  CONSTRAINT fk_files_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
