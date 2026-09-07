# Runbook e handoff — Neural X

## Atualização operacional — 07/09/2026

O estado “aguardando merge/deploy” abaixo foi superado. As PRs #60, #61 e #62 estão em produção. O SHA produtivo observado é `e27cd806b4a0d571ac1e090e1fbd23a58e64c6e0` e o deploy final está `READY`.

Próximos gates, na ordem:

1. documentar direitos, edição, licença, ativação e reinstalação por SKU;
2. confirmar Vercel→projeto/branch Neon e restore point sem registrar segredo;
3. executar `venda-zero-checklist.md` em sandbox e depois uma operação controlada autorizada;
4. comprovar remetente, SPF/DKIM, inbox e descadastro;
5. reconciliar Search Console, GA4, Ads e YouTube nas propriedades nativas;
6. configurar `CLARITY_PROJECT_ID` e verificar as primeiras sessões.

Não repetir o deploy P0. Não restaurar o fallback Pix defeituoso. Usar as seções históricas abaixo apenas como referência de rollback e critérios.

## Estado entregável

Branch local: `audit/execution-20260906`. A implementação inclui confirmação de e-mail antes de pedidos/chamados, correção da idempotência Stripe, copy de ativação condicionada a prova, testes e documentação. Não está em produção até merge/deploy autorizado e comprovado.

## Gate de preview

1. Confirmar que Preview não recebe chaves live, banco de produção, destinatários reais nem propriedade GA4/Ads de produção.
2. Criar branch PostgreSQL isolada ou banco temporário equivalente; registrar somente projeto/branch, sem URL/segredo.
3. Executar migração aditiva e `npm run check`.
4. Verificar cadastro com endereço controlado, envio real somente se aprovado, link em fragmento, token expirado/reutilizado e 403 antes da confirmação.
5. Criar checkout apenas no sandbox nativo; validar retry idêntico e payload alterado.
6. Conferir páginas prioritárias em 360×800, 768×1024 e 1440×900; teclado, foco, erro e contraste.
7. Confirmar que GA4/Ads de produção não recebeu eventos de teste.

## Gate de produção

Exige aprovação específica de merge/deploy. Antes de promover:

- checks da PR verdes;
- preview corresponde ao commit aprovado;
- associação Vercel→Neon confirmada;
- contagens sanitizadas registradas;
- remetente/domínio de e-mail verificados e suporte apto a responder;
- política comercial por SKU revisada contra documentos de direitos/licença;
- responsáveis de suporte cientes de contas ainda não confirmadas;
- não alterar recuperação, orçamento, anúncios ou produtos Stripe no mesmo deploy.

Após promover:

1. registrar SHA, deployment ID e horário;
2. abrir homepage, três produtos, cadastro, confirmação, login e dashboard;
3. confirmar 403 sem e-mail verificado e 200 após verificação em conta controlada;
4. observar erros de aplicação e taxa HTTP por 30–60 minutos;
5. reconciliar uma operação sandbox/permitida; compra real apenas com autorização específica;
6. atualizar estados para `VALIDADO_PRODUCAO` somente com a prova correspondente.

## Migração e rollback

A migração é aditiva. Antes dela, obter restore point/backup pelo processo aprovado. Se o deploy falhar, promover o último deployment compatível. Não apagar `account_tokens`, `email_verified_at` ou dados novos automaticamente. Corrigir adiante quando o rollback de código não for suficiente.

O último deployment de produção observado foi `dpl_6ciozrQjWZRcttxkU5SHfwzfPicK`, no commit `d21c509...`. Revalidar no momento do rollback; não reutilizar o identificador às cegas.

## Reconciliação diária

| Fonte | Conferir | Alerta operacional |
|---|---|---|
| Vercel | 5xx, erros de checkout/banco/e-mail, deploy ativo | qualquer erro novo no caminho de pagamento/acesso. |
| Stripe | sessões, pagamentos, refunds, webhook | pago no provedor sem pedido/acesso no backend. |
| Mercado Pago | preferências, pagamentos, notificações | aprovado sem referência/pedido correspondente. |
| Backend/Neon | pedidos únicos, estados, links, chamados | duplicidade, acesso de reembolsado ou divergência de e-mail. |
| Resend | aceito, entregue/bounce quando disponível | pedido pago sem comunicação e sem acesso recuperável. |
| GA4/Ads | sessões UTM, lead, checkout, purchase | `purchase` sem pagamento ou valor/ID divergente. |
| Metricool/nativo | alcance, retenção, ações, cliques | crescimento de view sem sessão; campo vazio tratado como zero. |

## Suporte

- Conta sem confirmação: reenviar link pelo dashboard; não pedir senha/código.
- Link expirado/usado: gerar novo pelo botão autenticado; resposta pública permanece genérica.
- Pagamento aprovado sem acesso: confirmar provedor e referência; não marcar manualmente com base em captura de tela isolada.
- Erro de edição/ativação: suspender a alegação correspondente, consultar ficha/documento do SKU e oferecer solução compatível com a política aprovada.
- Pedido reembolsado/disputado: não remover acesso automaticamente fora da regra aprovada; registrar e reconciliar.

## Operação social

- Preservar a agenda de 08–09/09 até conciliação no Metricool e nas plataformas.
- Story com objetivo de tráfego precisa de sticker nativo; se o agendador não suportar, criar lembrete/manual e confirmar o destino antes de publicar.
- Publicar apenas asset com autor, origem, edição, autorização e escopo de canais registrados.
- Não preencher retenção ausente, não duplicar publicação nativa e não usar volume de posts como substituto de aprendizado.

## Pendências e responsáveis

| Pendência | Responsável por papel | Dado/ação mínima |
|---|---|---|
| Direitos/licença/ativação dos três SKUs | Proprietário + jurídico/produto | documento por SKU e edição. |
| Merge/deploy | Proprietário + engenharia | aprovação específica após PR/preview. |
| Vercel→Neon | DevOps | nome/escopo da variável e projeto/branch, sem valor secreto. |
| Inbox real | Operação/e-mail | destinatário controlado e aprovação de um envio. |
| Pagamentos nativos | Engenharia/financeiro | sandbox; compra/reembolso real só com autorização e valor. |
| GA4/Search Console/Ads | Analytics | propriedade correta, DebugView/diagnóstico e conversão. |
| YouTube nativo | Conteúdo/analytics | dados por Short e retenção no Studio. |
| Direitos dos vídeos | Conteúdo/jurídico | autorização escrita de Mateus Brito com canais/edições. |
| Sticker de Story | Social | inserção nativa e verificação do link. |
| Refund/dispute Stripe | Engenharia/financeiro | regra aprovada e eventos/reconciliação. |

## Três dados prioritários

1. Cadeia de direitos, edição, licença e ativação por SKU.
2. Economia real por pedido: pago, taxa, refund, custo e suporte.
3. Identidade das propriedades produtivas: Vercel→Neon e GA4/Search Console/Ads.
