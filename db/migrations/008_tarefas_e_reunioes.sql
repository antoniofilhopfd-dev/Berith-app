CREATE TABLE IF NOT EXISTS meetings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT UNSIGNED NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  inicio DATETIME NOT NULL,
  fim DATETIME NULL,
  local VARCHAR(160) NULL,
  pauta TEXT NULL,
  ata TEXT NULL,
  status ENUM('agendada','realizada','cancelada') NOT NULL DEFAULT 'agendada',
  criado_por BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_meet_unit (unit_id, inicio),
  CONSTRAINT fk_meet_unit FOREIGN KEY (unit_id) REFERENCES org_units(id) ON DELETE RESTRICT,
  CONSTRAINT fk_meet_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (meeting_id, user_id),
  CONSTRAINT fk_mp_meet FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  CONSTRAINT fk_mp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT UNSIGNED NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  descricao TEXT NULL,
  prazo DATE NULL,
  prioridade ENUM('baixa','media','alta') NOT NULL DEFAULT 'media',
  status ENUM('aberta','em_andamento','concluida','cancelada') NOT NULL DEFAULT 'aberta',
  responsavel_id BIGINT UNSIGNED NULL,
  meeting_id BIGINT UNSIGNED NULL,
  criado_por BIGINT UNSIGNED NOT NULL,
  concluida_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tasks_unit (unit_id, status),
  INDEX idx_tasks_resp (responsavel_id, status),
  INDEX idx_tasks_prazo (prazo),
  CONSTRAINT fk_tasks_unit FOREIGN KEY (unit_id) REFERENCES org_units(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tasks_resp FOREIGN KEY (responsavel_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_meet FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  texto VARCHAR(2000) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tc_task (task_id, criado_em),
  CONSTRAINT fk_tc_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_tc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  acao VARCHAR(40) NOT NULL,
  detalhes VARCHAR(500) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_th_task (task_id, criado_em),
  CONSTRAINT fk_th_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meeting_decisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  meeting_id BIGINT UNSIGNED NOT NULL,
  texto VARCHAR(1000) NOT NULL,
  task_id BIGINT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_md_meet (meeting_id),
  CONSTRAINT fk_md_meet FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  CONSTRAINT fk_md_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
