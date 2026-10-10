-- Financeiro: valores SEMPRE em centavos inteiros (BIGINT). Nada é editado após aprovado; correções por estorno.
CREATE TABLE IF NOT EXISTS fin_contas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  ativa TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fin_contas_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fin_categorias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  tipo ENUM('entrada','saida') NOT NULL,
  ativa TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_fin_cat (nome, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO fin_contas (nome) VALUES ('Caixa');
INSERT IGNORE INTO fin_categorias (nome, tipo) VALUES
  ('Contribuição', 'entrada'), ('Doação', 'entrada'), ('Oferta / coleta', 'entrada'), ('Arrecadação de evento', 'entrada'),
  ('Manutenção', 'saida'), ('Material litúrgico', 'saida'), ('Alimentação', 'saida'), ('Transporte', 'saida'), ('Ajuda social', 'saida'), ('Outras despesas', 'saida');

CREATE TABLE IF NOT EXISTS fin_lancamentos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conta_id BIGINT UNSIGNED NOT NULL,
  categoria_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('entrada','saida') NOT NULL,
  valor_centavos BIGINT UNSIGNED NOT NULL,
  data DATE NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  doador_user_id BIGINT UNSIGNED NULL,
  doador_nome VARCHAR(150) NULL,
  status ENUM('pendente','aprovado','rejeitado') NOT NULL DEFAULT 'pendente',
  estorno_de BIGINT UNSIGNED NULL,
  motivo VARCHAR(255) NULL,
  criado_por BIGINT UNSIGNED NOT NULL,
  aprovado_por BIGINT UNSIGNED NULL,
  aprovado_em DATETIME NULL,
  conciliado TINYINT(1) NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fin_estorno (estorno_de),
  INDEX idx_fin_data (data),
  INDEX idx_fin_status (status, data),
  INDEX idx_fin_conta (conta_id, data),
  INDEX idx_fin_doador (doador_user_id),
  CONSTRAINT ck_fin_valor CHECK (valor_centavos > 0),
  CONSTRAINT fk_fin_conta FOREIGN KEY (conta_id) REFERENCES fin_contas(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fin_cat FOREIGN KEY (categoria_id) REFERENCES fin_categorias(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fin_estorno FOREIGN KEY (estorno_de) REFERENCES fin_lancamentos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fin_criador FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fin_periodos (
  periodo CHAR(7) NOT NULL PRIMARY KEY,
  fechado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fechado_por BIGINT UNSIGNED NOT NULL,
  saldo_final_centavos BIGINT NOT NULL,
  publicado TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_fin_per_user FOREIGN KEY (fechado_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fin_conciliacoes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conta_id BIGINT UNSIGNED NOT NULL,
  periodo CHAR(7) NOT NULL,
  saldo_extrato_centavos BIGINT NOT NULL,
  saldo_sistema_centavos BIGINT NOT NULL,
  diferenca_centavos BIGINT NOT NULL,
  conferido_por BIGINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fin_conc (conta_id, periodo),
  CONSTRAINT fk_fin_conc_conta FOREIGN KEY (conta_id) REFERENCES fin_contas(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fin_conc_user FOREIGN KEY (conferido_por) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comprovantes entram no armazenamento privado como contexto "lancamento".
ALTER TABLE files MODIFY ctx_tipo ENUM('comunicado','tarefa','conteudo','album','documento','lancamento') NOT NULL;

-- Contribuições individuais (quem doou quanto) exigem autorização ESPECÍFICA, separada do financeiro geral.
INSERT IGNORE INTO role_permissions (role_id, recurso, acao)
SELECT r.id, 'contribuicoes', ac.v FROM roles r
JOIN (SELECT 'ver' v UNION ALL SELECT 'exportar') ac
WHERE r.codigo IN ('admin_geral', 'resp_financeiro');
-- O responsável financeiro também precisa de "excluir" lógico? Não: financeiro nunca apaga lançamentos.

-- Aprovação por pessoa diferente de quem lançou (1 = exige duas pessoas). Altere para 0 só se a comunidade tiver um único responsável.
INSERT IGNORE INTO settings (chave, valor) VALUES ('financeiro_aprovacao_dupla', '1');
