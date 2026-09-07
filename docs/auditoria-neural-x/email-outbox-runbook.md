# Runbook — outbox de e-mail

Atualizado em 07/09/2026. Nunca copie segredo, token, endereço de banco ou payload descriptografado para issue, chat ou log.

## Arquitetura preparada

1. O evento de cadastro, recomendação, suporte ou confirmação de pedido grava uma linha em `email_outbox` antes da tentativa de rede.
2. O payload é criptografado com AES-256-GCM e autenticação de integridade. A chave deriva de `EMAIL_OUTBOX_SECRET`; na ausência dela, usa `SESSION_SECRET`.
3. `dedupe_key` possui unicidade no banco para impedir duplicação do mesmo evento.
4. O envio imediato tenta processar a linha persistida.
5. O endpoint `GET /api/cron/email-outbox` recupera pendências com claim concorrente, até 10 por execução.
6. Falhas voltam para fila depois de 30 minutos; a quinta falha leva o registro a `dead_letter`.

## Configuração necessária antes do deploy

- definir `CRON_SECRET` com pelo menos 32 caracteres aleatórios em Production e Preview;
- manter `SESSION_SECRET` válido ou definir um `EMAIL_OUTBOX_SECRET` independente;
- confirmar `RESEND_API_KEY`, `EMAIL_FROM` e `EMAIL_SUPPORT_TO` no ambiente correspondente;
- não trocar a chave de criptografia enquanto existirem linhas `pending`, `retry` ou `processing`, pois os payloads antigos deixariam de ser descriptografáveis.

## Frequência

O projeto está no plano Vercel Hobby, que aceita cron diário. `vercel.json` agenda a recuperação para `0 6 * * *`. A tentativa inicial continua imediata; o cron diário é uma rede de segurança. Para cumprir literalmente recuperação a cada 5 minutos, é necessário migrar para um plano que aceite essa frequência ou usar um agendador externo autenticado.

## Teste controlado após o deploy

1. Usar um destinatário próprio autorizado para o teste.
2. Gerar um evento real de checklist ou recomendação pelo site.
3. Confirmar que uma linha foi criada sem duplicação.
4. Executar o worker com o segredo apenas no header, sem imprimir seu valor:

```bash
curl --fail-with-body \
  --header "Authorization: Bearer ${NEURAL_X_CRON_SECRET}" \
  https://neuralxplugins.com.br/api/cron/email-outbox
```

5. Confirmar recebimento na caixa de entrada e transição do registro para `sent`.
6. Simular uma falha somente em Preview/branch isolada e confirmar `retry`, incremento de `attempts` e posterior `dead_letter` na quinta tentativa.

## Operação

- Monitorar apenas totais por `status`; não registrar payload nem destinatário.
- Investigar linhas `processing` com mais de 15 minutos; o worker pode recuperá-las automaticamente.
- Tratar `dead_letter` como incidente operacional e corrigir a causa antes de reprocessar.
- Validar SPF, DKIM e DMARC separadamente da aplicação.

**Estado em 07/09/2026:** código e testes locais prontos; configuração/deploy, inbox controlada e política DMARC final ainda abertos.
