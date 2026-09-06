# Contratos e testes — Neural X

## 1. Recomendação e marketing

| Estado/ação | Recomendação solicitada | Marketing | Regra |
|---|---:|---:|---|
| Novo pedido, caixa vazia | Sim | Não | Entregar a recomendação sem criar opt-in. |
| Opt-in anterior, nova caixa vazia | Sim | Preservado | Ausência de nova marcação não revoga nem renova o histórico. |
| Descadastrado, novo pedido | Sim | Suprimido | Entrega específica permitida; promoção continua bloqueada. |
| Reconsentimento explícito | Sim | Sim | Registrar nova versão/timestamp; não apagar histórico. |
| Honeypot/CAPTCHA/validação falha | Não | Sem mudança | Resposta genérica, nenhum e-mail e nenhum evento de lead. |

Provas locais: `test/lead-storage.test.js`, `test/email.test.js`, `test/marketing-consent.test.js`, `test/purchase-flow.test.js` e `test/frontend.test.js`.

Lacuna: o envio lógico ainda não possui máquina de estados durável completa para timeout ambíguo no Resend. A tabela `email_outbox` existe no banco provável, mas o código atual não a usa. T012 e T013 permanecem bloqueados.

## 2. Confirmação de e-mail e recursos privados

| Recurso | Sem sessão | Sessão sem confirmação | Sessão confirmada |
|---|---:|---:|---:|
| Perfil/MFA | Negado | Permitido | Permitido |
| Pedidos e links | Negado | Negado | Permitido para o e-mail confirmado |
| Histórico de chamados | Negado | Negado | Permitido para o e-mail confirmado |
| Checkout | Permitido | Permitido | Permitido |

Contrato do token:

- 32 bytes aleatórios, formato base64url, hash SHA-256 armazenado.
- finalidade `verify_email`, validade de 24 horas e uso único.
- emissão nova invalida tokens anteriores ainda não usados.
- segredo no fragmento `#token`; nunca em query, analytics ou log da aplicação.
- resposta inválida é igual para token inexistente, expirado ou reutilizado.
- reenvio exige sessão autenticada e limite de requisições.

Testes: `test/account-verification.test.js`, `test/purchase-flow.test.js`, `test/frontend.test.js` e `test/signup-flow.test.js`.

Gate de produção: merge/deploy aprovado, migração aditiva, envio controlado real e verificação de que um usuário não confirmado recebe 403 sem dados privados.

## 3. Checkout e idempotência

O servidor continua sendo autoridade de preço, moeda, quantidade e catálogo. A chave Stripe é derivada de:

`sessão + janela de 5 minutos + serialização estável do payload efetivo`

Consequências:

- retry idêntico na mesma janela reutiliza a chave;
- mudança de conta, item, quantidade, destino ou atribuição muda a chave;
- a chave não inclui PII em claro;
- preço e acesso continuam fora do HTML como autoridade de cobrança.

Teste: `test/checkout-idempotency.test.js`, além da jornada de `test/purchase-flow.test.js`.

## 4. Pagamento, pedido, entrega e comunicação

Estados separados:

| Dimensão | Estados mínimos |
|---|---|
| Checkout | criado, aberto, expirado, cancelado |
| Pagamento | não pago, pendente, pago, reembolsado |
| Pedido | não registrado, registrado, acesso pronto, acesso solicitado, revogado |
| Comunicação | não tentada, não enviada, aceita pelo provedor, resultado desconhecido |

Regras verificadas localmente com provedores simulados:

- URL de sucesso sem confirmação não libera acesso.
- Webhook Stripe exige assinatura e repetição não duplica pedido.
- Mercado Pago exige assinatura/referência; pendente não vira pago.
- Reembolso Mercado Pago remove o link apresentado.
- Falha de e-mail não apaga o pedido nem muda o pagamento.

Lacunas:

- cenário nativo Stripe de cartão recusado/Pix/assinatura tardia não foi executado;
- refund/dispute Stripe não possui reconciliação completa no código;
- checkout Stripe não é persistido em `payment_checkouts`, impedindo reconciliação operacional integral;
- nenhuma compra real comprovou entrega ou inbox.

## 5. Medição e privacidade

- Eventos opcionais só disparam após consentimento de medição.
- `purchase` depende de confirmação do backend e usa `transaction_id` para deduplicação.
- URLs enviadas ao analytics retêm apenas UTMs e click IDs validados; e-mail, token, `session_id` e URL privada são removidos.
- Consentimento de marketing não equivale a consentimento de analytics.
- Parâmetros de formulário e texto livre não entram nos eventos.

Provas: `test/measurement-behavior.test.js`, `test/frontend.test.js` e `main.js`.

Lacuna: o recebimento final no GA4/Ads e a propriedade correta não foram comprovados por DebugView/relatório nativo.

## 6. Migração

A mudança proposta é aditiva: `users.email_verified_at`, `users.auth_version`, tabela `account_tokens` e índice de usuário/finalidade. Os comandos usam `IF NOT EXISTS` no PostgreSQL e toleram coluna já existente no SQLite. O banco provável já contém esses objetos e zero linhas comerciais.

Pré-condições para produção:

1. confirmar a identidade de `DATABASE_URL` por projeto/branch;
2. obter backup/restore point conforme processo do provedor;
3. validar a migração em preview isolado;
4. registrar contagens antes/depois;
5. implantar código compatível com o schema aditivo;
6. usar correção adiante em falha; não remover colunas/tokens automaticamente.

Rollback de código não desfaz a migração. A tabela e as colunas podem permanecer sem uso pelo deploy anterior.
