# Integrações com redes sociais — o que está pronto e o que depende de você

O app usa **somente as APIs oficiais** de cada plataforma. Nada é simulado: sem conta conectada, a publicação não acontece sozinha e o fluxo cai na **publicação assistida** (a pessoa publica na rede e confirma no app). Métricas só aparecem quando vêm da própria plataforma; o que a API não fornece aparece como “indisponível”.

## Estado da implementação

| Rede | Autenticação | Publicação | Métricas | Testado contra a API real? |
|---|---|---|---|---|
| Instagram | OAuth (Facebook Login) → token de Página | Post de imagem, carrossel, Reels, Stories (Content Publishing API) | alcance, curtidas, comentários, compartilhamentos, salvamentos, visualizações, seguidores | **Não** (precisa de credenciais) |
| Facebook | OAuth → token de Página | Texto, foto(s), vídeo, Reels, Stories em foto | curtidas, comentários, compartilhamentos, alcance, seguidores | **Não** |
| TikTok | OAuth (Login Kit) com renovação | Vídeo por URL (Content Posting API) | visualizações, curtidas, comentários, compartilhamentos, seguidores | **Não** |
| YouTube | OAuth Google com renovação | Upload resumível de vídeo e Shorts | visualizações, curtidas, comentários, inscritos | **Não** |

O código foi validado contra **servidores simulados** que reproduzem o formato das respostas (36 testes em `tests/integracoes.test.ts`): sequência de chamadas, parâmetros, polling, tratamento de erro, mascaramento de tokens e reconexão. **Isso não substitui um teste real**: nomes de campos, versões e limites das APIs mudam. Faça um teste com uma conta de homologação antes de depender da publicação automática.

## Relatórios: só Instagram, conta inteira

A tela e as exportações de **Relatórios** mostram apenas o Instagram (`REDES_RELATORIO` em `lib/services/relatorios.ts`). Além das publicações feitas pelo app, o agendador importa a cada ~6 h os **posts da conta inteira** (últimos 90 dias, até 60 posts; tabela `posts_externos`) com alcance, curtidas, comentários, compartilhamentos, salvamentos e visualizações que a Meta informar (o que ela não informar fica em branco). Com isso a tela mostra o **ranking de desempenho** (interações = curtidas + comentários + compartilhamentos + salvamentos), **melhor dia e horário** (só com 8+ posts; indica a confiança) e **formatos**. Testado apenas contra servidor simulado.

## O que você precisa providenciar (ações humanas)

### Meta (Instagram + Facebook)
1. Conta Instagram **profissional** (Business/Creator) vinculada a uma **Página do Facebook** que a pessoa conectada administre.
2. Criar um app em Meta for Developers (tipo Business), adicionar “Facebook Login” e os produtos de Instagram.
3. Permissões: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`. **Passam por App Review** para uso fora do modo de desenvolvimento (contas adicionadas como testadores funcionam sem revisão).
4. Cadastrar em “URIs de redirecionamento OAuth válidos”: `https://SEU-DOMINIO/api/integracoes/instagram/callback` e `.../facebook/callback` (a tela Configurações → Redes sociais mostra a URL exata).
5. Variáveis: `META_APP_ID`, `META_APP_SECRET`; opcional `META_PAGE_ID` (se administrar várias Páginas) e `META_GRAPH_VERSION` (padrão `v23.0` — confirme a versão vigente).
6. Requisitos da API: o Instagram só aceita **JPEG** para imagem; mídia precisa ser buscável por URL pública HTTPS (o app gera links temporários assinados, válidos por 1 h).

### TikTok
1. Conta em TikTok for Developers; app com **Login Kit** e **Content Posting API**.
2. A **publicação direta pública exige auditoria do app pelo TikTok**. Antes dela, o TikTok só permite vídeos privados (o app detecta e usa o que a conta permitir).
3. O domínio que serve os vídeos pode precisar ser verificado no portal (PULL_FROM_URL).
4. Redirecionamento: `https://SEU-DOMINIO/api/integracoes/tiktok/callback`. Variáveis: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`; opcional `TIKTOK_PRIVACY_LEVEL`.

### YouTube
1. Google Cloud Console: projeto com **YouTube Data API v3**, tela de consentimento OAuth e credencial “Aplicativo da Web”.
2. Vídeos enviados por projetos de API **não verificados ficam privados** até a verificação/auditoria de conformidade do Google. Cota diária limitada (o upload consome bastante).
3. Redirecionamento: `https://SEU-DOMINIO/api/integracoes/youtube/callback`. Variáveis: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; opcional `YOUTUBE_PRIVACY`.

### Para todas
- `TOKEN_ENC_KEY` (32+ caracteres): cifra os tokens no banco (AES-256-GCM). **Guarde-a**: sem ela, as redes precisam ser reconectadas.
- `APP_URL` com HTTPS e o **cron** chamando `POST /api/cron/executar` a cada 1–5 min (veja `docs/IMPLANTACAO.md`).
- Um administrador conecta cada rede em **Configurações → Redes sociais e integrações**.

## Limites conhecidos
- Webhooks das plataformas não foram implementados (a sincronização é por consulta periódica, a cada ~6 h por publicação).
- Stories em vídeo no Facebook não são publicados automaticamente (use a publicação assistida).
- Contas múltiplas por rede não são suportadas (uma conta por rede, como pede o ministério).
- Limites de requisição: o app trata HTTP 429 como falha transitória (reagenda com espera); não há controle de cota global.
