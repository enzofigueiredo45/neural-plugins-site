# Checklist para publicar a Neural X com mais confiança

> Não coloque chaves reais do Stripe no código. A chave informada na conversa deve ser tratada como exposta: revogue/rotacione no Dashboard da Stripe antes de publicar.

## 1. Pagamentos Stripe

- Definir `STRIPE_SECRET_KEY` como variável secreta da hospedagem, nunca em HTML, JS ou Git.
- Criar um Price no Stripe para cada produto e preencher:
  - `STRIPE_PRICE_NEURAL_X`
  - `STRIPE_PRICE_FL_STUDIO`
  - `STRIPE_PRICE_REAPER`
- Configurar `SITE_URL` com o domínio final para que `success_url` e `cancel_url` apontem para produção.
- Criar webhook do Stripe para confirmar pagamento e liberar download/pedido no banco. O endpoint ainda precisa ser implementado antes de vender em produção.

## 2. Segurança e infraestrutura obrigatórias

- Definir `SESSION_SECRET` com valor longo e único.
- Configurar `REDIS_URL` para sessões e bloqueio de tentativas de login.
- Configurar `DATABASE_URL` com Postgres em produção; SQLite deve ficar apenas para desenvolvimento.
- Definir `NODE_ENV=production`.
- Ativar `RECAPTCHA_SECRET` ou solução antifraude equivalente nos formulários.
- Remover contas demo públicas com `DEMO_ACCOUNTS_ENABLED=false`.

## 3. Pontos que faziam o site parecer falso ou incompleto

- Checkout usava link placeholder em JavaScript; agora usa endpoint server-side do Stripe.
- Faltavam `robots.txt` e `sitemap.xml` para orientar rastreadores.
- Faltava página de sucesso de compra.
- As credenciais demo apareciam no login; em produção, remova demos e use fluxo real de cadastro/recuperação de senha.
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
- Testar login, carrinho, criação de sessão Stripe, cancelamento e retorno de sucesso.
- Validar sitemap, robots, Lighthouse, rich results e Search Console.
