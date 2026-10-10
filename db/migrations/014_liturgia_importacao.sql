-- Importação automática de liturgia a partir de uma fonte configurada pela comunidade (com direitos confirmados).
CREATE TABLE IF NOT EXISTS liturgia_provedor (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  ativo TINYINT(1) NOT NULL DEFAULT 0,
  fonte_nome VARCHAR(160) NOT NULL,
  fonte_url_publica VARCHAR(500) NULL,
  url_template VARCHAR(600) NOT NULL,
  mapeamento TEXT NOT NULL,
  copiar_texto TINYINT(1) NOT NULL DEFAULT 0,
  direitos_confirmados TINYINT(1) NOT NULL DEFAULT 0,
  dias_a_frente TINYINT UNSIGNED NOT NULL DEFAULT 2,
  ultima_execucao DATETIME NULL,
  ultimo_status VARCHAR(300) NULL,
  configurado_por BIGINT UNSIGNED NOT NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_litprov_user FOREIGN KEY (configurado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Marca quais itens vieram da importação (só esses podem ser atualizados por ela; cadastro manual é preservado).
CREATE TABLE IF NOT EXISTS liturgia_importados (
  item_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  importado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_litimp_item FOREIGN KEY (item_id) REFERENCES liturgia_itens(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
