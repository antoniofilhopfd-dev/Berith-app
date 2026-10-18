-- Berith-app passa a ser a ferramenta do Ministério de Comunicação.
-- Perfis globais (sem escopo por estrutura). Nenhuma tabela/dado legado é removido aqui:
-- as tabelas comunitárias ficam sem uso e podem ser descartadas manualmente (scripts/limpar-legado.mjs).
INSERT IGNORE INTO roles (codigo, nome, e_global) VALUES
  ('admin', 'Administrador', 1),
  ('coordenador', 'Coordenador de Comunicação', 1),
  ('integrante', 'Integrante', 1),
  ('aprovador', 'Aprovador', 1);

-- Administrador: todos os recursos e ações.
INSERT IGNORE INTO role_permissions (role_id, recurso, acao)
SELECT r.id, rec.v, ac.v FROM roles r
JOIN (SELECT 'planejamento' v UNION ALL SELECT 'calendario' UNION ALL SELECT 'producao' UNION ALL SELECT 'aprovacao'
      UNION ALL SELECT 'publicacao' UNION ALL SELECT 'midia' UNION ALL SELECT 'relatorios' UNION ALL SELECT 'equipe'
      UNION ALL SELECT 'integracoes' UNION ALL SELECT 'configuracoes' UNION ALL SELECT 'auditoria') rec
JOIN (SELECT 'ver' v UNION ALL SELECT 'criar' UNION ALL SELECT 'editar' UNION ALL SELECT 'excluir'
      UNION ALL SELECT 'aprovar' UNION ALL SELECT 'exportar' UNION ALL SELECT 'gerir') ac
WHERE r.codigo = 'admin';

-- Coordenador: planejamento, distribuição, aprovação, agendamento, acompanhamento e relatórios.
INSERT IGNORE INTO role_permissions (role_id, recurso, acao)
SELECT r.id, p.recurso, p.acao FROM roles r JOIN (
  SELECT 'planejamento' recurso, 'ver' acao UNION ALL SELECT 'planejamento','criar' UNION ALL SELECT 'planejamento','editar' UNION ALL SELECT 'planejamento','excluir'
  UNION ALL SELECT 'calendario','ver' UNION ALL SELECT 'calendario','criar' UNION ALL SELECT 'calendario','editar'
  UNION ALL SELECT 'producao','ver' UNION ALL SELECT 'producao','criar' UNION ALL SELECT 'producao','editar' UNION ALL SELECT 'producao','excluir'
  UNION ALL SELECT 'aprovacao','ver' UNION ALL SELECT 'aprovacao','aprovar'
  UNION ALL SELECT 'publicacao','ver' UNION ALL SELECT 'publicacao','criar' UNION ALL SELECT 'publicacao','editar'
  UNION ALL SELECT 'midia','ver' UNION ALL SELECT 'midia','criar' UNION ALL SELECT 'midia','editar' UNION ALL SELECT 'midia','excluir'
  UNION ALL SELECT 'relatorios','ver' UNION ALL SELECT 'relatorios','exportar'
  UNION ALL SELECT 'equipe','ver'
  UNION ALL SELECT 'integracoes','ver'
) p WHERE r.codigo = 'coordenador';

-- Integrante: produz, envia mídias, comenta e acompanha o que foi atribuído a ele.
INSERT IGNORE INTO role_permissions (role_id, recurso, acao)
SELECT r.id, p.recurso, p.acao FROM roles r JOIN (
  SELECT 'planejamento' recurso, 'ver' acao UNION ALL SELECT 'planejamento','criar'
  UNION ALL SELECT 'calendario','ver'
  UNION ALL SELECT 'producao','ver' UNION ALL SELECT 'producao','criar' UNION ALL SELECT 'producao','editar'
  UNION ALL SELECT 'publicacao','ver'
  UNION ALL SELECT 'midia','ver' UNION ALL SELECT 'midia','criar'
) p WHERE r.codigo = 'integrante';

-- Aprovador: vê o que foi submetido, aprova ou pede ajustes.
INSERT IGNORE INTO role_permissions (role_id, recurso, acao)
SELECT r.id, p.recurso, p.acao FROM roles r JOIN (
  SELECT 'planejamento' recurso, 'ver' acao
  UNION ALL SELECT 'calendario','ver'
  UNION ALL SELECT 'producao','ver'
  UNION ALL SELECT 'aprovacao','ver' UNION ALL SELECT 'aprovacao','aprovar'
  UNION ALL SELECT 'publicacao','ver'
  UNION ALL SELECT 'midia','ver'
) p WHERE r.codigo = 'aprovador';

-- Quem era administrador geral passa a administrador; responsável por comunicação passa a coordenador.
-- Demais pessoas ficam sem perfil (negação por padrão) até o administrador atribuir um.
INSERT IGNORE INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key)
SELECT ur.user_id, (SELECT id FROM roles WHERE codigo = 'admin'), NULL, 0
FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.codigo = 'admin_geral';

INSERT IGNORE INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key)
SELECT ur.user_id, (SELECT id FROM roles WHERE codigo = 'coordenador'), NULL, 0
FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.codigo = 'resp_comunicacao';

-- Perfil que o convidado receberá quando for aprovado.
CREATE TABLE IF NOT EXISTS invitation_roles (
  invitation_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  role_codigo VARCHAR(50) NOT NULL,
  CONSTRAINT fk_irole_inv FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO settings (chave, valor) VALUES
  ('nome_ministerio', 'Ministério de Comunicação — Comunidade Católica Nova Berith'),
  ('exigir_aprovacao', '1'),
  ('hashtags_padrao', '#NovaBerith'),
  ('horarios_sugeridos', '12:00,19:00'),
  ('lembrete_prazo_horas', '24');
