# Economia unitária — modelo de preenchimento

Este arquivo impede que preço público seja tratado como receita, AOV, margem ou lucro.

## Dados obrigatórios por SKU

| Campo | Neural DSP | FL Studio | REAPER |
|---|---:|---:|---:|
| Preço exibido (R$) | 29,90 | 19,90 | 19,90 |
| Pedidos pagos únicos | 0 observado | 0 observado | 0 observado |
| Receita bruta paga | 0 observado | 0 observado | 0 observado |
| Descontos reais |  |  |  |
| Reembolsos | 0 observado | 0 observado | 0 observado |
| Taxa do provedor |  |  |  |
| Impostos |  |  |  |
| Custo de direito/licença |  |  |  |
| Custo de entrega/armazenamento |  |  |  |
| Minutos de suporte por pedido |  |  |  |
| Custo do suporte |  |  |  |
| Comissão de parceiro/afiliado |  |  |  |
| Receita líquida | N/A | N/A | N/A |
| Margem de contribuição | N/A | N/A | N/A |
| Margem de contribuição % | N/A | N/A | N/A |

## Fórmulas

- `receita_liquida = receita_bruta - descontos - reembolsos - impostos`
- `custos_variaveis = taxa_provedor + custo_direito + entrega + suporte + comissoes`
- `margem_contribuicao = receita_liquida - custos_variaveis`
- `margem_contribuicao_pct = margem_contribuicao / receita_liquida`
- `CAC = gasto_incremental_de_marketing_e_vendas / novos_clientes_atribuiveis`
- `ROAS = receita_atribuida / gasto_de_midia`
- `ROAS_break_even = 1 / margem_contribuicao_pct`

Com gasto zero ou receita zero, CAC/ROAS não são interpretados como bom desempenho; são `N/A`.

## Gate financeiro para mídia paga

Antes de iniciar gasto, preencher custos e definir:

1. margem de contribuição real por SKU;
2. CAC máximo abaixo da margem disponível;
3. ROAS de equilíbrio incluindo taxas, refunds e comissões;
4. orçamento que a empresa aceita perder no teste;
5. regra de parada por gasto sem checkout/compra;
6. capacidade de entrega e suporte para a demanda projetada.

Afiliados, order bump, upsell e desconto permanecem bloqueados até esses dados existirem.
