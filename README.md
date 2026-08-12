# Neural X Site

Loja Node/Express para produtos digitais da Neural X, com vitrine pública, carrinho, login, checklist de publicação e endpoint server-side para Stripe Checkout.

## Rodar localmente

```bash
npm install
npm start
```

Abra `http://127.0.0.1:4173/`.

Crie uma conta pela página de cadastro para testar o fluxo local.

## Configuração para produção

Copie `.env.example` para o painel de variáveis da hospedagem. Não commite `.env` com segredos reais.

Variáveis mínimas:

- `NODE_ENV=production`
- `SITE_URL=https://seu-dominio.com`
- `SESSION_SECRET` com valor longo e único
- `REDIS_URL` para sessões e rate limit de login
- `DATABASE_URL` com Postgres em produção; sem essa variável o servidor cria `data.sqlite` para desenvolvimento local
- `DATABASE_SSL=true` e `DATABASE_POOL_MAX=3` para uma conexão Postgres compatível com serverless
- `STRIPE_SECRET_KEY` no cofre/variáveis secretas da hospedagem; prefira uma chave restrita `rk_live_` com permissões mínimas
- `STRIPE_PRICE_NEURAL_X`, `STRIPE_PRICE_FL_STUDIO`, `STRIPE_PRICE_REAPER`
- `STRIPE_WEBHOOK_SECRET` para registrar pedidos pagos de forma idempotente
- `PRODUCT_ACCESS_URL_NEURAL_X`, `PRODUCT_ACCESS_URL_FL_STUDIO`, `PRODUCT_ACCESS_URL_REAPER` para liberar cada produto na biblioteca. Aceitam somente URLs HTTPS sem usuário ou senha embutidos; enquanto estiverem vazias, o pedido será exibido honestamente como “liberação pendente”.
- `PRODUCT_ACCESS_MODE_*` pode ser `automatic` para acesso direto ou `request` quando o cliente precisa solicitar permissão no Drive. No segundo caso, a biblioteca mostra “Solicitar acesso no Drive” e nunca afirma que o acesso já foi liberado.

Na Vercel, faça um novo deploy de produção sempre que alterar variáveis de ambiente; deployments já existentes continuam usando o conjunto anterior. Mantenha a chave live somente em Production e uma chave test separada somente em Preview.

Veja `CONFIGURACOES_PUBLICACAO.md` para a lista completa de pendências antes de vender em produção.

## Stripe

O front-end lê preços públicos em `GET /api/catalog` e envia o carrinho para `POST /api/create-checkout-session`. O servidor valida IDs, valores e modo live/test contra o catálogo da Stripe antes de criar o checkout. A página de retorno consulta `GET /api/checkout-session` antes de afirmar que o pagamento foi aprovado. Nunca coloque `sk_test`, `sk_live`, Price IDs ou URLs privadas em HTML, JS público ou arquivos versionados.

Cadastre na Stripe o webhook `POST /api/stripe-webhook` para os eventos `checkout.session.completed` e `checkout.session.async_payment_succeeded`, então salve o segredo de assinatura em `STRIPE_WEBHOOK_SECRET`. Adicione `store_product_id` (`neural-x`, `fl-studio` ou `reaper`) aos metadados dos Products e Prices. O processamento usa esse identificador estável e é idempotente por sessão/produto, continuando válido quando um Price ID for substituído.

## Liberação do produto

Cada pedido pago é registrado mesmo se a URL de acesso ainda não estiver configurada. Nesse caso, a confirmação e a área do cliente mostram “liberação pendente”, sem prometer download imediato. Quando a URL HTTPS correspondente for adicionada e um novo deploy for feito, pedidos antigos com `product_id` passam a exibir o acesso sem editar manualmente o banco. Para o modo `request`, confira o e-mail que solicitou o Drive com o pedido pago antes de aprovar.

## SEO e confiança

O projeto inclui `robots.txt`, `sitemap.xml`, metadados básicos, políticas públicas e checklist de publicação. Antes de publicar, configure domínio próprio, Search Console, contato/suporte, política de reembolso, comprovação de licença/autorização dos produtos e webhook do Stripe para liberação automática dos pedidos.

## Testes úteis

```bash
node --check main.js
node --check server.js
npm test
npm audit --audit-level=high
npm start
```
