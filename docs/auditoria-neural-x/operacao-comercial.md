# Operação comercial — Neural X

## Atualização do funil — 07/09/2026

- `/gratis.html` está em produção com um único campo obrigatório (e-mail), consentimento de marketing separado e acesso ao checklist sem captura forçada.
- `generate_lead` continua sendo o evento lógico de aceite do backend; visualização ou clique no formulário não contam como lead.
- A política de cancelamento/reembolso está visível antes do botão de checkout.
- Speed Insights está ativo após consentimento; Clarity aguarda ID de projeto.
- Não existe ainda baseline de visitante→lead, lead→compra, AOV, CAC, margem ou ROAS. Esses campos permanecem `NA`, nunca zero por conveniência.
- O Story de 09/09 às 18h permanece sem sticker clicável no agendamento observado. A correção precisa ocorrer na interface nativa antes da publicação.

O lead magnet v1 é educacional. Nenhum IR, preset ou binário de terceiro foi redistribuído como isca.

## Oferta e prova por SKU

| SKU | Oferta observada | Preço exibido | Fato preservado | Prova ainda necessária | Estado |
|---|---|---:|---|---|---|
| `neural-x` | Coleção de 23 plugins apresentados na página | R$ 29,90 | Gojira incluído é a versão sem X | direitos de comercialização/distribuição; origem de cada arquivo; edição, modalidade de licença, ativação, reinstalação, suporte e matriz real de compatibilidade | BLOQUEADO para novas alegações |
| `fl-studio` | FL Studio identificado como edição 2026 | R$ 19,90 | nome/edição visíveis no site e preço ativo observado | direitos, edição exata do arquivo, modalidade de licença, ativação, canais oficiais/permitidos, requisitos testados | BLOQUEADO para novas alegações |
| `reaper` | REAPER identificado como edição 2026 | R$ 19,90 | nome/edição visíveis no site e preço ativo observado | direitos, edição exata do arquivo, modalidade de licença, ativação, canais oficiais/permitidos, requisitos testados | BLOQUEADO para novas alegações |

Até os documentos existirem, a copy preparada diz “confirme a modalidade de ativação antes da compra”. Nenhum SKU foi removido silenciosamente.

## Funil mensurável

`conteúdo → visita com UTM → visualização de produto → carrinho → início de checkout → pagamento confirmado → pedido → acesso → suporte`

Definições:

| Etapa | Evento/fonte | Denominador | Observação |
|---|---|---|---|
| Alcance/visualização | plataforma nativa/Metricool | por peça e janela | `null` não vira zero. |
| Sessão | GA4 após consentimento | sessões elegíveis | visita ao perfil não é sessão. |
| Lead | backend aceita pedido válido | sessões elegíveis | pedido repetido/retry não deve virar novo lead lógico. |
| Checkout | Stripe/Mercado Pago | sessões ou carrinhos elegíveis | sessão expirada não é abandono por definição. |
| Compra | provedor + backend | checkouts elegíveis | um pedido, não um item/webhook/e-mail. |
| ROAS | receita atribuível ÷ mídia paga | custo de mídia > 0 | `NA` com gasto zero. |

## Taxonomia UTM

| Canal | `utm_source` | `utm_medium` | campanha sugerida | conteúdo |
|---|---|---|---|---|
| Instagram | `instagram` | `social` | `comparacoes_202609` | `cinco_timbres_a`, `clean_cta_b`, `gojira_sem_x` |
| TikTok | `tiktok` | `social` | `comparacoes_202609` | mesmo identificador criativo |
| YouTube | `youtube` | `social` | `comparacoes_202609` | mesmo identificador criativo |

Usar UTMs apenas em links externos. Links internos não devem sobrescrever origem.

## Situação de conteúdo

- Sinal de ação: “Cinco timbres” no Instagram, com 3 salvamentos e 3 compartilhamentos.
- Sinal de atenção: “Clean”, 11,10 s médios e 38,3% acima de três segundos.
- TikTok ainda não mostrou comentários/compartilhamentos nos dados retornados.
- YouTube cresceu em visualizações e inscritos, mas sem detalhamento por vídeo pelo conector.
- “Mantra” já foi publicado em 05/09; aguardar consolidação antes de julgar.
- Agenda existente de 08 e 09/09 foi preservada. Nenhuma nova publicação foi criada.

## Três roteiros prontos para produção condicionada

Os roteiros são artefatos; não significam vídeo produzido ou publicado. O material associado foi relatado pelo proprietário como liberado com crédito a Mateus Brito, mas a prova documental e o escopo de uso por canal ainda não foram apresentados.

