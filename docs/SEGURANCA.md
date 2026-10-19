# Segurança — modelo, controles e auditoria

> Nunca declaramos o sistema “completamente seguro”. Este documento separa o que foi **verificado por teste executado** do que é **risco residual** ou **não verificável** no ambiente de desenvolvimento.

## Controles implementados
| Área | Controle |
|---|---|
| Autenticação | bcrypt (custo 12); política de senha (10+ caracteres, letras e números); mensagem única para e-mail/senha errados; bloqueio por tentativas (por e-mail e por IP); troca de senha exige a atual e encerra as demais sessões; 5 erros em 15 min bloqueiam a troca |
| Sessão | token aleatório de 256 bits; só o hash no banco; cookie `__Host-` + `HttpOnly` + `Secure` + `SameSite=Lax`; validada no banco a cada requisição (suspensão/revogação valem na hora); lista e encerramento de dispositivos |
| Autorização | RBAC com 4 perfis **verificado no servidor** em cada página, Server Action e rota de API (a interface só esconde botões); negação por padrão; páginas negadas respondem **404**; integrante só edita o que criou/lhe foi atribuído; conteúdo publicado é imutável; último administrador protegido |
| CSRF | Server Actions com verificação de origem do Next + cookie SameSite; rotas de upload/push conferem `Origin`; callback OAuth usa `state` de uso único atrelado ao usuário e à rede; cron só por `Bearer` em tempo constante |
| Entrada | zod em todos os formulários; SQL 100% parametrizado (testado com payloads e curingas); saída escapada pelo React (testado XSS refletido e armazenado); datas/horas validadas; limites de tamanho |
| Uploads | tipo real pela **assinatura binária** (ignora nome e Content-Type); só JPG/PNG/WebP/MP4/MOV/WebM; limite por tipo; gravação em fluxo; SHA-256 (duplicados); nome interno aleatório; fora de `public/`; `nosniff` + CSP `sandbox` no download; Range; limitador de envios |
| Links temporários de mídia | HMAC-SHA256 + expiração (1 h) para as plataformas buscarem o arquivo; sem listagem; assinatura inválida → 404 |
| Tokens das redes | cifrados em repouso (AES-256-GCM, `TOKEN_ENC_KEY`); nunca enviados ao navegador, nunca em logs/erros (mascaramento); desconectar apaga o token; renovação automática com falha tratada |
| SSRF | o app só chama hosts fixos das plataformas; URLs devolvidas por elas (upload) exigem HTTPS e domínio da plataforma |
| Cabeçalhos | CSP restritiva (produção), HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, COOP; sem `X-Powered-By` |
| Taxa | login, troca de senha, upload (120/10 min) e exportação (20/10 min) |
| Exportações | exige permissão própria e é auditada; Excel grava texto como *string literal* (nunca fórmula); PDF sanitiza caracteres |
| Auditoria | ações sensíveis em `audit_log` sem segredos |
| Privacidade | retenção automática, exportação e anonimização por titular (`npm run lgpd`), aviso de privacidade |
| Operação | backup com checksum e restauração testada; migrações versionadas com checksum |

## Resultado da auditoria (Etapa 07)
Escopo efetivamente testado: código-fonte, dependências, banco (MariaDB 10.11), aplicação em modo produção (`next start`) em `localhost` com navegador real.

