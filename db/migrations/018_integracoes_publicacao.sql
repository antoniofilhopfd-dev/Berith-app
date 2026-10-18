-- Integrações com redes sociais (tokens sempre cifrados pela aplicação com TOKEN_ENC_KEY).
CREATE TABLE IF NOT EXISTS redes_contas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rede ENUM('instagram','facebook','tiktok','youtube') NOT NULL,
  nome_exibicao VARCHAR(150) NULL,
  conta_externa_id VARCHAR(190) NULL,
  status ENUM('conectada','expirada','erro','desconectada') NOT NULL DEFAULT 'conectada',
  escopos VARCHAR(600) NULL,
  token_enc TEXT NOT NULL,
  refresh_enc TEXT NULL,
  expira_em DATETIME NULL,
  meta TEXT NULL,
  ultimo_erro VARCHAR(300) NULL,
  conectada_por BIGINT UNSIGNED NULL,
  conectada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conta_rede (rede),
  CONSTRAINT fk_conta_user FOREIGN KEY (conectada_por) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oauth_estados (
  state_hash CHAR(64) NOT NULL PRIMARY KEY,
  rede ENUM('instagram','facebook','tiktok','youtube') NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  verificador_enc TEXT NULL,
  expira_em DATETIME NOT NULL,
  CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS publicacao_tentativas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  publicacao_rede_id BIGINT UNSIGNED NOT NULL,
  iniciada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalizada_em DATETIME NULL,
  resultado ENUM('sucesso','falha','em_andamento') NOT NULL DEFAULT 'em_andamento',
  http_status INT NULL,
  erro VARCHAR(500) NULL,
  INDEX idx_tent_pr (publicacao_rede_id, id),
  CONSTRAINT fk_tent_pr FOREIGN KEY (publicacao_rede_id) REFERENCES publicacao_redes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integracao_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rede VARCHAR(20) NULL,
  nivel ENUM('info','aviso','erro') NOT NULL DEFAULT 'info',
  evento VARCHAR(60) NOT NULL,
  detalhes VARCHAR(600) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ilog (criado_em),
  INDEX idx_ilog_rede (rede, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Métricas oficiais coletadas das plataformas. NULL = a plataforma não informa essa métrica.
CREATE TABLE IF NOT EXISTS metricas_publicacao (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  publicacao_rede_id BIGINT UNSIGNED NOT NULL,
  coletado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  alcance INT UNSIGNED NULL,
  impressoes INT UNSIGNED NULL,
  curtidas INT UNSIGNED NULL,
  comentarios INT UNSIGNED NULL,
  compartilhamentos INT UNSIGNED NULL,
  salvamentos INT UNSIGNED NULL,
  visualizacoes INT UNSIGNED NULL,
  INDEX idx_mp (publicacao_rede_id, coletado_em),
  CONSTRAINT fk_mp_pr FOREIGN KEY (publicacao_rede_id) REFERENCES publicacao_redes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS metricas_conta (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rede ENUM('instagram','facebook','tiktok','youtube') NOT NULL,
  dia DATE NOT NULL,
  seguidores INT UNSIGNED NULL,
  alcance INT UNSIGNED NULL,
  visualizacoes INT UNSIGNED NULL,
  UNIQUE KEY uq_mc (rede, dia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
