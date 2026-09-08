# Execução do prompt consolidado — Neural X — 08/09/2026

Auditoria integral do prompt de 878 linhas contra o repositório, produção Vercel, banco Neon, Resend, Metricool e páginas públicas. Estados não observados foram mantidos como `BLOQUEADO`, `PARCIAL` ou `NA`; nenhum número foi estimado.

## Resumo executivo

- O site produtivo está online no commit `7a9d4b4`, com banco saudável e checkout Mercado Pago habilitado.
- O calendário social foi preservado: carrossel `372391450` publicado sem alteração, 20 substituições e 10 conteúdos adicionais presentes; os seis Stories continuam manuais porque exigem stickers/enquetes nativos.
- Foram criados lembretes para os seis Stories e uma rotina semanal de KPIs a partir de 16/09, 19h BRT.
- A performance já atende ao alvo: PageSpeed mobile 100/100/99 e LCP 1,1s/1,2s/1,6s para home, landing gratuita e produto principal.
- A FAQ da homepage foi alinhada localmente para dez perguntas na tela e no JSON-LD, com teste de regressão.
- O bloqueio comercial central permanece: não existem documentos de direitos/licenciamento por SKU e não houve decisão do proprietário sobre manter ou bloquear preventivamente o checkout.
- Não houve compra real nem disparo de e-mail real. Após autorização complementar do proprietário, a branch de teste Neon foi excluída e a correção da FAQ foi enviada à PR #67; o merge/deploy depende dos checks da PR.

## Frente A — pendências técnicas

| Item | Estado | Evidência observada | Próximo passo objetivo |
|---|---|---|---|
| A1 — direitos por SKU | **BLOQUEADO** | nenhum documento de cadeia de direitos, licença, edição e ativação foi fornecido | anexar contrato/licença/fatura/autorização de cada SKU e aprovar a ficha factual antes de vender ou prometer ativação |
| A2 — decisão do checkout | **AGUARDA DECISÃO** | produção retorna `mercadoPagoCheckoutEnabled=true`; o bloqueio fail-closed existe somente na branch local separada `codex/sales-gate-master-v3-20260907` | proprietário escolher explicitamente manter checkout ativo ou autorizar publicação do bloqueio preventivo |
| A3 — e-mail | **PARCIAL** | outbox e worker existem no código; banco produtivo tem 0 itens; retenção Hobby impediu provar o cron; Resend mostrou outro domínio verificado, não um domínio Neural X | confirmar `CRON_SECRET`, remetente Neural X, SPF/DKIM/DMARC e autorizar um teste real para inbox controlada |
| A4 — Search Console | **BLOQUEADO POR LOGIN** | sitemap público responde 200 com 12 URLs canônicas; autenticação chegou ao 2FA e o proprietário não autorizou prosseguir | concluir 2FA no painel, validar propriedade canônica, reenviar sitemap e associar ao GA4 |
| A5 — GA4/UTM | **PARCIAL** | código preserva UTMs e implementa eventos; a confirmação nativa no Realtime/DebugView não foi possível sem 2FA | abrir sessão consentida com UTM e conferir `view_item`, `generate_lead`, `begin_checkout` e `purchase` no GA4 |
| A6 — Clarity | **ABERTO** | `/api/public-config` retorna `clarityProjectId` vazio | criar/fornecer Project ID, configurar variável e validar sessão consentida com mascaramento de PII |
| A7 — performance | **FECHADO** | PageSpeed mobile: home 100, LCP 1,1s; `/gratis.html` 100, LCP 1,2s; produto Neural X 99, LCP 1,6s; TBT 0 e CLS 0 nas três | monitorar; otimizar o payload de cerca de 5 MB da página de produto como melhoria, não bloqueio |
| A8 — compra real | **BLOQUEADO** | Neon produtivo: 0 usuários, 0 leads, 0 pedidos, 0 pagos, 0 checkouts e 0 outbox | executar somente depois de A1 e A3, com pagamento controlado e verificação de pedido, entrega, acesso e `purchase` |
| A9 — FAQ | **PR #67 ABERTA** | dez perguntas visíveis e dez no JSON-LD; teste de paridade adicionado; branch enviada ao GitHub | aguardar checks, incorporar em `main`, verificar o deploy e validar Rich Results/Search Console |

