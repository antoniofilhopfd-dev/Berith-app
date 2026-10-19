-- Aparelhos que já entraram com sucesso (cookie aleatório; só o hash fica aqui).
-- Em caso de tentativas em massa contra os códigos, só aparelhos conhecidos continuam entrando.
CREATE TABLE IF NOT EXISTS dispositivos_conhecidos (
  hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL,
  visto_em DATETIME NOT NULL,
  INDEX idx_dev_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
