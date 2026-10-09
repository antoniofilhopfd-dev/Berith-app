CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  e_global TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_roles_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  recurso VARCHAR(40) NOT NULL,
  acao VARCHAR(20) NOT NULL,
  PRIMARY KEY (role_id, recurso, acao),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- scope_unit_id_key (0 = global) é mantido pela aplicação; evita duplicidade com NULL na chave única
-- sem depender de colunas geradas (sintaxe difere entre MySQL e MariaDB).
CREATE TABLE IF NOT EXISTS user_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  scope_unit_id BIGINT UNSIGNED NULL,
  scope_unit_id_key BIGINT UNSIGNED NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_roles (user_id, role_id, scope_unit_id_key),
  INDEX idx_ur_scope (scope_unit_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_scope FOREIGN KEY (scope_unit_id) REFERENCES org_units(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO roles (codigo, nome, e_global) VALUES
  ('admin_geral', 'Administrador geral', 1),
  ('coord_caminho', 'Coordenação de caminho', 0),
  ('coord_ministerio', 'Coordenação de ministério', 0),
  ('coord_grupo', 'Coordenação de grupo', 0),
  ('resp_servico', 'Responsável por serviço', 0),
  ('resp_financeiro', 'Responsável financeiro', 1),
  ('resp_comunicacao', 'Responsável por comunicação', 1);

-- Administrador geral: todos os recursos e ações.
INSERT IGNORE INTO role_permissions (role_id, recurso, acao)
SELECT r.id, rec.v, ac.v FROM roles r
JOIN (SELECT 'eventos' v UNION ALL SELECT 'membros' UNION ALL SELECT 'estruturas' UNION ALL SELECT 'comunicados'
      UNION ALL SELECT 'escalas' UNION ALL SELECT 'presencas' UNION ALL SELECT 'tarefas' UNION ALL SELECT 'reunioes'
      UNION ALL SELECT 'conteudos' UNION ALL SELECT 'midia' UNION ALL SELECT 'financeiro') rec
JOIN (SELECT 'ver' v UNION ALL SELECT 'criar' UNION ALL SELECT 'editar' UNION ALL SELECT 'excluir'
      UNION ALL SELECT 'aprovar' UNION ALL SELECT 'exportar' UNION ALL SELECT 'integrantes' UNION ALL SELECT 'permissoes') ac
WHERE r.codigo = 'admin_geral';

-- Coordenações (escopo por estrutura): tudo, exceto financeiro e gestão de permissões.
INSERT IGNORE INTO role_permissions (role_id, recurso, acao)
SELECT r.id, rec.v, ac.v FROM roles r
JOIN (SELECT 'eventos' v UNION ALL SELECT 'membros' UNION ALL SELECT 'estruturas' UNION ALL SELECT 'comunicados'
      UNION ALL SELECT 'escalas' UNION ALL SELECT 'presencas' UNION ALL SELECT 'tarefas' UNION ALL SELECT 'reunioes'
      UNION ALL SELECT 'conteudos' UNION ALL SELECT 'midia') rec
JOIN (SELECT 'ver' v UNION ALL SELECT 'criar' UNION ALL SELECT 'editar' UNION ALL SELECT 'excluir'
      UNION ALL SELECT 'aprovar' UNION ALL SELECT 'exportar' UNION ALL SELECT 'integrantes') ac
WHERE r.codigo IN ('coord_caminho', 'coord_ministerio', 'coord_grupo');

-- Responsável por serviço: apenas escalas, presenças, tarefas e eventos do próprio serviço.
INSERT IGNORE INTO role_permissions (role_id, recurso, acao)
SELECT r.id, rec.v, ac.v FROM roles r
JOIN (SELECT 'escalas' v UNION ALL SELECT 'presencas' UNION ALL SELECT 'tarefas' UNION ALL SELECT 'eventos') rec
JOIN (SELECT 'ver' v UNION ALL SELECT 'criar' UNION ALL SELECT 'editar' UNION ALL SELECT 'excluir'
      UNION ALL SELECT 'exportar' UNION ALL SELECT 'integrantes') ac
WHERE r.codigo = 'resp_servico';

-- Financeiro: independente dos demais vínculos.
INSERT IGNORE INTO role_permissions (role_id, recurso, acao)
SELECT r.id, 'financeiro', ac.v FROM roles r
JOIN (SELECT 'ver' v UNION ALL SELECT 'criar' UNION ALL SELECT 'editar' UNION ALL SELECT 'aprovar' UNION ALL SELECT 'exportar') ac
WHERE r.codigo = 'resp_financeiro';

-- Comunicação.
INSERT IGNORE INTO role_permissions (role_id, recurso, acao)
SELECT r.id, rec.v, ac.v FROM roles r
JOIN (SELECT 'comunicados' v UNION ALL SELECT 'midia' UNION ALL SELECT 'eventos') rec
JOIN (SELECT 'ver' v UNION ALL SELECT 'criar' UNION ALL SELECT 'editar' UNION ALL SELECT 'excluir') ac
WHERE r.codigo = 'resp_comunicacao';