### Correções de segurança aplicadas ao prompt

- O direito de arrependimento para compra online no Brasil foi mantido em **7 dias**, não 14.
- As campanhas apontam para o **checklist gratuito** existente; não prometem pack de IRs/presets inexistente.
- “Oficial”, vínculo a conta, formatos, ativação e compatibilidade não podem ser afirmados sem prova por SKU.
- Metas, horários e limites de DM são hipóteses de teste, não garantias de resultado ou proteção contra bloqueio.

## Frente B1 — Stories e calendário

O Metricool, marca `6820171`, está em `America/Sao_Paulo` e tem Instagram, TikTok e YouTube conectados. A releitura ao vivo confirmou:

- carrossel `372391450`: **publicado em 08/09 às 10h BRT e não alterado**;
- 20 vídeos substitutos e 10 publicações adicionais: presentes no calendário;
- seis Stories: `PENDING`, `autoPublish=false`, pois sticker/enquete devem ser inseridos no app nativo.

O prompt chamou 09/09 de “hoje”, mas em 08/09 essa publicação é **amanhã**. Foi criada uma única rotina de lembretes às 17h50 BRT para publicação manual às 18h nas datas 09/09, 16/09, 23/09, 30/09, 07/10 e 02/12. Os lembretes contêm ativo, texto, interação e UTM; qualquer oferta sazonal só será usada se existir preço e prazo reais.

## Frente B2 — perfis sociais

### Instagram `@neural_x_plugins`

Auditoria pública encontrou uma bio antiga focada em “pacotes”. Estado de conta profissional, categoria, contatos, destaques e link exigem editor nativo.

Copy segura proposta: `Plugins, DAWs e ferramentas para músicos 🎸 · Demos, guias e suporte em português · ⬇ Checklist gratuito`.

### TikTok `@neural_x_audio`

Perfil conectado ao Metricool. Tipo Business, categoria e elegibilidade do link não puderam ser confirmados no app nativo.

Copy segura proposta: `Plugins, DAWs e ferramentas para músicos 🎸 · 🎁 Checklist grátis no link ⬇`.

### YouTube

Canal conectado: `UCqRb4Nc9aO4DDCCe9ZxGlqg`. A descrição pública ainda usa texto antigo; banner, links, palavras-chave e playlists exigem YouTube Studio.

Descrição segura proposta: `Plugins, DAWs e ferramentas para músicos brasileiros. Demos, comparativos e guias práticos. Checklist gratuito: https://neuralxplugins.com.br/gratis.html`.

Nenhum perfil foi alterado porque a sessão nativa autenticada não foi concluída. Não é correto declarar essas configurações apenas a partir da página pública.

## Frente B3 — ChatbotX

**Estado: não instalado.** A instalação exige criação/conexão de conta, OAuth da Meta, permissões e confirmação do proprietário no momento da ação.

Configuração aprovada para uma futura instalação:

- gatilhos: comentário com palavra-chave, resposta a Story ou DM recebida;
- resposta: `Oi! Aqui está o checklist gratuito para escolher software musical com mais segurança: https://neuralxplugins.com.br/gratis?utm_source=instagram&utm_medium=dm&utm_campaign=checklist. Se não quiser mais mensagens, responda PARAR.`;
- não usar curtida como gatilho, “qualquer comentário”, urgência falsa ou pack inexistente;
- acompanhar opt-out, reclamações, bloqueios, cliques e leads; pausar diante de risco.

## Frente B4–B5 — funil e rotina

O funil real é `conteúdo → /gratis → checklist → e-mail opcional → recomendação/produto`. A landing preserva UTMs, pede apenas e-mail e mantém consentimento de marketing separado. A base produtiva continua zerada, portanto ainda não há conversão real para avaliar.

