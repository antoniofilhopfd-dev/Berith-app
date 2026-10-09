CREATE TABLE IF NOT EXISTS org_units (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('comunidade','caminho','ministerio','grupo','equipe','servico') NOT NULL,
  nome VARCHAR(150) NOT NULL,
  descricao TEXT NULL,
  parent_id BIGINT UNSIGNED NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_units_parent (parent_id),
  INDEX idx_units_tipo (tipo, ativo),
  CONSTRAINT fk_units_parent FOREIGN KEY (parent_id) REFERENCES org_units(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS memberships (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  unit_id BIGINT UNSIGNED NOT NULL,
  funcao VARCHAR(80) NULL,
  inicio DATE NOT NULL,
  fim DATE NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_memb_user (user_id, fim),
  INDEX idx_memb_unit (unit_id, fim),
  CONSTRAINT fk_memb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_memb_unit FOREIGN KEY (unit_id) REFERENCES org_units(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
