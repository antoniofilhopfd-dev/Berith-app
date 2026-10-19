-- Métricas mensais da conta do Instagram (a Meta não guarda histórico longo: o app passa a guardar mês a mês)
-- e miniatura dos posts importados.
CREATE TABLE IF NOT EXISTS instagram_mensal (
  periodo CHAR(7) NOT NULL PRIMARY KEY,
  alcance INT UNSIGNED NULL,
  visualizacoes INT UNSIGNED NULL,
  visitas_perfil INT UNSIGNED NULL,
  interacoes INT UNSIGNED NULL,
  curtidas INT UNSIGNED NULL,
  comentarios INT UNSIGNED NULL,
  compartilhamentos INT UNSIGNED NULL,
  salvamentos INT UNSIGNED NULL,
  atualizado_em DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE posts_externos ADD COLUMN miniatura VARCHAR(1000) NULL;
