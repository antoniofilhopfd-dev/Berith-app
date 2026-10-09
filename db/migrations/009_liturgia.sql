-- Conteúdo litúrgico cadastrado por pessoa autorizada, SEMPRE com fonte registrada (direitos autorais).
CREATE TABLE IF NOT EXISTS liturgia_itens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  data DATE NOT NULL,
  tipo ENUM('primeira_leitura','salmo','segunda_leitura','evangelho','santo','invitatorio','oficio_leituras','laudes','hora_media','vesperas','completas') NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  texto MEDIUMTEXT NULL,
  fonte_nome VARCHAR(160) NOT NULL,
  fonte_url VARCHAR(500) NULL,
  direitos VARCHAR(300) NULL,
  criado_por BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_por BIGINT UNSIGNED NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_liturgia_dia_tipo (data, tipo),
  CONSTRAINT fk_lit_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Atalhos para fontes oficiais, mantidos pela própria comunidade (nada é presumido).
CREATE TABLE IF NOT EXISTS liturgia_fontes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(120) NOT NULL,
  url VARCHAR(500) NOT NULL,
  criado_por BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_litf_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comunicação também gerencia conteúdos (o administrador geral já tem todas as permissões).
INSERT IGNORE INTO role_permissions (role_id, recurso, acao)
SELECT r.id, 'conteudos', ac.v FROM roles r
JOIN (SELECT 'ver' v UNION ALL SELECT 'criar' UNION ALL SELECT 'editar' UNION ALL SELECT 'excluir') ac
WHERE r.codigo = 'resp_comunicacao';
