# Checklist para publicar a Neural X com mais confiança

> Não coloque chaves reais do Stripe no código. A chave informada na conversa deve ser tratada como exposta: revogue/rotacione no Dashboard da Stripe antes de publicar.

## 1. Pagamentos Stripe

- Definir `STRIPE_SECRET_KEY` como variável secreta da hospedagem, nunca em HTML, JS ou Git.
- Criar um Price no Stripe para cada produto e preencher:
  - `STRIPE_PRICE_NEURAL_X`
  - `STRIPE_PRICE_FL_STUDIO`
  - `STRIPE_PRICE_REAPER`
- Configurar `SITE_URL` com o domínio final para que `success_url` e `cancel_url` apontem para produção.
- Criar na Stripe um webhook apontando para `https://SEU_DOMINIO/api/stripe-webhook`, selecionar `checkout.session.completed` e `checkout.session.async_payment_succeeded` e salvar o segredo como `STRIPE_WEBHOOK_SECRET` na hospedagem.

## 2. Segurança e infraestrutura obrigatórias

- Definir `SESSION_SECRET` com valor longo e único.
- Configurar `REDIS_URL` para sessões e bloqueio de tentativas de login.
- Configurar `DATABASE_URL` com Postgres em produção; SQLite deve ficar apenas para desenvolvimento.
- Definir `DATABASE_SSL=true` e manter `DATABASE_POOL_MAX=3` para limitar conexões por função serverless.
- Definir `NODE_ENV=production`.
- Para ativar reCAPTCHA v3, configurar juntos `RECAPTCHA_SECRET` e `RECAPTCHA_SITE_KEY`. Sem ambos, a proteção continua baseada em rate limit e bloqueio temporário de login.

## 3. Pontos que faziam o site parecer falso ou incompleto

- Checkout usava link placeholder em JavaScript; agora usa endpoint server-side do Stripe.
- Faltavam `robots.txt` e `sitemap.xml` para orientar rastreadores.
- Faltava página de sucesso de compra.
- O login e o cadastro agora usam fluxos reais, sem credenciais de demonstração públicas.
- Páginas de produto precisam informar licença, suporte, reembolso, CNPJ/razão social ou responsável, contato e prazo de entrega.

## 4. SEO e confiança

- Registrar domínio no Google Search Console e enviar `sitemap.xml`.
- Manter títulos e descrições únicos em cada página de produto.
- Usar dados estruturados compatíveis com o conteúdo visível da página.
- Não prometer ranking garantido: buscadores não garantem topo, mas favorecem conteúdo útil, rastreável, rápido, seguro e confiável.
- Adicionar páginas claras de contato, suporte, política de reembolso e comprovação de autorização/licença dos produtos vendidos.

## 5. Testes antes de publicar

- `npm install`
- `node --check main.js`
- `node --check server.js`
- `npm start`
- `npm test`
- Testar login, carrinho, criação de sessão Stripe, cancelamento e retorno de sucesso.
- Validar sitemap, robots, Lighthouse, rich results e Search Console.

## 6. Banco de dados e login do cliente

- Desenvolvimento local: rode `npm install` e `npm start`. Sem `DATABASE_URL`, o servidor cria `data.sqlite` e as tabelas necessárias; crie a conta pela página de cadastro.
- Produção: crie um banco Postgres no provedor escolhido e configure `DATABASE_URL` nas variáveis de ambiente.
- O login do cliente depende do backend Node ativo. Abrir `client-login.html` direto como arquivo estático ou com um servidor sem API não autentica.
- Após login, o cliente é direcionado para `client-dashboard.html`, onde vê perfil, segurança, produtos comprados e chamados.
- O portal/painel de vendedor foi removido da navegação e das rotas de login públicas.
