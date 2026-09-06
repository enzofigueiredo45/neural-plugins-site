# Evidências sanitizadas — Neural X

Coleta encerrada em 06/09/2026 08:29 BRT. Este arquivo não contém e-mails, tokens, cookies, chaves, URLs privadas de acesso nem strings de conexão.

## Baseline e leitura

- `CONFIRMADO_AGORA`: o prompt de execução possui 1.009 linhas e foi lido integralmente.
- `CONFIRMADO_AGORA`: o relatório-base possui 561 linhas e foi lido integralmente.
- Repositório: `enzofigueiredo45/neural-plugins-site`.
- Branch de trabalho: `audit/execution-20260906`, criada limpa a partir de `origin/main`.
- Commit inicial: `d21c509fbec3d18952566aecce80c42e378b2d9b`.
- Árvore inicial: `f085cad64073b2e929f6b2177b754f724ede6f89`.
- Nenhum `AGENTS.md` foi encontrado. `README.md` e `README_SECURITY.md` foram lidos.
- Runtime: Node `v24.19.0`, npm `11.9.0`, Git `2.51.1`.

## Validação local

### Antes das mudanças

- `npm run check`: 96 aprovados, 0 falhas, 0 ignorados.
- `npm run security`: 0 vulnerabilidades no limite `high`.
- `git diff --check`: sem erro.

### Depois das mudanças

- `npm run check`: 102 aprovados, 0 falhas, 0 ignorados; duração do runner 1,73 s após os testes de posse de e-mail, idempotência de checkout e restauração da identificação solicitada pelo proprietário.
- `npm run security`: 0 vulnerabilidades encontradas no limite `high`.
- `git diff --check`: sem erro.
- O fluxo HTTP local serviu `/verify-email.html` com status 200, `Content-Security-Policy`, `Referrer-Policy: no-referrer`, `noindex,nofollow` e token previsto no fragmento da URL.
- O servidor local usou SQLite temporário, chaves fictícias e nenhuma integração externa; `/api/health` indicou banco `ok`, Stripe indisponível e e-mail/Mercado Pago opcionais.
- Teste de jornada sintética cobre: cadastro, negação da biblioteca antes da confirmação, token expirado, inválido e reutilizado, confirmação válida, suporte, Stripe simulado, webhook assinado, Mercado Pago simulado, acesso e revogação.

## Código e divergências encontradas

### Idempotência Stripe

- `CONFIRMADO_AGORA`: 16 erros históricos `StripeIdempotencyError` ocorreram em deploy anterior, com última ocorrência em 02/09/2026 00:22 UTC.
- O código inicial calculava a chave apenas com sessão, itens e janela de cinco minutos, enquanto o payload também variava por conta e atribuição. Reutilizar a chave com payload diferente explica o erro observado.
- Correção local: `lib/checkout-idempotency.js` serializa de forma estável o payload efetivo; o hash inclui sessão, janela e payload completo. Payload idêntico reutiliza a chave; payload alterado recebe outra.
- O deploy atual não retornou erros no recorte de sete dias, mas só havia dois logs HTTP 200 no agrupamento consultado; isso não prova volume nem ausência global de falhas.

### Posse do e-mail

- `CONFIRMADO_AGORA`: o cadastro inicial autenticava imediatamente e `/api/orders`/`/api/support-tickets` usavam apenas o e-mail da sessão; não havia confirmação de propriedade antes de expor recursos privados.
- Correção local: tokens opacos aleatórios, hash no banco, expiração em 24 horas, uso único, reenvio limitado e bloqueio de pedidos/chamados até confirmação.
- O token viaja no fragmento `#token`, que não é enviado ao servidor; a página remove o fragmento do histórico e os eventos de medição já sanitizam URLs.
- A resposta do backend e os logs não incluem o token.

### Alegações de ativação

- `CONFIRMADO_AGORA`: site, catálogo, e-mail e checkout afirmavam ativação simples e vínculo ao computador sem documento por SKU disponível nesta execução.
- Correção local: textos passaram a pedir confirmação da modalidade por produto/edição. O Gojira continua identificado como versão sem X.
- `BLOQUEADO`: metadados já publicados nos produtos/preços Stripe ainda incluem vínculo ao computador e só devem ser alterados após documento de produto e autorização de configuração.

### Identificação do fornecedor

- `RELATADO_06_09`: o proprietário instruiu explicitamente a preservar a identificação “Neural X Inc.”. Ela foi restaurada na página inicial, contato, termos e privacidade.
- `NAO_VERIFICADO`: esta execução não realizou conferência documental independente dessa identificação. O estado registra a origem da informação sem substituí-la por outra entidade.

## Produção Vercel

