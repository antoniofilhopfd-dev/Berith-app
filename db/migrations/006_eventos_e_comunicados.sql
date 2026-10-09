-- unit_id NULL = aberto a toda a comunidade (gestão somente por papel global).
CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT UNSIGNED NULL,
  titulo VARCHAR(160) NOT NULL,
  descricao TEXT NULL,
  local VARCHAR(160) NULL,
  inicio DATETIME NOT NULL,
  fim DATETIME NULL,
  responsavel_id BIGINT UNSIGNED NULL,
  limite_participantes INT UNSIGNED NULL,
  lembrete_min INT UNSIGNED NULL,
  recorrencia ENUM('nenhuma','semanal','mensal') NOT NULL DEFAULT 'nenhuma',
  recorrencia_ate DATE NULL,
  cancelado_em DATETIME NULL,
  cancelado_motivo VARCHAR(255) NULL,
  criado_por BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_events_unit (unit_id, inicio),
  INDEX idx_events_inicio (inicio),
  CONSTRAINT fk_events_unit FOREIGN KEY (unit_id) REFERENCES org_units(id) ON DELETE RESTRICT,
  CONSTRAINT fk_events_resp FOREIGN KEY (responsavel_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_events_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_exceptions (
  event_id BIGINT UNSIGNED NOT NULL,
  occurrence_date DATE NOT NULL,
  motivo VARCHAR(255) NULL,
  PRIMARY KEY (event_id, occurrence_date),
  CONSTRAINT fk_exc_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id BIGINT UNSIGNED NOT NULL,
  occurrence_date DATE NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('confirmado','talvez','nao_vai') NOT NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, occurrence_date, user_id),
  INDEX idx_rsvps_user (user_id),
  CONSTRAINT fk_rsvp_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_rsvp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  acao VARCHAR(40) NOT NULL,
  detalhes TEXT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_eh_event (event_id, criado_em),
  CONSTRAINT fk_eh_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT UNSIGNED NULL,
  titulo VARCHAR(160) NOT NULL,
  corpo TEXT NOT NULL,
  prioridade ENUM('normal','importante','urgente') NOT NULL DEFAULT 'normal',
  publicar_em DATETIME NOT NULL,
  expira_em DATETIME NULL,
  criado_por BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ann_unit (unit_id, publicar_em),
  INDEX idx_ann_publicar (publicar_em),
  CONSTRAINT fk_ann_unit FOREIGN KEY (unit_id) REFERENCES org_units(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ann_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  lido_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (announcement_id, user_id),
  CONSTRAINT fk_ar_ann FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
  CONSTRAINT fk_ar_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
