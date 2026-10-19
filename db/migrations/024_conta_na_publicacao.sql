-- Cada envio para o Instagram passa a ter a conta (ig_id) pela qual será publicado.
-- Envios já existentes ficam na conta que estava conectada como principal.
ALTER TABLE publicacao_redes ADD COLUMN conta_id VARCHAR(40) NULL, ADD INDEX idx_pubrede_conta (conta_id);
UPDATE publicacao_redes SET conta_id = (SELECT conta_externa_id FROM redes_contas WHERE rede = 'instagram' AND conta_externa_id IS NOT NULL LIMIT 1)
 WHERE rede = 'instagram' AND conta_id IS NULL AND EXISTS (SELECT 1 FROM redes_contas WHERE rede = 'instagram' AND conta_externa_id IS NOT NULL);
