-- Entrada por código de acesso (no lugar de e-mail + senha). Só o HMAC do código fica no banco; o código aparece uma única vez, para quem o gerou.
ALTER TABLE users ADD COLUMN acesso_hmac CHAR(64) NULL, ADD COLUMN acesso_gerado_em DATETIME NULL, ADD UNIQUE KEY uq_users_acesso (acesso_hmac);
-- 'ambos' = código e (escondido) e-mail/senha; 'codigo' = só código. Começa em 'ambos' para ninguém ficar sem acesso até receber o código.
INSERT IGNORE INTO settings (chave, valor) VALUES ('login_modo', 'ambos');
