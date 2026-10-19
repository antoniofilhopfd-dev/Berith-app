# Auditoria — 19/10/2026

Escopo: tudo o que mudou desde a entrega anterior (entrada por código, várias contas do Instagram, relatórios de desempenho, agendador, LGPD em Equipe, layout para celular). Método: revisão de código, verificações automáticas, testes e testes de caixa-preta contra o app em modo produção (local, com dados de demonstração).

## Resultado

| # | Verificação | Resultado |
|---|---|---|
| 1 | Dependências de produção (`npm audit --omit=dev`) | 0 vulnerabilidades |
| 2 | Segredos no código/histórico | só `.env.example`; nenhuma chave/token em arquivos versionados |
| 3 | SQL: interpolação em consultas | só de trechos fixos do código (colunas, filtros com `?`); nenhum valor do usuário concatenado |
| 4 | Autenticação das rotas API (10) | todas exigem sessão/segredo; a única pública (`/api/midias/publica`) exige assinatura HMAC + validade |
| 5 | Server Actions (todas) | passam por `guarded`/`requireUser`; autorização fina nos serviços |
| 6 | Autorização, caixa-preta (20 cenários: anônimo, integrante, coordenador, administrador) | 20/20 corretos (relatórios, exportações, LGPD, Equipe, Configurações) |
| 7 | Entrada por código: injeção/XSS/path no campo, força bruta | payloads recusados com a mesma mensagem; após 8 falhas o endereço é bloqueado mesmo com o código certo |
| 8 | Cabeçalhos HTTP | CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP presentes |
| 9 | Lint / tipos / testes / build | ESLint sem avisos; `tsc` limpo; 244 testes; build de produção OK |

## Achados corrigidos nesta auditoria

1. **Links e imagens vindos da Meta** eram usados nas telas sem checar o esquema. Agora só `https://` é aceito na importação e na leitura (descarta `javascript:`, `data:`, `http:`). Testes novos.
2. **Avisos do lint** (imagens externas, arquivos de configuração) resolvidos.

## Riscos residuais (aceitos ou a acompanhar)

| Risco | Detalhe | Mitigação / ação |
|---|---|---|
| Espaço do código curto | 2 letras + 4 números ≈ 5,7 milhões de combinações | limite por endereço (8/15 min), atraso crescente, bloqueio global que só barra aparelhos desconhecidos, auditoria. **Trocar um código vazado em Equipe encerra os acessos da pessoa.** Códigos escolhidos pelo administrador exigem 6–10 caracteres, com letra e número |
| Códigos visíveis em Equipe | administradores veem o código de todos | ficam cifrados no banco (AES-256-GCM, `TOKEN_ENC_KEY`); só quem gerencia a equipe vê; ações na auditoria. Quem tem a chave e o banco consegue ler: proteja ambos |
| IP do cliente atrás de proxy/CDN | o limite por endereço usa o último valor de `X-Forwarded-For` | **conferir em produção:** Configurações → Segurança → Dispositivos conectados deve mostrar o seu IP real. Se mostrar um IP fixo de proxy/CDN, o limite passa a valer para todos juntos |
| CSP com `'unsafe-inline'` em scripts | exigência do Next sem nonce | sem scripts de terceiros; `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`. Melhoria futura: nonces |
| Sem segundo fator | entrada só por código (ou e-mail/senha, se habilitado) | desligar e-mail/senha ("somente código") reduz a superfície; segundo fator fica como evolução |
| Segredos expostos em conversa | `CRON_SECRET` e senha temporária do administrador passaram pelo chat | senha já trocada; **trocar o `CRON_SECRET`** (Hostinger + comando do cron) quando conveniente |
| Tokens de Página da Meta | não expiram sozinhos; se revogados, a publicação falha com pedido de reconexão | monitorar "Registro de integração" |
| Integrações não testadas ao vivo | só o relatório mensal e a conexão foram vistos com o Instagram real; publicação, janelas 7/30/90, posts e métricas por post só contra simulação | rodar um ciclo real (publicar um post de teste, **Atualizar dados agora**) e conferir o Registro |
| Notificações e e-mail | VAPID e SMTP não configurados | opcional; sem SMTP não há envio de convites/recuperação por e-mail (links são mostrados ao administrador) |

## Operação a conferir em produção
- Agendador: "Última execução" recente sem "atrasado" (cron com o segredo correto).
- 26 migrações aplicadas em Configurações → Configurações gerais.
- Backup agendado e teste de restauração (docs/OPERACAO.md).
