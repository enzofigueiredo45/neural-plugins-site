# Plano de crescimento da Neural X

Atualizado em 12 de agosto de 2026. Este plano separa fatos, hipóteses e decisões. Nenhuma campanha deve usar depoimento, escassez, parceria, economia ou garantia que não possa ser comprovada.

## Objetivo e ordem de execução

1. Entregar corretamente o que foi pago.
2. Medir o funil sem coletar dados pessoais desnecessários.
3. Reduzir dúvidas de escolha, compatibilidade, conteúdo e acesso.
4. Validar mensagem e oferta com tráfego existente.
5. Comprar tráfego somente quando a margem e o pós-venda estiverem mensuráveis.

O indicador principal é **pedidos pagos com acesso liberado**, não cliques nem checkouts abertos.

## Portões antes de escalar aquisição

- Cada Product e Price da Stripe deve ter um `store_product_id` estável.
- Cada produto precisa de uma URL HTTPS real em `PRODUCT_ACCESS_URL_*` ou de um processo assistido com prazo e responsável definidos.
- O webhook precisa registrar pagamentos de forma idempotente em um teste de ponta a ponta.
- A conta criada com o e-mail do checkout precisa enxergar o pedido correto.
- Reembolso, suporte e forma de acesso precisam estar coerentes entre página, checkout e atendimento.
- Uma compra em modo de teste deve percorrer checkout → webhook → Neon → área do cliente → acesso.

Enquanto um portão falhar, o orçamento de mídia paga permanece em validação mínima, sem escala.

## Funil mensurável

| Etapa | Evento | Pergunta respondida |
| --- | --- | --- |
| Página de produto | `view_item` | Qual produto recebe interesse qualificado? |
| Seletor por objetivo | `select_offer` | Qual necessidade leva o visitante ao produto? |
| Recomendação/lead | `generate_lead` | Qual interesse gera contato consentido? |
| Carrinho | `add_to_cart` | A proposta supera a primeira objeção de preço/valor? |
| Intenção de pagar | `begin_checkout` | O resumo e a forma de acesso estão claros? |
| Checkout criado | `checkout_created` | A integração abriu a Stripe com sucesso? |
| Pagamento | `purchase` | Quantas compras foram confirmadas sem duplicidade? |
| Uso/entrega | `access_product` | O cliente chegou ao produto comprado? |

Revisar semanalmente as quedas entre etapas por produto e origem. Não otimizar uma taxa isolada se o efeito reduzir pagamento, acesso ou margem.

## Economia da venda

- Receita líquida = receita bruta − impostos − taxas − reembolsos.
- Margem de contribuição = receita líquida − custos variáveis de entrega e suporte.
- CAC máximo de equilíbrio = margem de contribuição por novo cliente.
- CAC operacional deve ficar abaixo do máximo para preservar caixa e cobrir custos fixos.
- Payback = CAC ÷ margem de contribuição mensal atribuível ao cliente.

O site não deve exibir economia percentual sem um preço de referência real, comparável e documentado.

## Backlog de experimentos

Cada teste deve registrar hipótese, público, métrica principal, guardrails, período, resultado e decisão. Verificar instrumentação e desbalanceamento de amostra antes de interpretar o vencedor.

| Prioridade | Hipótese | Mudança | Métrica principal | Guardrails |
| --- | --- | --- | --- | --- |
| P0 | Clareza de entrega reduz abandono | Mostrar se o acesso é automático ou assistido no carrinho e na confirmação | checkout criado → pagamento | tickets, reembolsos |
| P1 | Escolher pela tarefa reduz indecisão | Seletor “timbres / beats / multipista” versus catálogo direto | `select_offer` → `view_item` | saída da página, suporte pré-venda |
| P1 | Evidência do produto reduz risco percebido | Adicionar demonstração própria, captura real e conteúdo exato | `view_item` → `add_to_cart` | desempenho, compatibilidade |
| P2 | Uma página responde melhor a cada intenção | Conteúdo comparativo para consultas reais, sem páginas duplicadas | visita orgânica → `view_item` | qualidade e indexação |
| P2 | Recuperação respeitosa traz compradores indecisos | Lembrete opt-in com produto e dúvida frequente | retorno → pagamento | descadastro, reclamações |

## Pesquisa com clientes

Usar respostas abertas de compradores e visitantes que abandonaram, com consentimento. Perguntas úteis:

