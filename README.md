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

Na Vercel, faça um novo deploy de produção sempre que alterar variáveis de ambiente; deployments já existentes continuam usando o conjunto anterior.

Veja `CONFIGURACOES_PUBLICACAO.md` para a lista completa de pendências antes de vender em produção.

## Stripe

O front-end envia o carrinho para `POST /api/create-checkout-session`. O servidor valida os IDs dos produtos contra uma lista permitida e usa os Price IDs configurados por variável de ambiente. A página de retorno consulta `GET /api/checkout-session` antes de afirmar que o pagamento foi aprovado. Nunca coloque `sk_test` ou `sk_live` em HTML, JS público ou arquivos versionados.

Cadastre na Stripe o webhook `POST /api/stripe-webhook` para os eventos `checkout.session.completed` e `checkout.session.async_payment_succeeded`, então salve o segredo de assinatura em `STRIPE_WEBHOOK_SECRET`. O processamento é idempotente por sessão e preço, evitando pedidos duplicados quando a Stripe reenvia eventos.

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
