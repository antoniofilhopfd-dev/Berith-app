-- Planejamento e produção editorial. Tipos de notificação deixam de ser ENUM (novos tipos do ministério).
ALTER TABLE notificacoes MODIFY COLUMN tipo VARCHAR(30) NOT NULL;

CREATE TABLE IF NOT EXISTS editorias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  descricao VARCHAR(300) NULL,
  cor CHAR(7) NOT NULL DEFAULT '#587458',
  ativa TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_editoria_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Campanhas são agrupamentos editoriais (não anúncios pagos).
CREATE TABLE IF NOT EXISTS campanhas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  descricao TEXT NULL,
  objetivo VARCHAR(300) NULL,
  inicio DATE NULL,
  fim DATE NULL,
  cor CHAR(7) NOT NULL DEFAULT '#b07840',
  status ENUM('planejada','ativa','encerrada') NOT NULL DEFAULT 'planejada',
  responsavel_id BIGINT UNSIGNED NULL,
  criado_por BIGINT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_camp_status (status, inicio),
  CONSTRAINT fk_camp_resp FOREIGN KEY (responsavel_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_camp_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS publicacoes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(160) NOT NULL,
  descricao TEXT NULL,
  objetivo VARCHAR(300) NULL,
  formato ENUM('post','carrossel','stories','reels','video','short') NOT NULL DEFAULT 'post',
  status ENUM('rascunho','em_producao','em_revisao','ajustes_solicitados','aprovado','agendado','publicado','cancelado') NOT NULL DEFAULT 'rascunho',
  campanha_id BIGINT UNSIGNED NULL,
  editoria_id BIGINT UNSIGNED NULL,
  responsavel_id BIGINT UNSIGNED NULL,
  prioridade ENUM('baixa','media','alta') NOT NULL DEFAULT 'media',
  prazo DATETIME NULL,
  publicar_em DATETIME NULL,
  legenda MEDIUMTEXT NULL,
  hashtags VARCHAR(600) NULL,
  referencias TEXT NULL,
  observacoes TEXT NULL,
  versao INT UNSIGNED NOT NULL DEFAULT 1,
  rev INT UNSIGNED NOT NULL DEFAULT 0,
  duplicada_de BIGINT UNSIGNED NULL,
  criado_por BIGINT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pub_status (status, publicar_em),
  INDEX idx_pub_publicar (publicar_em),
  INDEX idx_pub_resp (responsavel_id, status),
  INDEX idx_pub_prazo (prazo),
  INDEX idx_pub_camp (campanha_id),
  CONSTRAINT fk_pub_camp FOREIGN KEY (campanha_id) REFERENCES campanhas(id) ON DELETE SET NULL,
  CONSTRAINT fk_pub_edit FOREIGN KEY (editoria_id) REFERENCES editorias(id) ON DELETE SET NULL,
  CONSTRAINT fk_pub_resp FOREIGN KEY (responsavel_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_pub_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uma linha por rede social; legenda/hashtags nulas herdam as da publicação.
CREATE TABLE IF NOT EXISTS publicacao_redes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  publicacao_id BIGINT UNSIGNED NOT NULL,
  rede ENUM('instagram','facebook','tiktok','youtube') NOT NULL,
  legenda MEDIUMTEXT NULL,
  hashtags VARCHAR(600) NULL,
  titulo_externo VARCHAR(150) NULL,
  envio ENUM('pendente','agendada','publicando','publicada','falhou','cancelada') NOT NULL DEFAULT 'pendente',
  agendada_para DATETIME NULL,
  publicada_em DATETIME NULL,
  assistida TINYINT(1) NOT NULL DEFAULT 0,
  post_externo_id VARCHAR(190) NULL,
  url_externa VARCHAR(500) NULL,
  tentativas INT UNSIGNED NOT NULL DEFAULT 0,
  proxima_tentativa DATETIME NULL,
  ultimo_erro VARCHAR(500) NULL,
  UNIQUE KEY uq_pubrede (publicacao_id, rede),
  INDEX idx_pubrede_fila (envio, agendada_para),
  CONSTRAINT fk_pubrede_pub FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS publicacao_midias (
  publicacao_id BIGINT UNSIGNED NOT NULL,
  midia_id BIGINT UNSIGNED NOT NULL,
  ordem INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (publicacao_id, midia_id),
  CONSTRAINT fk_pm_pub FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_midia FOREIGN KEY (midia_id) REFERENCES midias(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS publicacao_versoes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  publicacao_id BIGINT UNSIGNED NOT NULL,
  versao INT UNSIGNED NOT NULL,
  dados LONGTEXT NOT NULL,
  motivo VARCHAR(200) NULL,
  autor_id BIGINT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pv (publicacao_id, versao),
  CONSTRAINT fk_pv_pub FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_pv_autor FOREIGN KEY (autor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS publicacao_historico (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  publicacao_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  acao VARCHAR(40) NOT NULL,
  de_status VARCHAR(30) NULL,
  para_status VARCHAR(30) NULL,
  detalhes VARCHAR(600) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ph_pub (publicacao_id, id),
  CONSTRAINT fk_ph_pub FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_ph_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aprovacoes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  publicacao_id BIGINT UNSIGNED NOT NULL,
  versao INT UNSIGNED NOT NULL,
  decisao ENUM('aprovado','ajustes') NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  comentario TEXT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_apr_pub (publicacao_id, id),
  CONSTRAINT fk_apr_pub FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_apr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pub_comentarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  publicacao_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  texto TEXT NOT NULL,
  tipo ENUM('comentario','ajuste') NOT NULL DEFAULT 'comentario',
  resolvido_em DATETIME NULL,
  resolvido_por BIGINT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pc_pub (publicacao_id, id),
  CONSTRAINT fk_pc_pub FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_pc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS modelos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  formato ENUM('post','carrossel','stories','reels','video','short') NOT NULL DEFAULT 'post',
  redes VARCHAR(80) NOT NULL DEFAULT 'instagram',
  objetivo VARCHAR(300) NULL,
  legenda MEDIUMTEXT NULL,
  hashtags VARCHAR(600) NULL,
  criado_por BIGINT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_modelo_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ideias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(160) NOT NULL,
  descricao TEXT NULL,
  editoria_id BIGINT UNSIGNED NULL,
  campanha_id BIGINT UNSIGNED NULL,
  redes VARCHAR(80) NULL,
  prioridade ENUM('baixa','media','alta') NOT NULL DEFAULT 'media',
  referencias TEXT NULL,
  status ENUM('nova','em_analise','aprovada','descartada','convertida') NOT NULL DEFAULT 'nova',
  publicacao_id BIGINT UNSIGNED NULL,
  criado_por BIGINT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ideia_status (status, prioridade),
  CONSTRAINT fk_ideia_edit FOREIGN KEY (editoria_id) REFERENCES editorias(id) ON DELETE SET NULL,
  CONSTRAINT fk_ideia_camp FOREIGN KEY (campanha_id) REFERENCES campanhas(id) ON DELETE SET NULL,
  CONSTRAINT fk_ideia_pub FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE SET NULL,
  CONSTRAINT fk_ideia_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Datas especiais próprias do ministério (as fixas e móveis do calendário são calculadas no código).
CREATE TABLE IF NOT EXISTS datas_especiais (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  dia DATE NOT NULL,
  anual TINYINT(1) NOT NULL DEFAULT 1,
  criado_por BIGINT UNSIGNED NULL,
  INDEX idx_data_esp (dia),
  CONSTRAINT fk_dataesp_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO editorias (nome, descricao, cor) VALUES
  ('Institucional', 'Apresentação e vida da comunidade', '#587458'),
  ('Evangelização', 'Conteúdos de anúncio e reflexão', '#b07840'),
  ('Eventos', 'Divulgação de encontros e celebrações', '#604038'),
  ('Testemunhos', 'Histórias e depoimentos', '#3f6f8f');