- O que você estava tentando produzir ou resolver?
- O que quase impediu a compra?
- Qual informação faltou para comparar as opções?
- O que você esperava receber logo após o pagamento?
- Como você descrevia essa necessidade antes de conhecer a Neural X?

Transformar padrões recorrentes em copy e experimentos. Uma citação só vira depoimento público com permissão e identificação verificável.

## Conteúdo e aquisição

- SEO: páginas úteis sobre tarefas, compatibilidade, fluxo e comparação; dados estruturados devem refletir exatamente o conteúdo visível.
- Comunidades: responder dúvidas reais e divulgar somente onde promoção for permitida; fóruns servem para descobrir linguagem e objeções, não para fabricar prova social.
- Busca paga: separar intenção de marca, produto e problema; validar termos reais antes de ampliar correspondência e usar lances automatizados.
- Social pago: testar ângulos criativos e demonstrações reais; escalar pelo resultado econômico, não por uma regra fixa de aumento de orçamento.
- Parcerias: trabalhar com criadores somente com divulgação clara da relação comercial e rastreamento por campanha.

## Plano de lançamento em 30 dias

### Semana 1 — prova do fluxo

- Validar permissões das três pastas em uma janela anônima.
- Executar compra de teste completa e verificar o acesso no Drive.
- Publicar três demonstrações curtas e reais: timbres, beat e sessão multipista.
- Registrar dúvidas recebidas no suporte e transformá-las em FAQ.

### Semana 2 — conteúdo de intenção

- Publicar comparativo “plugins de guitarra versus DAW: o que resolve cada etapa”.
- Criar um vídeo por objetivo, sempre levando à página correspondente com UTM.
- Divulgar respostas úteis em comunidades que permitam promoção, sem spam ou identidade falsa.
- Medir `view_item`, `generate_lead`, `add_to_cart` e `begin_checkout` por origem.

### Semana 3 — mídia controlada

- Testar três ângulos: resultado musical, fluxo de trabalho e comparação de opções.
- Usar uma página e uma promessa verificável por conjunto de anúncios.
- Começar com orçamento de validação previamente limitado.
- Pausar criativos que geram cliques sem avanço no funil; não escalar somente por CTR.

### Semana 4 — retenção e indicação

- Contatar compradores para confirmar acesso e coletar objeções pós-compra.
- Solicitar avaliação apenas de clientes reais, com autorização para publicação.
- Criar conteúdo a partir das dúvidas mais frequentes.
- Calcular margem por pedido, custo por lead, conversão de lead em compra e CAC antes de aumentar orçamento.

## Segmentos e mensagens iniciais

| Segmento | Problema observado | Mensagem a testar | Destino |
| --- | --- | --- | --- |
| Guitarrista/home studio | Muitas opções de timbre e cadeia complexa | “Compare 23 ferramentas pelo tipo de som que você quer construir.” | Coleção Neural DSP |
| Beatmaker iniciante | Ideias não viram arranjos completos | “Veja um fluxo visual para sair do padrão e chegar à música.” | FL Studio |
| Produtor/gravação | Sessões pesadas e roteamento confuso | “Grave, edite e organize multipistas em um fluxo flexível.” | REAPER |

Essas mensagens são hipóteses. Só viram posicionamento permanente depois de dados do funil e entrevistas reais.

## Referências operacionais

- Stripe, fulfillment: https://docs.stripe.com/checkout/fulfillment
- Google, dados estruturados de produto: https://developers.google.com/search/docs/appearance/structured-data/product
- Google Ads, Smart Bidding: https://support.google.com/google-ads/answer/7065882
- Meta, Advantage+ Creative: https://www.facebook.com/business/help/297506218282224
- web.dev, Core Web Vitals: https://web.dev/articles/vitals
- Baymard, motivos de abandono de carrinho: https://baymard.com/lists/cart-abandonment-rate
- Stanford GSB, fundamentos de vendas: https://www.gsb.stanford.edu/insights/class-takeaways-fundamentals-effective-selling
- Harvard Business School, Jobs to Be Done: https://www.library.hbs.edu/working-knowledge/clay-christensens-milkshake-marketing
- Microsoft Research, Sample Ratio Mismatch: https://www.microsoft.com/en-us/research/publication/diagnosing-sample-ratio-mismatch-in-online-controlled-experiments-a-taxonomy-and-rules-of-thumb-for-practitioners/
