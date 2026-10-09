CREATE TABLE IF NOT EXISTS shifts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT UNSIGNED NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  inicio DATETIME NOT NULL,
  fim DATETIME NOT NULL,
  observacao VARCHAR(500) NULL,
  cancelado_em DATETIME NULL,
  criado_por BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shifts_unit (unit_id, inicio),
  INDEX idx_shifts_inicio (inicio, fim),
  CONSTRAINT fk_shifts_unit FOREIGN KEY (unit_id) REFERENCES org_units(id) ON DELETE RESTRICT,
  CONSTRAINT fk_shifts_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shift_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  shift_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  funcao VARCHAR(80) NULL,
  status ENUM('pendente','confirmado','recusado','substituido') NOT NULL DEFAULT 'pendente',
  motivo VARCHAR(255) NULL,
  substitui_id BIGINT UNSIGNED NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assign (shift_id, user_id),
  INDEX idx_assign_user (user_id, status),
  CONSTRAINT fk_assign_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
  CONSTRAINT fk_assign_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_unavailability (
  user_id BIGINT UNSIGNED NOT NULL,
  data DATE NOT NULL,
  nota VARCHAR(160) NULL,
  PRIMARY KEY (user_id, data),
  CONSTRAINT fk_unav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance (
  event_id BIGINT UNSIGNED NOT NULL,
  occurrence_date DATE NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  presente TINYINT(1) NOT NULL,
  via ENUM('manual','qr') NOT NULL DEFAULT 'manual',
  registrado_por BIGINT UNSIGNED NULL,
  registrado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, occurrence_date, user_id),
  INDEX idx_att_user (user_id),
  CONSTRAINT fk_att_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  occurrence_date DATE NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  antes TINYINT(1) NOT NULL,
  depois TINYINT(1) NOT NULL,
  motivo VARCHAR(255) NOT NULL,
  corrigido_por BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_corr_event (event_id, occurrence_date),
  CONSTRAINT fk_corr_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
