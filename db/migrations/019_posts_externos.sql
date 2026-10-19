-- Posts da conta (inclusive os publicados fora do app), importados pela API oficial da rede.
-- Guarda só o estado mais recente de cada post; o histórico de seguidores/alcance da conta fica em metricas_conta.
CREATE TABLE IF NOT EXISTS posts_externos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rede ENUM('instagram','facebook','tiktok','youtube') NOT NULL,
  id_externo VARCHAR(80) NOT NULL,
  tipo VARCHAR(30) NULL,
  legenda TEXT NULL,
  url VARCHAR(500) NULL,
  publicado_em DATETIME NOT NULL,
  alcance INT UNSIGNED NULL,
  curtidas INT UNSIGNED NULL,
  comentarios INT UNSIGNED NULL,
  compartilhamentos INT UNSIGNED NULL,
  salvamentos INT UNSIGNED NULL,
  visualizacoes INT UNSIGNED NULL,
  coletado_em DATETIME NOT NULL,
  UNIQUE KEY uq_pe (rede, id_externo),
  INDEX idx_pe_data (rede, publicado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
