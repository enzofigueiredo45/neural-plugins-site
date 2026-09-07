# Governança operacional mínima — Neural X

Versão: 1.0 — 07/09/2026. Este documento define controles; não prova direitos, receita ou compatibilidade.

## 1. Regra de lançamento

Um produto só pode receber tráfego, parceria, afiliado ou marketplace quando tiver um dossiê aprovado contendo:

1. titular/origem e direito de comercialização ou distribuição;
2. nome e edição exatos;
3. modalidade de licença e usos permitidos/proibidos;
4. forma de ativação, reinstalação e troca de computador;
5. sistemas, arquiteturas, formatos e DAWs testados;
6. método e prazo de entrega;
7. canal e SLA de suporte;
8. preço, taxas e custo variável;
9. política de reembolso aplicável;
10. responsável e data da última revisão.

Ausência de qualquer item mantém o SKU em `BLOQUEADO_PARA_ESCALA`. O produto pode continuar visível apenas com copy qualificada e sem alegações que dependam do dado ausente.

## 2. Alegações comerciais

| Permitido | Proibido sem prova |
|---|---|
| preço atual e itens realmente incluídos | “oficial”, “vitalício”, “versão X”, “vinculado à conta” |
| prazo de entrega operacional real | compatibilidade universal ou ativação garantida |
| demonstração identificada e autorizada | depoimento, número de clientes ou resultado inventado |
| comparação com critérios declarados | superioridade absoluta ou áudio A/B não pareado |
| urgência com início/fim e histórico | desconto riscado ou contagem regressiva artificial |

Qualquer dúvida sobre edição/ativação deve ser respondida com o fato conhecido e um próximo passo de verificação, nunca com ambiguidade criada para fechar a venda.

## 3. Matriz de responsabilidade

| Processo | Responsável | Aprovação | Prova mínima |
|---|---|---|---|
| Direitos e licença | Proprietário/produto | Jurídico | documento por SKU |
| Copy e conteúdo | Marketing | Produto/jurídico quando houver claim | fonte + edição + asset |
| Deploy | Engenharia | checks verdes | SHA + deployment ID |
| Pagamento e reembolso | Financeiro/operação | Proprietário | ID do provedor + estado do pedido |
| Entrega | Operação | Engenharia | pagamento confirmado + acesso correspondente |
| Métricas | Analytics | Operação | fonte, janela e definição |
| Suporte | Atendimento | Operação | chamado e resolução sem senha/código |

## 4. Cadência

- **Diária:** erros 5xx, pagamento aprovado sem pedido, pedido sem acesso, falha de e-mail e chamados críticos.
- **Semanal:** alcance, retenção, ações úteis, sessões UTM, leads, checkouts e compras; campos ausentes permanecem `NA`.
- **Quinzenal:** funil completo, motivos de perda, performance das páginas e teste criativo.
- **Mensal:** P&L por SKU, refunds/disputes, margem, capacidade de suporte e decisão de manter/pausar/escalar.

## 5. Regra de parada

Pausar promoção do SKU quando ocorrer: dúvida material de direitos; versão/ativação divergente; pagamento sem entrega recuperável; aumento de reclamação sem diagnóstico; destino/UTM incorreto; ou incapacidade de suporte. Corrigir o mecanismo antes de ampliar tráfego.

## 6. Registro de decisão

Cada mudança relevante deve registrar: data, responsável, hipótese, evidência, arquivos/sistemas alterados, risco, teste, resultado e rollback. “Publicado” não equivale a “funcionou”; “zero” não equivale a “sem dados”.
