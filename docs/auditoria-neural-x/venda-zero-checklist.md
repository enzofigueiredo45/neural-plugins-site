# Checklist da venda zero — Neural X

Objetivo: provar que um comprador consegue pagar, receber e recuperar o acesso sem criar estado financeiro ou analítico falso.

## Gate A — antes do teste

- [ ] Dossiê do SKU aprovado ou SKU explicitamente limitado a teste interno sem divulgação.
- [ ] Ambiente identificado: `sandbox`/teste, nunca chave live por engano.
- [ ] Banco/branch do teste identificado sem registrar a string de conexão.
- [ ] Remetente e destinatário controlados; nenhuma pessoa externa recebe mensagem.
- [ ] GA4/Ads produtivos bloqueados para eventos de teste ou marcados em propriedade separada.
- [ ] Preço, moeda, quantidade, prazo e acesso esperados registrados.
- [ ] Responsável disponível para interromper o teste e reconciliar resíduos.

## Gate B — jornada de pagamento

| Etapa | Ação | Prova sanitizada | Critério |
|---:|---|---|---|
| 1 | Abrir produto e adicionar ao carrinho | SKU/edição/preço visíveis | item correto |
| 2 | Iniciar checkout | ID interno/horário, sem segredo | preço/moeda corretos |
| 3 | Concluir pagamento sandbox | estado do provedor | `paid`/equivalente apenas após confirmação |
| 4 | Receber webhook | event type + resultado | assinatura válida, retry idempotente |
| 5 | Registrar pedido | ID interno e SKU | um pagamento = um pedido |
| 6 | Entregar acesso | tipo de acesso e tempo | acesso correto e recuperável |
| 7 | Receber e-mail | aceito/entregue/inbox | sem token/URL privada em logs |
| 8 | Abrir área do cliente | conta confirmada | somente dono do e-mail vê pedido |

## Gate C — falhas obrigatórias

- [ ] Repetir o mesmo webhook: não duplica pedido, acesso ou e-mail lógico.
- [ ] Abrir URL de sucesso sem pagamento: não libera acesso.
- [ ] Cancelar checkout: carrinho permanece e nenhuma compra é medida.
- [ ] Usar token de confirmação expirado/reutilizado: resposta genérica e nenhum dado privado.
- [ ] Simular falha de e-mail: pedido continua recuperável na conta/suporte.
- [ ] Simular pagamento recusado/pendente: não registrar como pago.
- [ ] Simular reembolso/disputa conforme regra aprovada: estado e acesso reconciliados.

## Gate D — mensuração

- [ ] `view_item`, `add_to_cart`, `begin_checkout` e `purchase` aparecem uma vez quando elegíveis.
- [ ] `purchase` usa ID do pedido/sessão confirmado, valor e moeda corretos.
- [ ] E-mail, token, senha, URL privada e `session_id` não entram em analytics.
- [ ] UTM de origem não é sobrescrita por navegação interna.
- [ ] Evento sandbox não contamina Ads/receita de produção.

## Gate E — operação real controlada

Executar somente depois de A–D e com autorização específica do valor. Usar comprador e meio de pagamento controlados. Reconciliar: cobrança, taxa, pedido, acesso, e-mail, recibo, descriptor, eventual estorno e tempo total.

## Resultado

| Campo | Valor |
|---|---|
| Data/janela |  |
| Ambiente |  |
| SKU/edição |  |
| Provedor |  |
| Tempo pagamento→acesso |  |
| Tempo pagamento→inbox |  |
| Eventos reconciliados |  |
| Falhas encontradas |  |
| Correções/PR |  |
| Decisão | `APROVAR`, `RETESTAR` ou `BLOQUEAR` |

Não avançar para tráfego pago com resultado vazio ou `RETESTAR`.
