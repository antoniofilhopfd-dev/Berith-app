-- Biblioteca de mídia do Ministério de Comunicação (arquivos privados em STORAGE_DIR).
CREATE TABLE IF NOT EXISTS midia_pastas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  criado_por BIGINT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pastas_parent (parent_id),
  CONSTRAINT fk_pasta_parent FOREIGN KEY (parent_id) REFERENCES midia_pastas(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pasta_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS midias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  arquivo CHAR(32) NOT NULL,
  nome_original VARCHAR(200) NOT NULL,
  mime VARCHAR(80) NOT NULL,
  tipo ENUM('imagem','video') NOT NULL,
  tamanho BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  largura INT UNSIGNED NULL,
  altura INT UNSIGNED NULL,
  pasta_id BIGINT UNSIGNED NULL,
  descricao VARCHAR(300) NULL,
  texto_alternativo VARCHAR(300) NULL,
  criado_por BIGINT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removido_em DATETIME NULL,
  UNIQUE KEY uq_midias_arquivo (arquivo),
  UNIQUE KEY uq_midias_sha (sha256),
  INDEX idx_midias_pasta (pasta_id, removido_em),
  INDEX idx_midias_tipo (tipo, criado_em),
  CONSTRAINT fk_midia_pasta FOREIGN KEY (pasta_id) REFERENCES midia_pastas(id) ON DELETE SET NULL,
  CONSTRAINT fk_midia_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS midia_etiquetas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_etiqueta_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS midia_etiqueta_rel (
  midia_id BIGINT UNSIGNED NOT NULL,
  etiqueta_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (midia_id, etiqueta_id),
  CONSTRAINT fk_mer_midia FOREIGN KEY (midia_id) REFERENCES midias(id) ON DELETE CASCADE,
  CONSTRAINT fk_mer_etq FOREIGN KEY (etiqueta_id) REFERENCES midia_etiquetas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