| # | Verificação | Resultado | Evidência |
|---|---|---|---|
| 1 | Dependências de produção | **Não identificado** (0 vulnerabilidades) | `npm audit --omit=dev` |
| 2 | Dependências de desenvolvimento | **Vulnerável (risco aceito)**: 5 alertas *high* em `braces`/`micromatch` (cadeia do ESLint). Não são empacotadas nem executam em produção; correção exige *downgrade* do `eslint-config-next` | `npm audit` |
| 3 | Segredos no repositório/histórico | **Não identificado** | varredura de padrões; `.env*` ignorados; nenhum `.env` no histórico |
| 4 | Análise estática | **Não identificado** (0 erros) | `eslint`, `tsc --noEmit` |
| 5 | Injeção SQL | **Não identificado** | `tests/seguranca.test.ts` (payloads em busca de publicações, mídia e auditoria) |
| 6 | XSS refletido/armazenado | **Não identificado** | e2e com `"><script>` em filtro e `<img onerror>` em título |
| 7 | IDOR / privilégios | **Corrigido** (falha encontrada na auditoria: páginas negadas devolviam erro 500 e não 404) | `tests/seguranca.test.ts`, e2e (8 rotas negadas ao integrante, 5 ao usuário sem perfil) |
| 8 | Concorrência da fila (publicação duplicada) | **Corrigido** — `GET_LOCK` em *pool* era reentrante/por sessão; agora usa conexão dedicada (`comTrava`) e reivindicação atômica por linha. Também corrigia o mesmo defeito do envio de push da versão anterior | `tests/agendamento.test.ts` |
| 9 | Path traversal em arquivos | **Não identificado** | nomes internos só hexadecimais de 32 caracteres; e2e com `..%2F..` |
| 10 | Upload malicioso | **Não identificado** | PHP/SVG/PDF/áudio/executável rejeitados pela assinatura; limites; sem sobras no disco |
| 11 | Cookies, cabeçalhos e CSP | **Não identificado** | e2e: CSP ativa sem erros no console; cookie `__Host-` HttpOnly Secure Lax |
| 12 | Força bruta de login | **Não identificado** | e2e: bloqueio após tentativas |
| 13 | Redirecionamento aberto | **Não identificado** | `safeNext` (testes herdados) |
| 14 | SSRF | **Corrigido/Não identificado**: URLs de upload devolvidas pelas plataformas agora são validadas | `tests/integracoes.test.ts` |
| 15 | Tokens em logs/erros | **Não identificado** | testes de mascaramento e de log |
| 16 | Backup/restauração | **Não identificado** (funciona; adulteração detectada) | execução real de `backup.sh`/`restaurar.sh` |
| 17 | Injeção de fórmula em exportação | **Não identificado** | `tests/relatorios.test.ts` |
| 18 | Webhooks | **Não aplicável** (não implementados) | — |
| 19 | JWT | **Não aplicável** (sessões opacas em banco) | — |
| 20 | CORS | **Não aplicável** (sem API pública cross-origin; sem cabeçalhos CORS) | — |
| 21 | Permissões de arquivos do servidor, firewall, TLS, WAF | **Não verificável** aqui (dependem da Hostinger) | — |
| 22 | Integrações com as plataformas | **Não verificável** contra APIs reais (sem credenciais) | só servidores simulados |
| 23 | Teste de carga / DoS | **Não verificável** | — |

## Riscos residuais
1. **Integrações reais não testadas** (ver `docs/INTEGRACOES.md`); qualquer divergência entre a API real e a simulação aparecerá como falha de publicação (registrada, sem efeito colateral).
2. `'unsafe-inline'` na CSP de scripts/estilos (necessário ao Next sem *nonce*): reduz a proteção contra XSS caso surja um defeito de escape; mitigado pelo escape do React e sem `dangerouslySetInnerHTML` no código.
3. Limitadores de taxa de upload/exportação são **em memória** (por instância Node). Login e troca de senha são persistidos no banco.
4. `TOKEN_ENC_KEY` perdida = redes precisam ser reconectadas; vazada junto com o banco = tokens legíveis. Guarde-a fora do banco e do repositório.
5. IP do cliente vem de `X-Forwarded-For` (último item): confirmar na Hostinger que o proxy o define.
6. Dados de demonstração (`seed-demo`) nunca devem ser usados em produção (o script se recusa com `NODE_ENV=production`).
7. Sem 2FA. Recomendado como evolução, principalmente para administradores.