### R1 — Escolha pelo ouvido, 20 s

| Tempo | Cena/áudio | Texto na tela |
|---|---|---|
| 0–2 s | começar direto no primeiro timbre, sem vinheta | “Qual fica melhor na mix?” |
| 2–13 s | cinco cortes com volume percebido comparável | “1 · 2 · 3 · 4 · 5” |
| 13–17 s | reprise de 1 e 5 | “Clean ou high gain?” |
| 17–20 s | tela do catálogo, crédito discreto | “Comente o número. Versões no link do perfil.” |

Condições: mesma performance/DI, cadeia e pós-processamento declarados; sem afirmar vencedor. CTA único. Crédito em vídeo: “Fonte autorizada: Mateus Brito”, sujeito a prova.

### R2 — Clean que segura atenção, 25 s

| Tempo | Cena/áudio | Texto na tela |
|---|---|---|
| 0–3 s | trecho clean mais reconhecível | “O detalhe aparece no ataque.” |
| 3–16 s | A/B com identificação visível | “A / B — fone recomendado” |
| 16–21 s | tela do plugin/edição real | “Confira a edição e seu sistema.” |
| 21–25 s | página de produto | “Compatibilidade e ativação: link do perfil.” |

Condições: normalização transparente; sem “melhor”, “idêntico” ou compatibilidade universal.

### R3 — Gojira sem surpresa, 20 s

| Tempo | Cena/áudio | Texto na tela |
|---|---|---|
| 0–3 s | pergunta real em tela | “O Gojira do pacote é X?” |
| 3–8 s | resposta direta sobre fundo do produto | “É a versão sem X.” |
| 8–15 s | trecho sonoro identificado | “Ouça antes de decidir.” |
| 15–20 s | aviso e CTA | “Veja os 23 títulos e confirme ativação no link.” |

Condições: não insinuar edição X, ativação oficial, vínculo de conta ou direito não documentado.

## Distribuição e CTA

| Canal | Formato | CTA permitido agora | Pendência |
|---|---|---|---|
| Instagram Reels | 9:16, legendas em área segura | “link no perfil” | validar preview e crédito. |
| Instagram Stories | 9:16 | sticker de link clicável | inserção manual/nativa; URL na legenda não substitui sticker. |
| TikTok | 9:16 | perfil/link conforme elegibilidade real | confirmar se o link permanece disponível na conta. |
| YouTube Shorts | 9:16 | descrição/comentário/perfil conforme recurso | conferir Studio e métricas por vídeo. |

Frequência futura não foi fixada por benchmark genérico. Manter a agenda já criada, observar ao menos uma janela completa e decidir o próximo lote por retenção, ações úteis e sessões com UTM.

## Experimento de CTA

Hipótese: no mesmo criativo de comparação, um CTA de escolha gera mais interação, enquanto um CTA de compatibilidade pode gerar mais sessões qualificadas.

| Elemento | Variante A | Variante B |
|---|---|---|
| CTA final | “Comente 1–5 e veja as versões no perfil.” | “Confira versão e compatibilidade no perfil.” |

Manter vídeo, abertura, legenda, canal, horário e destino. Uma variável por teste. Janela definida antes da publicação, encerrada apenas após ambas as versões terem oportunidade comparável. Métrica primária: sessões UTM por alcance. Secundárias: comentários/salvamentos e início de checkout por sessão. Guardrails: reclamações de versão, destino errado, alegação incorreta e direitos.

## Recuperação de checkout — rascunho desativado

Não ativar até existir persistência/reconciliação e base consentida. Elegível somente se: checkout identificável, não teste, não pago, não reembolsado, consentimento promocional aplicável, não descadastrado/suprimido e dentro da janela aprovada. Reavaliar compra e retirada antes de cada envio. Máximo proposto: duas mensagens. Retrys usam a mesma identidade lógica. Sem desconto automático.

## Complementos, afiliados e comunidade

Permanecem bloqueados até: direito de distribuição, descrição verdadeira, preço/custo, margem após reembolso, contrato, atribuição, suporte e escolha explícita. Não redistribuir preset/IR/material gratuito de fabricante sem permissão.

## Economia

Receita observada e margem: `NA`. Os preços públicos não permitem inferir AOV, CAC, LTV ou contribuição. Dados mínimos: pedidos pagos únicos, refunds/disputes, taxas por provedor, custo de licença/entrega/suporte e horas de operação.
