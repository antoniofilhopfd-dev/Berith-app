-- O código de acesso também fica cifrado (AES-256-GCM, chave TOKEN_ENC_KEY) para quem administra a equipe poder consultá-lo e editá-lo.
ALTER TABLE users ADD COLUMN acesso_enc TEXT NULL;
