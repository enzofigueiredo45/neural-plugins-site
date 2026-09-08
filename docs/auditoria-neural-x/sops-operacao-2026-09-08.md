# SOPs operacionais — Neural X — 08/09/2026

Estes procedimentos substituem os trechos não comprovados do prompt consolidado. Eles não autorizam venda antes da validação de direitos por SKU nem transformam metas em garantias.

## SOP 1 — venda e entrega

**Gate de abertura:** direitos/licenças documentados por SKU, infraestrutura de e-mail validada e compra real ponta a ponta aprovada.

1. Confirmar no provedor que o pagamento está aprovado; captura de tela do cliente, isoladamente, não comprova pagamento.
2. Reconciliar `payment_checkouts`, `orders` e identificador do provedor, mantendo um único pedido por transação.
3. Confirmar que o webhook gravou o pedido e enfileirou a comunicação antes de considerar a entrega concluída.
4. Conferir a outbox: `pending` deve evoluir para `sent`; em falha, aplicar retry previsto e investigar o motivo, sem duplicar a entrega.
5. Orientar o cliente a criar/confirmar a conta com o mesmo e-mail da compra. Tokens de verificação são de uso único e expiram em 24 horas.
6. Se o e-mail não chegar, verificar outbox e provedor, confirmar o endereço com o cliente e reenviar pelo fluxo autenticado. Nunca solicitar senha ou código.
7. Registrar tempo entre pagamento, pedido, envio e entrega. O alvo de menos de 60 segundos só vira compromisso depois do teste real aprovado.

## SOP 2 — suporte, compatibilidade e reembolso

1. Responder em até 24 horas e pedir apenas e-mail da compra, referência do pedido e descrição do problema.
2. Para instalação, usar o guia correspondente à DAW, sistema operacional, edição e produto realmente comprado.
3. Para compatibilidade ou ativação, consultar a ficha e o documento de direitos do SKU; não improvisar afirmações como “oficial”, “vincula à conta” ou formatos suportados.
4. Se não houver prova, suspender a alegação e escalar ao responsável por produto/jurídico.
5. Para pagamento aprovado sem acesso, reconciliar provedor, pedido e outbox antes de qualquer alteração manual.
6. Tratar arrependimento de compra online conforme o prazo legal de 7 dias no Brasil, sem reduzir direitos aplicáveis. Outros casos seguem a política aprovada e a análise do pedido.
7. Após estorno/disputa, reconciliar acesso e comunicação; não remover acesso com base apenas em mensagem ou captura de tela.

## SOP 3 — publicação de conteúdo

1. Registrar para cada mídia: origem, autor, autorização, escopo de edição, áudio, canais e validade.
2. Revisar gancho, legendas, zona segura, áudio, CTA, UTM e aderência da promessa à página de destino.
3. Usar “checklist gratuito” nas campanhas atuais; não prometer pack, IR, preset, compatibilidade, urgência ou prova social sem ativo/evidência real.
4. Agendar pelo Metricool quando o formato for suportado. Para Story com sticker/enquete, publicar no Instagram nativo e testar o destino em outro dispositivo.
5. Conferir publicação no horário e evitar duplicar manualmente um item já publicado automaticamente.
6. Medir após sete dias por peça e formato: alcance, visualizações, retenção disponível, salvamentos, compartilhamentos, visitas, cliques, leads e vendas confirmadas.
7. Comparar com a mediana do próprio perfil. Campos ausentes são `NA`, nunca zero.

## SOP 4 — automação de mensagens

1. Ativar somente após conexão autorizada entre Instagram profissional, Meta e a plataforma escolhida.
2. Usar apenas gatilhos suportados e de intenção clara: palavra-chave em comentário, resposta a Story ou DM recebida.
3. Não abordar automaticamente quem apenas curtiu uma publicação e não usar “qualquer comentário” como gatilho genérico.
4. Entregar uma resposta factual, curta e com opção clara de parar; não criar urgência ou benefício inexistente.
5. Revisar diariamente falhas, avisos e opt-outs; revisar semanalmente respostas, cliques e leads atribuídos.
6. Não tratar limites fixos de mensagens como proteção garantida. Reduzir ou pausar ao primeiro sinal de reclamação, bloqueio ou queda de qualidade.
7. Manter registro da versão da copy, gatilho, data de ativação e resultado para permitir rollback.

## Rotina de decisão

- Quarta-feira, 19h BRT: consolidar a janela anterior e comparar cada formato com sua própria mediana.
- Manter: desempenho consistente e promessa alinhada.
- Iterar: bom alcance com baixa ação, ou boa retenção com CTA fraco.
- Pausar: reclamações, bloqueio, alegação não comprovada ou problema de direitos.
- Escalar investimento apenas após direitos, checkout, entrega, atribuição e margem estarem comprovados.
