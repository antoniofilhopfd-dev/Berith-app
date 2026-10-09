-- Orações, formação, catequese e doutrina. Fonte obrigatória (direitos autorais); escopo por estrutura.
CREATE TABLE IF NOT EXISTS conteudos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT UNSIGNED NULL,
  categoria ENUM('oracao','formacao','catequese','doutrina','leitura_biblica','outro') NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  resumo VARCHAR(500) NULL,
  corpo MEDIUMTEXT NULL,
  fonte_nome VARCHAR(160) NOT NULL,
  fonte_url VARCHAR(500) NULL,
  direitos VARCHAR(300) NULL,
  publicado TINYINT(1) NOT NULL DEFAULT 1,
  criado_por BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cont_unit (unit_id, categoria),
  INDEX idx_cont_cat (categoria, publicado),
  CONSTRAINT fk_cont_unit FOREIGN KEY (unit_id) REFERENCES org_units(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cont_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conteudo_favoritos (
  user_id BIGINT UNSIGNED NOT NULL,
  conteudo_id BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, conteudo_id),
  CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_cont FOREIGN KEY (conteudo_id) REFERENCES conteudos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trilhas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT UNSIGNED NULL,
  titulo VARCHAR(160) NOT NULL,
  descricao VARCHAR(500) NULL,
  criado_por BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trilhas_unit (unit_id),
  CONSTRAINT fk_trilhas_unit FOREIGN KEY (unit_id) REFERENCES org_units(id) ON DELETE RESTRICT,
  CONSTRAINT fk_trilhas_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trilha_itens (
  trilha_id BIGINT UNSIGNED NOT NULL,
  conteudo_id BIGINT UNSIGNED NOT NULL,
  ordem INT UNSIGNED NOT NULL,
  PRIMARY KEY (trilha_id, conteudo_id),
  INDEX idx_ti_ordem (trilha_id, ordem),
  CONSTRAINT fk_ti_trilha FOREIGN KEY (trilha_id) REFERENCES trilhas(id) ON DELETE CASCADE,
  CONSTRAINT fk_ti_cont FOREIGN KEY (conteudo_id) REFERENCES conteudos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Progresso pessoal: visível apenas à própria pessoa (não é usado para classificar ninguém).
CREATE TABLE IF NOT EXISTS conteudo_concluidos (
  user_id BIGINT UNSIGNED NOT NULL,
  conteudo_id BIGINT UNSIGNED NOT NULL,
  concluido_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, conteudo_id),
  CONSTRAINT fk_cc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_cont FOREIGN KEY (conteudo_id) REFERENCES conteudos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
