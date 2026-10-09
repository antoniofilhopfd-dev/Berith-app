CREATE TABLE IF NOT EXISTS settings (
  chave VARCHAR(100) NOT NULL PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO settings (chave, valor) VALUES
  ('fuso_horario', 'America/Sao_Paulo'),
  ('nome_comunidade', 'Comunidade Católica Nova Berith');

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  acao VARCHAR(100) NOT NULL,
  entidade VARCHAR(60) NULL,
  entidade_id VARCHAR(40) NULL,
  detalhes TEXT NULL,
  ip VARCHAR(45) NULL,
  criado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_user (user_id, criado_em),
  INDEX idx_audit_entidade (entidade, entidade_id),
  INDEX idx_audit_acao (acao, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
