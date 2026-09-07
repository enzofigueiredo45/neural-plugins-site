# Reconciliação GA4, Ads, Search Console e YouTube — 07/09/2026

Coleta autenticada e somente leitura. Horários de ferramentas Google foram apresentados em BRT.

## GA4

- Propriedade ativa: Neural X, propriedade `p220043707`.
- Últimos 7 dias no momento da coleta: 21 usuários ativos, 21 novos usuários, 46 visualizações de homepage, 10 de carrinho, 4 de produto, 5 de login, 4 de guias, 4 de suporte e 3 de criação de conta.
- Canais observados: Direct 14, Organic Social 14, Unassigned 4, Organic Search 3, Organic Shopping 3 e Paid Social 3.
- Leads qualificados e convertidos exibidos: 0 e 0.
- Teste consentido com `utm_source=teste`, `utm_medium=auditoria` e `utm_campaign=baseline`: 1 usuário ativo em tempo real; eventos `first_visit`, `page_view`, `session_start` e `storefront_view` recebidos.
- Limite da prova: a interface em tempo real confirmou a recepção dos eventos, mas não expôs a dimensão UTM no recorte consultado.
- Taxonomia real do código em produção: `generate_lead`, `begin_checkout`, `video_start` e `page_view`. Os nomes `lead_capture`, `checkout_start` e `audio_play` do prompt não correspondem à implementação. `scroll_depth_50` foi implementado nesta branch, com consentimento e deduplicação por carregamento; aguarda revisão e deploy.

## Associações

| Integração | Estado | Evidência |
|---|---|---|
| GA4 ↔ Google Ads | CONCLUÍDA | uma associação ativa; publicidade personalizada ativada desde 27/07/2026 |
| GA4 ↔ Search Console | AUSENTE | tela de associações informa que ainda não existem associações |
| Google Ads | SEM CAMPANHA ATIVA OBSERVADA | o conector operacional já havia retornado a conta sem campanha ativa; nenhuma ativação foi feita |

## Search Console

- O domínio canônico `neuralxplugins.com.br` não apareceu nas propriedades disponíveis.
- Existe a propriedade de prefixo `https://neural-plugins-site.vercel.app/`.
- Essa propriedade registrava 0 cliques, 2 páginas indexadas e nenhum dado de Core Web Vitals.
- `/sitemap.xml` foi lido em 06/09/2026, descobriu 11 páginas e apresentou 11 erros de “URL não permitido”. A causa compatível com a evidência é o sitemap apontar para o domínio canônico enquanto a propriedade cobre apenas o host Vercel.

## YouTube Studio

- 4 inscritos; crescimento de +4 nos últimos 28 dias.
- Últimos 28 dias: 2,6 mil visualizações e 3,3 horas de exibição.
- Short mais recente, no momento da coleta: 165 visualizações, 38,1% de visualização média, 1 gosto e posição 4 de 5 por visualizações.
- Conteúdos publicados exibidos no painel: aproximadamente 1,1 mil, 1 mil, 183 e 35 visualizações nos quatro vídeos listados.
- O painel inicial não apresentou impressões nem CTR de thumbnail para Shorts. Esses campos continuam sem baseline.

## Próximos passos

1. cadastrar/verificar `neuralxplugins.com.br` no Search Console;
2. submeter o sitemap na propriedade correta e aguardar recrawl;
3. associar essa propriedade ao GA4;
4. criar exploração ou relatório GA4 para validar `session_source`, `session_medium` e `session_campaign` do teste;
5. manter métricas inexistentes como `NA`, nunca como zero.
