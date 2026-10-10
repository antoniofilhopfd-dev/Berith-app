CREATE TABLE IF NOT EXISTS notificacoes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('evento','comunicado','escala','tarefa','reuniao','conteudo','financeiro','sistema') NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  corpo VARCHAR(300) NULL,
  url VARCHAR(300) NULL,
  dedupe_key VARCHAR(120) NOT NULL,
  agendada_para DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lida_em DATETIME NULL,
  push_status ENUM('pendente','enviada','ignorada','expirada') NOT NULL DEFAULT 'pendente',
  push_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notif_dedupe (user_id, dedupe_key),
  INDEX idx_notif_user (user_id, lida_em, id),
  INDEX idx_notif_push (push_status, agendada_para),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notificacao_config (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  push_ativo TINYINT(1) NOT NULL DEFAULT 1,
  silencio_inicio TIME NULL,
  silencio_fim TIME NULL,
  CONSTRAINT fk_nconf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preferência por tipo: ausência de linha = ativo.
CREATE TABLE IF NOT EXISTS notificacao_tipos (
  user_id BIGINT UNSIGNED NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  ativo TINYINT(1) NOT NULL,
  PRIMARY KEY (user_id, tipo),
  CONSTRAINT fk_ntipo_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  endpoint VARCHAR(600) NOT NULL,
  p256dh VARCHAR(200) NOT NULL,
  auth VARCHAR(100) NOT NULL,
  user_agent VARCHAR(255) NULL,
  falhas INT UNSIGNED NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  INDEX idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_entregas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  notificacao_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NULL,
  status ENUM('enviada','falhou','removida') NOT NULL,
  http_status INT NULL,
  erro VARCHAR(255) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_entrega (notificacao_id, subscription_id),
  INDEX idx_entrega_notif (notificacao_id),
  CONSTRAINT fk_ent_notif FOREIGN KEY (notificacao_id) REFERENCES notificacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_ent_sub FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