A sequência de cinco e-mails do prompt **não foi ativada**: depende de A3 e só pode ser enviada a quem tiver opt-in de marketing vigente. O envio solicitado do checklist não autoriza automaticamente conteúdo promocional posterior.

Foi criada uma rotina semanal para quarta-feira, 19h BRT, iniciando em 16/09. Ela consolida Metricool e contagens agregadas do Neon, usa mediana do próprio perfil, marca ausência como `NA` e impede recomendação de escala antes do fechamento de direitos.

### Baseline confirmado em 08/09

| Canal | Audiência | Visualizações | Interações observadas |
|---|---:|---:|---:|
| Instagram | 26 seguidores | 4.179 | 44 em posts + Reels |
| TikTok | 4 seguidores | 697 | 46 |
| YouTube | 4 inscritos | 2.561 | `NA` na fonte consultada |

Janela Metricool: 09/08–08/09. A campanha nova começa em 09/09; por isso o primeiro relatório de decisão válido só existe após sete dias completos.

## Frente B6 — SOPs

Foram formalizados quatro SOPs em `docs/auditoria-neural-x/sops-operacao-2026-09-08.md`:

1. venda e entrega;
2. suporte, compatibilidade e reembolso;
3. publicação de conteúdo;
4. automação de mensagens.

## Evidências técnicas adicionais

- Produção Vercel: projeto `neural-plugins-site`, deployment `READY`, commit `7a9d4b4`.
- Neon: projeto `delicate-salad-35514405`, branch produtiva `br-twilight-mouse-ackuqsu5`.
- A branch de teste `test-concorrencia-20260907-v3` (`br-rough-waterfall-acbn4ctv`) foi excluída após autorização explícita do proprietário.
- Configuração pública: reCAPTCHA vazio, Clarity vazio e Mercado Pago habilitado.
- Logs históricos mostraram erros antigos de idempotência Stripe e timeout de banco; não constituem erro novo comprovado no deployment atual.
- Acessibilidade PageSpeed ficou em 96/97; há melhoria futura para links sem nome acessível e trilha de legendas no vídeo.

## O que foi executado nesta rodada

- leitura integral e confronto do prompt;
- auditoria ao vivo de produção, deploy, banco, e-mail, calendário e métricas sociais;
- confirmação de todos os agendamentos sem tocar no carrossel protegido;
- criação dos lembretes dos seis Stories;
- criação da rotina semanal de KPIs;
- medição PageSpeed de três páginas prioritárias;
- correção local da paridade da FAQ/JSON-LD e teste de regressão;
- formalização dos SOPs e deste relatório.

### Verificação local

- `npm run check`: **116/116 testes aprovados**;
- `npm run security`: **0 vulnerabilidades**;
- `git diff --check`: sem erros de whitespace.

## Pendências finais por responsável

| Prioridade | Responsável | Ação necessária |
|---|---|---|
| P0 | proprietário/jurídico | fornecer direitos, licença, edição e ativação por SKU |
| P0 | proprietário | decidir: checkout ativo ou bloqueio preventivo |
| P0 | proprietário + dev | autorizar destinatário controlado e fechar cron, remetente/DNS e inbox |
| P1 | proprietário | concluir 2FA para Search Console, GA4 e editores sociais quando quiser retomar |
| P1 | proprietário + dev | fornecer/configurar Clarity Project ID |
| P1 | proprietário | publicar cada Story manual com sticker/enquete e testar o link |
| P1 | proprietário | autorizar conexão Meta/ChatbotX se optar pela automação |
| P2 | engenharia | aguardar os checks da PR #67, incorporar e verificar o deploy da FAQ |

## Decisões mínimas para destravar a próxima etapa

1. Anexar a documentação de direitos/licenciamento dos SKUs.
2. Escolher explicitamente entre manter o checkout ativo ou publicar o bloqueio preventivo já preparado.
3. Quando quiser concluir painéis e perfis, aprovar a autenticação de dois fatores no próprio provedor; senha e código nunca devem ser enviados no chat.