- Projeto: `neural-plugins-site`; Node 24.x.
- Deploy atual: `dpl_6ciozrQjWZRcttxkU5SHfwzfPicK`, estado `READY`, alvo `production`.
- O deploy atual aponta para o mesmo commit inicial `d21c509...` e serve `neuralxplugins.com.br` e `www.neuralxplugins.com.br`.
- A página inicial pública foi aberta e conferida. Identidade, preços apresentados, links sociais e aviso “Gojira sem X” estavam presentes; as alegações de ativação antigas ainda estavam em produção no momento da coleta.
- Um erro histórico de inicialização do banco foi visto em deploy anterior, com última ocorrência em 01/09/2026. Não foi reproduzido no deploy atual.
- Nenhum merge, deploy, rollback ou variável foi alterado nesta execução.

## Stripe — leitura agregada

- Conta conectada em modo live; nome comercial Neural X.
- 21 Checkout Sessions encontradas, todas expiradas e não pagas; quatro têm sinalização clara de teste.
- Total pago confirmado: 0. Refunds encontrados: 0. Não há compra real validando o funil.
- 7 sessões usaram o domínio canônico; 14 apontavam para URL Vercel antiga.
- Endpoint live de webhook está habilitado no domínio canônico para `checkout.session.completed` e `checkout.session.async_payment_succeeded`.
- Os três preços ativos observados foram R$ 29,90 para a coleção e R$ 19,90 para FL Studio e REAPER. Preço não é AOV, receita nem margem.
- Não houve pagamento, reembolso, exclusão de sessão ou mudança no provedor.

## Neon — leitura agregada

- Três projetos foram localizados. Só `delicate-salad-35514405`, região São Paulo e PostgreSQL 18, mostrou atividade atual e as tabelas da aplicação.
- Os outros dois estavam arquivados/inativos e não continham as tabelas comerciais correspondentes.
- No projeto ativo provável, `users`, `leads`, `orders`, `payment_checkouts`, `support_tickets`, `account_tokens` e `email_outbox` existiam.
- Contagens agregadas: 0 usuários, 0 verificados, 0 leads, 0 opt-ins ativos, 0 pedidos, 0 checkouts, 0 chamados, 0 itens de outbox e 0 tokens ativos.
- `NAO_VERIFICADO`: nenhuma ferramenta disponível provou que a variável `DATABASE_URL` do deploy atual aponta exatamente para esse projeto/branch. As contagens não são tratadas como total oficial do negócio.
- Nenhuma consulta de escrita, branch, migração ou restauração foi executada.

## Metricool e canais sociais

Marca observada: `neural_x_plugins`, fuso America/Sao_Paulo. Conexões: Instagram `neural_x_plugins`, TikTok `neural_x_audio`, YouTube e Google Ads `299-154-9925`.

- Instagram, 01→03/09: visualizações diárias 542→869→1.303; alcance 466→721→1.121; seguidores 3→5→8. Em 04/09: 125 visualizações, alcance 95 e 1 interação.
- Melhor ação acumulada entre os Reels disponíveis: “Cinco timbres”, 209 visualizações, alcance 179, 12 interações, 3 salvamentos e 3 compartilhamentos.
- Melhor atenção disponível: “Clean”, média de 11,10 s e 38,3% acima de três segundos.
- TikTok: quatro vídeos históricos com 164/12, 117/6, 140/9 e 126/2 em visualizações/curtidas; comentários, compartilhamentos e retenção vieram vazios.
- YouTube: 4 visualizações em 01/09, 167 em 02/09 e 1.030 em 03/09; inscritos chegaram a 4 em 05/09. Métrica por vídeo permaneceu indisponível no conector.
- Google Ads: nenhuma campanha retornada no conector; custo, clique, conversão e ROAS não puderam ser calculados.
- Conteúdo “Mantra” foi publicado em 05/09 no Instagram, TikTok e YouTube. Métricas por peça ainda não estavam consolidadas.
- Agenda preservada: carrossel Instagram em 08/09; Reels/TikTok/Short em 09/09 e Story em 09/09. Nenhum novo item foi criado nesta execução.

## Bloqueios

1. Direitos de comercialização, cadeia de licença, edição, ativação e reinstalação por SKU não foram apresentados.
2. A associação exata Vercel→Neon não foi comprovada por metadado de ambiente.
3. Inbox real do Resend, sandbox nativo de pagamentos e compra real não foram testados por falta de gate específico.
4. GA4, Search Console, Google Ads nativo e YouTube Studio não foram auditados nesta execução.
5. Áudio/binários não foram instalados nem comparados; autorização dos arquivos de terceiros existe apenas como relato do proprietário.
6. Sticker de link em Story exige edição/publicação compatível com a plataforma; uma URL em legenda não substitui o recurso.

## Limitações de inferência

- `0`, campo vazio e métrica indisponível foram mantidos distintos.
- Sessão expirada não foi classificada automaticamente como abandono comercial.
- Ausência de erro no recorte não foi tratada como disponibilidade garantida.
- Nenhuma alegação jurídica, de direitos ou de compatibilidade foi certificada.
