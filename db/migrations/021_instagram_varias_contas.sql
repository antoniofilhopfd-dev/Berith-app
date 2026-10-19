-- Várias contas do Instagram: a conta principal (publicação) continua em redes_contas;
-- as demais contas das Páginas autorizadas ficam aqui, só para leitura de métricas.
CREATE TABLE IF NOT EXISTS instagram_contas (
  ig_id VARCHAR(40) NOT NULL PRIMARY KEY,
  usuario VARCHAR(120) NOT NULL,
  page_id VARCHAR(40) NULL,
  token_enc TEXT NOT NULL,
  status ENUM('conectada','expirada','erro') NOT NULL DEFAULT 'conectada',
  ultimo_erro VARCHAR(300) NULL,
  conectada_em DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dados passam a ser separados por conta (ig_id). Linhas já gravadas são da conta principal atual.
ALTER TABLE posts_externos ADD COLUMN conta_id VARCHAR(40) NOT NULL DEFAULT '', ADD INDEX idx_pe_conta (conta_id, publicado_em);
UPDATE posts_externos SET conta_id = COALESCE((SELECT conta_externa_id FROM redes_contas WHERE rede = 'instagram' LIMIT 1), '') WHERE conta_id = '';

ALTER TABLE instagram_mensal ADD COLUMN conta_id VARCHAR(40) NOT NULL DEFAULT '';
UPDATE instagram_mensal SET conta_id = COALESCE((SELECT conta_externa_id FROM redes_contas WHERE rede = 'instagram' LIMIT 1), '') WHERE conta_id = '';
ALTER TABLE instagram_mensal DROP PRIMARY KEY, ADD PRIMARY KEY (conta_id, periodo);

ALTER TABLE metricas_conta ADD COLUMN conta_id VARCHAR(40) NOT NULL DEFAULT '', DROP INDEX uq_mc;
UPDATE metricas_conta SET conta_id = COALESCE((SELECT conta_externa_id FROM redes_contas r WHERE r.rede = metricas_conta.rede LIMIT 1), '') WHERE conta_id = '';
ALTER TABLE metricas_conta ADD UNIQUE KEY uq_mc2 (rede, conta_id, dia);
