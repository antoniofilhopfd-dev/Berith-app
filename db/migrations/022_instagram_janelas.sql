-- Totais da conta em janelas móveis (7/30/90 dias) e a janela imediatamente anterior, lidos da Meta.
-- Alimenta os cartões "vs. período anterior" do painel de desempenho. Uma linha por conta/janela/período.
CREATE TABLE IF NOT EXISTS instagram_janelas (
  conta_id VARCHAR(40) NOT NULL,
  janela VARCHAR(8) NOT NULL,
  quando ENUM('atual','anterior') NOT NULL,
  de DATE NOT NULL,
  ate DATE NOT NULL,
  alcance INT UNSIGNED NULL,
  visualizacoes INT UNSIGNED NULL,
  visitas_perfil INT UNSIGNED NULL,
  interacoes INT UNSIGNED NULL,
  curtidas INT UNSIGNED NULL,
  comentarios INT UNSIGNED NULL,
  compartilhamentos INT UNSIGNED NULL,
  salvamentos INT UNSIGNED NULL,
  atualizado_em DATETIME NOT NULL,
  PRIMARY KEY (conta_id, janela, quando)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
