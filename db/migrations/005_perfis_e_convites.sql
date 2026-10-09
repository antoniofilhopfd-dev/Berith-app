CREATE TABLE IF NOT EXISTS member_profiles (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  telefone VARCHAR(30) NULL,
  situacao ENUM('ativo','afastado','desligado') NOT NULL DEFAULT 'ativo',
  autoriza_imagem TINYINT(1) NOT NULL DEFAULT 0,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Estruturas (e função) para as quais o convidado será vinculado quando for aprovado.
CREATE TABLE IF NOT EXISTS invitation_units (
  invitation_id BIGINT UNSIGNED NOT NULL,
  unit_id BIGINT UNSIGNED NOT NULL,
  funcao VARCHAR(80) NULL,
  PRIMARY KEY (invitation_id, unit_id),
  CONSTRAINT fk_iu_inv FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE,
  CONSTRAINT fk_iu_unit FOREIGN KEY (unit_id) REFERENCES org_units(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Liga o usuário criado ao convite que o originou (usado na aprovação).
CREATE TABLE IF NOT EXISTS user_invitation (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  invitation_id BIGINT UNSIGNED NOT NULL,
  CONSTRAINT fk_ui_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ui_inv FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
